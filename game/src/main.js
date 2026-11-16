// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, blessing
// choice, paused, game over and victory.
//
// ?seed=N fixes the waves. ?shot=start|play|upgrade|over (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_EMBER, EVENT_HIT, EVENT_KILL, EVENT_MEND, EVENT_OVER, EVENT_PULSE, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import {
  ACTION_BLESS_1,
  ACTION_BLESS_2,
  ACTION_BLESS_3,
  ACTION_CONFIRM,
  ACTION_PAUSE,
  ACTION_PULSE,
  createInput,
} from './input.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WIN,
  blessingAt,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.hover);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Three hearts. Clear ten waves.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.victory();
      announce(`The grove is saved. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.gameOver();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function finishWave() {
    audio.waveClear();
    announce(`Wave ${world.state.wave} cleared. Choose a blessing.`);
  }

  /** The blessing card under the mouse, in field coordinates, or -1. */
  function hoveredBlessing() {
    const mouse = input.mouse();
    if (!mouse.inside) return -1;
    const point = renderer.toField(mouse.x, mouse.y);
    return blessingAt(point.x, point.y);
  }

  function handleActions(actions) {
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) {
        startGame();
        // The click that started the game must not also fire a pulse.
        return actions & ~ACTION_PULSE;
      }
      return actions;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_BLESS_1) world.chooseBlessing(0);
      else if (actions & ACTION_BLESS_2) world.chooseBlessing(1);
      else if (actions & ACTION_BLESS_3) world.chooseBlessing(2);
      else if (actions & ACTION_CONFIRM) {
        const hovered = hoveredBlessing();
        if (hovered >= 0) world.chooseBlessing(hovered);
        else return actions;
      } else return actions;
      if (world.state.waveState === 'wave') {
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}.`);
      }
      // The click that chose a blessing must not also fire a pulse.
      return actions & ~ACTION_PULSE;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function step(actions) {
    const move = input.direction();
    const pulse = (actions & ACTION_PULSE) !== 0;
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, false, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, move, pulse, false);
    if (events & EVENT_PULSE) audio.pulse();
    if (events & EVENT_KILL) audio.kill(world.state.combo);
    if (events & EVENT_EMBER) audio.ember();
    if (events & EVENT_MEND) audio.mend();
    if (events & EVENT_HIT) {
      audio.hit();
      announce(world.state.player.hearts === 1 ? 'Hit. 1 heart left.' : `Hit. ${world.state.player.hearts} hearts left.`);
    }
    if (events & EVENT_WAVE_CLEAR) {
      finishWave();
      screen = SCREEN_UPGRADE;
    } else if (events & EVENT_WIN) {
      endGame(true);
    } else if (events & EVENT_OVER) {
      endGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // The frame's one-shot presses are taken once and shared: the screen handler
    // takes the confirms and pauses, the world takes the pulse.
    let actions = input.takeActions();
    actions = handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, screen === SCREEN_UPGRADE ? hoveredBlessing() : -1);
  }

  // Leaving the tab pauses a running game rather than letting the gloom close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen Keep. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
