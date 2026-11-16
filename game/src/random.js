// A small seeded random number generator (mulberry32): the same seed gives the same
// game, which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from 0 (inclusive) to `max` (exclusive), from the same stream. */
export function randomInt(random, max) {
  return Math.floor(random() * max);
}

/** One element of `list`, picked from the same stream. */
export function randomPick(random, list) {
  return list[randomInt(random, list.length)];
}
