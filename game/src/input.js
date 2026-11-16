// Keyboard, mouse and pointer input. Held keys give a steering direction; one-shot
// presses (start, restart, pause, pulse, blessing choice) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and never
// counted twice. The mouse position is tracked for the blessing cards' hover state.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_PULSE = 4;
export const ACTION_BLESS_1 = 8;
export const ACTION_BLESS_2 = 16;
export const ACTION_BLESS_3 = 32;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const BLESS_KEYS = new Map([
  ['Digit1', ACTION_BLESS_1],
  ['Digit2', ACTION_BLESS_2],
  ['Digit3', ACTION_BLESS_3],
  ['Numpad1', ACTION_BLESS_1],
  ['Numpad2', ACTION_BLESS_2],
  ['Numpad3', ACTION_BLESS_3],
]);

export function createInput(canvas) {
  const held = { left: false, right: false, up: false, down: false };
  let actions = 0;
  const mouse = { x: 0, y: 0, inside: false };

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (BLESS_KEYS.has(event.code)) {
      if (!event.repeat) actions |= BLESS_KEYS.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.left = false;
    held.right = false;
    held.up = false;
    held.down = false;
  });
  // A click pulses during play and confirms on the title and end screens; the loop
  // decides which, by the screen it is on.
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    actions |= ACTION_PULSE | ACTION_CONFIRM;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.inside = true;
  });
  canvas.addEventListener('pointerleave', () => {
    mouse.inside = false;
  });

  return {
    /** -1, 0 or 1 on each axis (neither or both keys cancel out). */
    direction() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    mouse() {
      return mouse;
    },
  };
}
