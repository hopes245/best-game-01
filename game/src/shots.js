// The screenshot scenes behind ?shot=start|play|upgrade|over. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (flee the nearest gloom, chase the nearest ember, pulse when the gloom
// is in reach), so the frame is what a short game really looks like and the same
// seed always gives the same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 12;
const END_LIMIT_SECONDS = 600;

/** How close the gloom must be before the pilot runs from it. */
const FLEE_RANGE = 150;

/** Where the pilot wants to go: away from close gloom, else toward the nearest ember. */
function autopilot(state, careless) {
  const player = state.player;
  if (careless) return { x: 0, y: 0 };
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  if (nearest !== null && nearestDistance < FLEE_RANGE) {
    return { x: player.x - nearest.x, y: player.y - nearest.y };
  }
  let ember = null;
  let emberDistance = Infinity;
  for (const item of state.embers) {
    if (!item.active) continue;
    const distance = Math.hypot(item.x - player.x, item.y - player.y);
    if (distance < emberDistance) {
      emberDistance = distance;
      ember = item;
    }
  }
  if (ember !== null) return { x: ember.x - player.x, y: ember.y - player.y };
  return { x: FIELD.width / 2 - player.x, y: FIELD.height / 2 - player.y };
}

/** True when a pulse is worth firing. Restrained: only when the gloom is right on
 * the keeper, or three or more are in reach — so the frame stays crowded. */
function pulseNow(state, restrained) {
  const player = state.player;
  let inRange = 0;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distance < 55) return true;
    if (distance < player.pulseRadius + enemy.radius - 5) inRange += 1;
  }
  return restrained ? inRange >= 3 : inRange > 0;
}

/**
 * Set `world` to the named scene (start, play, upgrade or over; any other name is
 * start) and return the screen to draw over it, the best score to show, and which
 * blessing card to highlight (-1 for none).
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'over') {
    // The title's backdrop: a wave drifts in, harmless, behind the panel.
    world.startWave(1);
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0 }, false, true);
    }
    return { screen: SCREEN_TITLE, best: 0, hover: -1 };
  }
  if (name === 'upgrade') {
    // Play wave 1 until it clears, then hold on the blessing choice.
    world.startWave(1);
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, autopilot(world.state, false), pulseNow(world.state), false);
      if (events & EVENT_WAVE_CLEAR) break;
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_UPGRADE, best: world.state.score, hover: 1 };
  }
  if (name === 'over') {
    // The keeper plays well for a while — kills, embers, a real score — then
    // goes careless: no pulse, no movement, and the gloom closes in.
    world.startWave(1);
    let careless = false;
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      if (index === Math.round(15 / STEP)) careless = true;
      const events = world.step(STEP, autopilot(world.state, careless), careless ? false : pulseNow(world.state, false), false);
      if (events & EVENT_WAVE_CLEAR) world.chooseBlessing(0);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score, hover: -1 };
  }
  // Play: straight into wave 3, where wisps and darts crowd the grove, and the
  // pilot pulses only when it must — the frame stays busy.
  world.startWave(3);
  for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
    const events = world.step(STEP, autopilot(world.state, false), pulseNow(world.state, true), false);
    if (events & EVENT_WAVE_CLEAR) world.chooseBlessing(0);
    if (events & EVENT_OVER) break;
  }
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, hover: -1 };
}
