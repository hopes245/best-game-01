// The game's rules and state, with no drawing and no browser in it: the keeper, the
// gloom, the embers, the waves and the blessings between them, score, combo and
// hearts. step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (sound, shake, screen changes) without the world knowing
// about screens or sound. Pools are allocated once, at boot, and reused.

import {
  COMBO,
  EMBER,
  ENEMY,
  FIELD,
  PLAYER,
  POOL,
  PULSE,
  WAVES,
  WIN_WAVE,
  waveMix,
} from './config.js';
import { randomPick } from './random.js';

export const KIND_WISP = 'wisp';
export const KIND_DART = 'dart';
export const KIND_BULWARK = 'bulwark';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_EMBER = 4;
export const EVENT_PULSE = 8;
export const EVENT_MEND = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_OVER = 64;
export const EVENT_WIN = 128;

/** The blessings offered between waves: one of three, picked by the player. */
export const BLESSINGS = [
  {
    id: 'wide',
    name: 'Wide Halo',
    blurb: 'Your pulse reaches 35% farther.',
    apply(player) {
      player.pulseRadius *= 1.35;
    },
  },
  {
    id: 'swift',
    name: 'Swift Boots',
    blurb: 'You move 15% faster.',
    apply(player) {
      player.speed *= 1.15;
    },
  },
  {
    id: 'echo',
    name: 'Echo Pulse',
    blurb: 'Every pulse is followed by a second, weaker ring.',
    apply(player) {
      player.hasEcho = true;
    },
  },
  {
    id: 'magnet',
    name: 'Ember Magnet',
    blurb: 'Embers drift toward you from far away.',
    apply(player) {
      player.hasMagnet = true;
    },
  },
  {
    id: 'quick',
    name: 'Quickening',
    blurb: 'Your pulse recharges 22% faster.',
    apply(player) {
      player.pulseCooldown *= 0.78;
    },
  },
  {
    id: 'mend',
    name: 'Mend',
    blurb: 'Restore a heart — or grow a new one, up to five.',
    apply(player) {
      if (player.hearts < player.maxHearts) player.hearts += 1;
      else if (player.maxHearts < PLAYER.maxHearts) player.maxHearts += 1;
    },
  },
];

function circleHits(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = a.radius + b.radius;
  return dx * dx + dy * dy < reach * reach;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    radius: PLAYER.radius,
    speed: PLAYER.speed,
    hearts: PLAYER.hearts,
    maxHearts: PLAYER.hearts,
    invulnerable: 0,
    pulseRadius: PLAYER.pulseRadius,
    pulseCooldown: PLAYER.pulseCooldown,
    pulseTimer: 0,
    hasEcho: false,
    hasMagnet: false,
    face: 0,
  };
  const enemies = [];
  for (let index = 0; index < POOL.enemies; index += 1) {
    enemies.push({ active: false, kind: KIND_WISP, x: 0, y: 0, radius: 0, speed: 0, hp: 0, phase: 0, flash: 0, wobble: 0 });
  }
  const embers = [];
  for (let index = 0; index < POOL.embers; index += 1) {
    embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
  }
  const particles = [];
  for (let index = 0; index < POOL.particles; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });
  }
  const floaters = [];
  for (let index = 0; index < POOL.floaters; index += 1) {
    floaters.push({ active: false, x: 0, y: 0, text: '', life: 0 });
  }
  const rings = [];
  for (let index = 0; index < 4; index += 1) {
    rings.push({ active: false, x: 0, y: 0, radius: 0, maxRadius: 0, life: 0 });
  }
  const state = {
    player,
    enemies,
    embers,
    particles,
    floaters,
    rings,
    score: 0,
    embersBanked: 0,
    embersSinceMend: 0,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    wave: 0,
    waveState: 'ready',
    spawnQueue: [],
    spawnTimer: 0,
    offers: [],
    echoTimer: -1,
    shake: 0,
    time: 0,
  };

  function free(pool) {
    for (let index = 0; index < pool.length; index += 1) {
      if (!pool[index].active) return pool[index];
    }
    return null;
  }

  function burst(x, y, color, count, speed, size) {
    for (let index = 0; index < count; index += 1) {
      const particle = free(particles);
      if (particle === null) return;
      const angle = random() * Math.PI * 2;
      const push = speed * (0.4 + random() * 0.8);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * push;
      particle.vy = Math.sin(angle) * push;
      particle.maxLife = 0.4 + random() * 0.4;
      particle.life = particle.maxLife;
      particle.size = size * (0.6 + random() * 0.8);
      particle.color = color;
    }
  }

  function floater(x, y, text) {
    const slot = free(floaters);
    if (slot === null) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.life = 0.9;
  }

  function startRing(x, y, maxRadius) {
    const ring = free(rings);
    if (ring === null) return;
    ring.active = true;
    ring.x = x;
    ring.y = y;
    ring.radius = 8;
    ring.maxRadius = maxRadius;
    ring.life = 0.35;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.speed = PLAYER.speed;
    player.hearts = PLAYER.hearts;
    player.maxHearts = PLAYER.hearts;
    player.invulnerable = 0;
    player.pulseRadius = PLAYER.pulseRadius;
    player.pulseCooldown = PLAYER.pulseCooldown;
    player.pulseTimer = 0;
    player.hasEcho = false;
    player.hasMagnet = false;
    for (const enemy of enemies) enemy.active = false;
    for (const ember of embers) ember.active = false;
    for (const particle of particles) particle.active = false;
    for (const slot of floaters) slot.active = false;
    for (const ring of rings) ring.active = false;
    state.score = 0;
    state.embersBanked = 0;
    state.embersSinceMend = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.kills = 0;
    state.wave = 0;
    state.waveState = 'ready';
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.offers = [];
    state.echoTimer = -1;
    state.shake = 0;
    state.time = 0;
  }

  /** Build wave `number`'s spawn queue and open it. */
  function startWave(number) {
    state.wave = number;
    state.waveState = 'wave';
    const kinds = waveMix(number);
    const count = WAVES.baseCount + WAVES.perWave * number;
    const queue = [];
    for (let index = 0; index < count; index += 1) {
      // Bulwarks are rare and never first: the wave opens with wisps and darts.
      let kind = randomPick(random, kinds);
      if (kind === KIND_BULWARK && (index < 3 || random() < 0.6)) kind = randomPick(random, ['wisp', 'dart']);
      queue.push(kind);
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0.4;
  }

  function spawnEnemy(kind) {
    const enemy = free(enemies);
    if (enemy === null) return;
    const tune = ENEMY[kind];
    // Enter from a random edge, outside the keeper's lantern light.
    const side = Math.floor(random() * 4);
    if (side === 0) {
      enemy.x = random() * FIELD.width;
      enemy.y = -tune.radius - 4;
    } else if (side === 1) {
      enemy.x = random() * FIELD.width;
      enemy.y = FIELD.height + tune.radius + 4;
    } else if (side === 2) {
      enemy.x = -tune.radius - 4;
      enemy.y = random() * FIELD.height;
    } else {
      enemy.x = FIELD.width + tune.radius + 4;
      enemy.y = random() * FIELD.height;
    }
    enemy.active = true;
    enemy.kind = kind;
    enemy.radius = tune.radius;
    enemy.speed = tune.speed + tune.speedPerWave * (state.wave - 1) + random() * 12;
    enemy.hp = tune.hp;
    enemy.phase = random() * Math.PI * 2;
    enemy.flash = 0;
    enemy.wobble = 0;
  }

  function dropEmbers(x, y, count) {
    for (let index = 0; index < count; index += 1) {
      const ember = free(embers);
      if (ember === null) return;
      const angle = random() * Math.PI * 2;
      ember.active = true;
      ember.x = x;
      ember.y = y;
      ember.vx = Math.cos(angle) * (40 + random() * 90);
      ember.vy = Math.sin(angle) * (40 + random() * 90);
    }
  }

  function killEnemy(enemy) {
    enemy.active = false;
    const tune = ENEMY[enemy.kind];
    state.kills += 1;
    state.combo = Math.min(state.combo + 1, COMBO.max);
    state.comboTimer = COMBO.window;
    const gained = tune.score * Math.max(1, state.combo);
    state.score += gained;
    floater(enemy.x, enemy.y - enemy.radius, `+${gained}`);
    const color = enemy.kind === KIND_DART ? '#e5539b' : enemy.kind === KIND_BULWARK ? '#8f7bff' : '#7b5cff';
    burst(enemy.x, enemy.y, color, enemy.kind === KIND_BULWARK ? 18 : 10, 170, 4);
    burst(enemy.x, enemy.y, '#ffd166', 4, 90, 3);
    dropEmbers(enemy.x, enemy.y, tune.embers);
  }

  /** Damage everything the pulse reaches; returns how many fell. */
  function pulseHit(radius) {
    let kills = 0;
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      if (dx * dx + dy * dy > (radius + enemy.radius) * (radius + enemy.radius)) continue;
      enemy.hp -= 1;
      enemy.flash = 0.18;
      if (enemy.hp <= 0) {
        killEnemy(enemy);
        kills += 1;
      } else {
        // A bulwark that survives is shoved back hard.
        const distance = Math.max(1, Math.hypot(dx, dy));
        enemy.x += (dx / distance) * 70;
        enemy.y += (dy / distance) * 70;
        burst(enemy.x, enemy.y, '#ffffff', 4, 120, 3);
      }
    }
    return kills;
  }

  function firePulse() {
    player.pulseTimer = player.pulseCooldown;
    startRing(player.x, player.y, player.pulseRadius);
    burst(player.x, player.y, '#ffd166', 14, 260, 3);
    const kills = pulseHit(player.pulseRadius);
    if (player.hasEcho) state.echoTimer = PULSE.echoDelay;
    return kills;
  }

  /** Three distinct blessings, drawn from the seeded stream. */
  function drawOffers() {
    const pool = [...BLESSINGS];
    const offers = [];
    while (offers.length < 3 && pool.length > 0) {
      offers.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    }
    state.offers = offers;
  }

  /** Take offer `index` (0-2) and open the next wave. */
  function chooseBlessing(index) {
    const blessing = state.offers[index];
    if (!blessing) return;
    blessing.apply(player);
    state.offers = [];
    if (state.wave >= WIN_WAVE) return;
    startWave(state.wave + 1);
  }

  function stepEnemies(dt) {
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      if (enemy.flash > 0) enemy.flash = Math.max(0, enemy.flash - dt);
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      let vx = (dx / distance) * enemy.speed;
      let vy = (dy / distance) * enemy.speed;
      if (enemy.kind === KIND_DART) {
        // Darts weave side to side as they close in.
        enemy.wobble += dt * 6;
        const sway = Math.sin(enemy.wobble) * 90;
        vx += (-dy / distance) * sway;
        vy += (dx / distance) * sway;
      }
      enemy.x += vx * dt;
      enemy.y += vy * dt;
      // Drift apart so the gloom does not stack on one point.
      for (let other = index + 1; other < enemies.length; other += 1) {
        const peer = enemies[other];
        if (!peer.active) continue;
        const ox = peer.x - enemy.x;
        const oy = peer.y - enemy.y;
        const gap = enemy.radius + peer.radius;
        const squared = ox * ox + oy * oy;
        if (squared > 0.01 && squared < gap * gap) {
          const push = (gap - Math.sqrt(squared)) / 2;
          const nx = ox / Math.sqrt(squared);
          const ny = oy / Math.sqrt(squared);
          enemy.x -= nx * push;
          enemy.y -= ny * push;
          peer.x += nx * push;
          peer.y += ny * push;
        }
      }
    }
  }

  function stepEmbers(dt, events) {
    for (let index = 0; index < embers.length; index += 1) {
      const ember = embers[index];
      if (!ember.active) continue;
      const dx = player.x - ember.x;
      const dy = player.y - ember.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (player.hasMagnet && distance < EMBER.magnetRadius) {
        ember.vx += (dx / distance) * 900 * dt;
        ember.vy += (dy / distance) * 900 * dt;
      }
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
      ember.vx *= 0.92;
      ember.vy *= 0.92;
      if (distance < EMBER.pickupRadius + EMBER.radius) {
        ember.active = false;
        state.embersBanked += 1;
        state.embersSinceMend += 1;
        state.score += EMBER.score;
        burst(ember.x, ember.y, '#f2a541', 3, 60, 2);
        if (state.embersSinceMend >= EMBER.mendEvery) {
          state.embersSinceMend = 0;
          if (player.hearts < player.maxHearts) {
            player.hearts += 1;
            floater(player.x, player.y - 30, '+1 heart');
            return events | EVENT_MEND;
          }
        }
        return events | EVENT_EMBER;
      }
    }
    return events;
  }

  function stepParticles(dt) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
    }
    for (let index = 0; index < floaters.length; index += 1) {
      const floaterSlot = floaters[index];
      if (!floaterSlot.active) continue;
      floaterSlot.life -= dt;
      floaterSlot.y -= 34 * dt;
      if (floaterSlot.life <= 0) floaterSlot.active = false;
    }
    for (let index = 0; index < rings.length; index += 1) {
      const ring = rings[index];
      if (!ring.active) continue;
      ring.life -= dt;
      const progress = 1 - Math.max(0, ring.life) / 0.35;
      ring.radius = 8 + (ring.maxRadius - 8) * progress;
      if (ring.life <= 0) ring.active = false;
    }
  }

  /**
   * One fixed step. `move` is {x, y} of -1/0/1; `pulse` asks for a pulse this step.
   * With `harmless` set (the title screen's backdrop) the gloom drifts but nothing
   * touches the keeper and nothing scores.
   */
  function step(dt, move, pulse, harmless) {
    let events = 0;
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 3);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (player.pulseTimer > 0) player.pulseTimer = Math.max(0, player.pulseTimer - dt);
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // The keeper steers, and faces the way they move.
    const length = Math.hypot(move.x, move.y);
    if (length > 0) {
      player.face = Math.atan2(move.y, move.x);
      player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + (move.x / length) * player.speed * dt));
      player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + (move.y / length) * player.speed * dt));
    }

    if (pulse && player.pulseTimer === 0 && !harmless) {
      firePulse();
      events |= EVENT_PULSE;
    }
    if (state.echoTimer >= 0) {
      state.echoTimer -= dt;
      if (state.echoTimer < 0) {
        const radius = player.pulseRadius * PULSE.echoRadiusScale;
        startRing(player.x, player.y, radius);
        pulseHit(radius);
      }
    }

    if (state.waveState === 'wave') {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
        spawnEnemy(state.spawnQueue.shift());
        const interval = Math.max(
          WAVES.minSpawnInterval,
          WAVES.spawnInterval * WAVES.spawnSpeedup ** (state.wave - 1),
        );
        state.spawnTimer += interval;
      }
    }

    stepEnemies(dt);
    events = stepEmbers(dt, events);
    stepParticles(dt);

    if (!harmless && state.waveState === 'wave') {
      // A touch of gloom costs a heart — unless mercy is still running.
      for (let index = 0; index < enemies.length; index += 1) {
        const enemy = enemies[index];
        if (!enemy.active || player.invulnerable > 0) continue;
        if (!circleHits(enemy, player)) continue;
        enemy.active = false;
        player.hearts -= 1;
        player.invulnerable = PLAYER.invulnerable;
        state.combo = 0;
        state.shake = 1;
        const distance = Math.max(1, Math.hypot(player.x - enemy.x, player.y - enemy.y));
        player.x += ((player.x - enemy.x) / distance) * PLAYER.knockback * dt * 60 * 0.1;
        player.y += ((player.y - enemy.y) / distance) * PLAYER.knockback * dt * 60 * 0.1;
        player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x));
        player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y));
        burst(player.x, player.y, '#ff5d5d', 16, 220, 4);
        events |= EVENT_HIT;
        if (player.hearts <= 0) {
          state.waveState = 'over';
          return events | EVENT_OVER;
        }
        break;
      }

      // The wave is clear when the queue is empty and the field is empty.
      if (state.spawnQueue.length === 0) {
        let anyLeft = false;
        for (const enemy of enemies) {
          if (enemy.active) {
            anyLeft = true;
            break;
          }
        }
        if (!anyLeft) {
          state.score += WAVES.clearBonus * state.wave;
          if (state.wave >= WIN_WAVE) {
            state.waveState = 'won';
            return events | EVENT_WIN;
          }
          state.waveState = 'intermission';
          drawOffers();
          return events | EVENT_WAVE_CLEAR;
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, startWave, chooseBlessing };
}
