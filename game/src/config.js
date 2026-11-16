// Lumen Keep — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to fit the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Clear all ten waves and the grove is saved. */
export const WIN_WAVE = 10;

export const PLAYER = {
  radius: 16,
  speed: 300,
  hearts: 3,
  maxHearts: 5,
  /** Seconds of mercy after a hit, while the keeper blinks. */
  invulnerable: 1.5,
  pulseRadius: 115,
  pulseCooldown: 1.1,
  /** How far a hit knocks the keeper back. */
  knockback: 260,
};

export const PULSE = {
  /** A second, weaker ring follows the first when the Echo Pulse blessing is held. */
  echoDelay: 0.25,
  echoRadiusScale: 0.7,
};

export const WAVES = {
  /** Enemies in wave n: base + per-wave, before the mix below. */
  baseCount: 5,
  perWave: 3,
  /** Seconds between spawns at wave 1; each wave spawns a little faster. */
  spawnInterval: 0.85,
  spawnSpeedup: 0.94,
  minSpawnInterval: 0.22,
  /** Wave bonus score when a wave is cleared. */
  clearBonus: 100,
};

export const ENEMY = {
  wisp: { radius: 14, speed: 58, speedPerWave: 4, hp: 1, embers: 1, score: 10 },
  dart: { radius: 10, speed: 138, speedPerWave: 6, hp: 1, embers: 1, score: 15 },
  bulwark: { radius: 27, speed: 36, speedPerWave: 2, hp: 2, embers: 3, score: 30 },
};

/** Which kinds a wave may hold: darts join from wave 2, bulwarks from wave 3. */
export function waveMix(wave) {
  if (wave < 2) return ['wisp'];
  if (wave < 3) return ['wisp', 'dart'];
  return ['wisp', 'dart', 'bulwark'];
}

export const EMBER = {
  radius: 7,
  /** Score for picking one ember up. */
  score: 5,
  /** Embers banked to mend one heart. */
  mendEvery: 25,
  /** How close the keeper must be to collect one. */
  pickupRadius: 30,
  /** How far away the Ember Magnet blessing pulls from. */
  magnetRadius: 280,
};

export const COMBO = {
  /** Seconds a kill chain stays alive without another kill. */
  window: 2.5,
  max: 5,
};

/** Pool sizes: everything is allocated once, at boot, and reused. */
export const POOL = { enemies: 96, embers: 160, particles: 320, floaters: 24 };

export const PALETTE = {
  backdrop: '#0a0d1f',
  skyTop: '#131736',
  skyBottom: '#0a0d1f',
  ground: '#10142c',
  grove: '#0d1126',
  lantern: '#ffd166',
  lanternCore: '#fff3c4',
  ember: '#f2a541',
  wisp: '#7b5cff',
  wispEye: '#d8ccff',
  dart: '#e5539b',
  bulwark: '#4b3a8c',
  bulwarkEye: '#ff5d5d',
  panel: '#1a1f3d',
  panelEdge: '#3a4480',
  text: '#f2f0ff',
  muted: '#9aa3c7',
  danger: '#ff5d5d',
  heal: '#7ee787',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-keep.best';
