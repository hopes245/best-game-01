// Sound, synthesized live with WebAudio: every note is an oscillator, so the game
// ships no audio files and makes no network request. The context is created lazily
// on the first player gesture (browsers forbid sound before one); screenshot scenes
// never create it, so staging a shot stays silent.

const MASTER_GAIN = 0.16;

export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  /** One oscillator note: a pitch that slides from `from` to `to` over `seconds`. */
  function tone(from, to, seconds, type, volume, delay = 0) {
    if (!ensure()) return;
    if (context.state === 'suspended') void context.resume();
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  return {
    /** Call from any gesture handler so later sounds are allowed. */
    unlock() {
      ensure();
    },
    pulse() {
      tone(220, 55, 0.22, 'sine', 0.9);
      tone(440, 110, 0.16, 'triangle', 0.35);
    },
    kill(combo) {
      // Higher chains sing higher: the combo is audible, not just visible.
      const base = 520 + Math.min(combo, 5) * 70;
      tone(base, base * 1.5, 0.12, 'triangle', 0.5);
    },
    ember() {
      tone(880, 1320, 0.09, 'sine', 0.35);
    },
    hit() {
      tone(160, 60, 0.3, 'sawtooth', 0.8);
      tone(90, 40, 0.35, 'square', 0.4);
    },
    mend() {
      tone(523, 523, 0.12, 'sine', 0.4);
      tone(659, 659, 0.12, 'sine', 0.4, 0.1);
      tone(784, 784, 0.2, 'sine', 0.4, 0.2);
    },
    waveClear() {
      tone(392, 392, 0.12, 'triangle', 0.5);
      tone(523, 523, 0.12, 'triangle', 0.5, 0.1);
      tone(659, 659, 0.2, 'triangle', 0.5, 0.2);
    },
    gameOver() {
      tone(330, 330, 0.25, 'triangle', 0.5);
      tone(262, 262, 0.25, 'triangle', 0.5, 0.22);
      tone(196, 130, 0.5, 'triangle', 0.5, 0.44);
    },
    victory() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((note, index) => tone(note, note, 0.22, 'triangle', 0.5, index * 0.13));
      tone(1319, 1319, 0.5, 'sine', 0.35, 0.55);
    },
  };
}
