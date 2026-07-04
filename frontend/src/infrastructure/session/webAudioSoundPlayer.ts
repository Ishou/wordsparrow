import type { SoundPlayer } from '@/application/session/SoundPlayer';

interface Note {
  readonly freq: number;
  readonly start: number;
  readonly dur: number;
}

// D5 → A5 (a perfect fifth up): a small, consonant "click into place".
const WORD_NOTES: readonly Note[] = [
  { freq: 587.33, start: 0, dur: 0.12 },
  { freq: 880.0, start: 0.06, dur: 0.14 },
];

// D5 → F#5 → A5 (an ascending major triad): a warm "done" without fanfare.
const WIN_NOTES: readonly Note[] = [
  { freq: 587.33, start: 0, dur: 0.18 },
  { freq: 739.99, start: 0.12, dur: 0.18 },
  { freq: 880.0, start: 0.24, dur: 0.3 },
];

const PEAK_GAIN = 0.15;

type AudioContextCtor = new () => AudioContext;

export function createWebAudioSoundPlayer(isEnabled: () => boolean): SoundPlayer {
  let ctx: AudioContext | null = null;

  function context(): AudioContext | null {
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  }

  function play(notes: readonly Note[]): void {
    if (!isEnabled()) return;
    try {
      const ac = context();
      if (!ac) return;
      // The gesture that produced this cue also unblocks a suspended context.
      if (ac.state === 'suspended') void ac.resume();
      const now = ac.currentTime;
      for (const n of notes) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      }
    } catch {
      // Audio is decorative; never let a synthesis failure surface.
    }
  }

  return {
    playWordValidated: () => play(WORD_NOTES),
    playPuzzleSolved: () => play(WIN_NOTES),
  };
}
