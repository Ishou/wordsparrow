import type { SoundPlayer } from '@/application/session/SoundPlayer';

interface Note {
  readonly freq: number;
  readonly start: number;
  readonly dur: number;
}

// Seconds form of ui SOLVE_STAGGER_MS (45ms), synced by hand (infra can't import ui) so the pulse tracks the ripple.
const RIPPLE_STAGGER = 0.045;
// D-major pentatonic (D5 E5 F#5 A5 B5): a soft rolling run for any word length.
const PENTATONIC: readonly number[] = [587.33, 659.25, 739.99, 880.0, 987.77];

function wordPulse(cellCount: number): readonly Note[] {
  const n = Math.max(1, cellCount);
  const notes: Note[] = [];
  for (let i = 0; i < n; i++) {
    notes.push({ freq: PENTATONIC[i % PENTATONIC.length], start: i * RIPPLE_STAGGER, dur: 0.09 });
  }
  return notes;
}

// D5 → F#5 → A5 (an ascending major triad): a warm "done" without fanfare.
const WIN_NOTES: readonly Note[] = [
  { freq: 587.33, start: 0, dur: 0.18 },
  { freq: 739.99, start: 0.12, dur: 0.18 },
  { freq: 880.0, start: 0.24, dur: 0.3 },
];

const PEAK_GAIN = 0.13;

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
    playWordValidated: (cellCount: number) => play(wordPulse(cellCount)),
    playPuzzleSolved: () => play(WIN_NOTES),
  };
}
