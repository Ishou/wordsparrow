import type { SoundPlayer } from '@/application/session/SoundPlayer';
import {
  SOLVE_PULSE,
  solvePulseCellDelaysMs,
  solvePulseClimaxAtMs,
  solvePulseClimaxStrength,
  solvePulseStepStarts,
} from '@/application/grid/solvePulse';

interface Note {
  readonly freq: number;
  readonly start: number;
  readonly dur: number;
  readonly gain?: number;
  readonly detune?: number;
}

// Ascending D-major pentatonic (~2.5 octaves): the build climbs this as it accelerates.
const SCALE: readonly number[] = [
  587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51, 1479.98, 1760.0, 1975.53, 2349.32,
];
// How far up SCALE the build climbs (0 flat … 1 top); shared cadence lives in solvePulse.ts.
const RISE = 0.7;
const ROLL_GAIN = 0.07;
const CLIMAX_GAIN = 0.18;
const DUD_GAIN = 0.09;
const WARN_GAIN = 0.12;
// D6 F#6 A6 — the major-triad landing that wide sweeps bloom into.
const CLIMAX_TRIAD: readonly number[] = [1174.66, 1479.98, 1760.0];

// The rising build tick for the i-th of `total` correct cells in the sweep.
function buildTick(i: number, total: number, startS: number): Note {
  const frac = total > 1 ? i / (total - 1) : 1;
  const idx = Math.min(SCALE.length - 1, Math.round(frac * RISE * (SCALE.length - 1)));
  return { freq: SCALE[idx], start: startS, dur: 0.09, gain: ROLL_GAIN };
}

// The triumphant landing: a soft top note for a short run, blooming into a triad for a wide one.
function triumphantClimax(startS: number, correctCount: number): Note[] {
  const strength = solvePulseClimaxStrength(correctCount);
  const dur = (SOLVE_PULSE.climaxMs / 1000) * (0.5 + 0.5 * strength);
  const gain = ROLL_GAIN + (CLIMAX_GAIN - ROLL_GAIN) * strength;
  const voices = strength > 0.4 ? CLIMAX_TRIAD : CLIMAX_TRIAD.slice(0, 1);
  return voices.map((freq, k) => ({ freq, start: startS + k * 0.006, dur, gain: gain * (1 - k * 0.15) }));
}

// A low muted thud where a wrong cell sits in the sweep — audible but not punishing.
function offNote(startS: number): Note[] {
  return [
    { freq: 196.0, start: startS, dur: 0.12, gain: DUD_GAIN },
    { freq: 196.0, start: startS, dur: 0.12, gain: DUD_GAIN * 0.5, detune: 6 },
  ];
}

// A soft descending "aw" (F5 → D5 → G4) — "not quite", gentler than an error buzzer.
function warningClimax(startS: number): Note[] {
  return [
    { freq: 698.46, start: startS, dur: 0.16, gain: WARN_GAIN },
    { freq: 587.33, start: startS + 0.11, dur: 0.22, gain: WARN_GAIN * 0.95 },
    { freq: 392.0, start: startS + 0.24, dur: 0.34, gain: WARN_GAIN * 0.85 },
  ];
}

function wordPulse(cellCount: number): readonly Note[] {
  const starts = solvePulseStepStarts(cellCount);
  const n = starts.length;
  const notes: Note[] = [];
  for (let i = 0; i < n; i++) notes.push(buildTick(i, n, starts[i] / 1000));
  notes.push(...triumphantClimax(solvePulseClimaxAtMs(cellCount) / 1000, cellCount));
  return notes;
}

// The verify sweep: one accelerando across the submitted cells in reading order — a rising tick
// for each correct cell, a thud where each wrong one sits — landing on the triumphant climax if
// clean, or the warning "aw" if any were wrong. `verdicts` is reading-order correct/wrong flags.
function verifySweep(verdicts: readonly boolean[]): readonly Note[] {
  const n = verdicts.length;
  const delays = solvePulseCellDelaysMs(n);
  const notes: Note[] = [];
  let wrong = 0;
  for (let i = 0; i < n; i++) {
    const startS = delays[i] / 1000;
    // pitch tracks the cell's spatial position in the sweep, so the run keeps rising past the thuds
    if (verdicts[i]) notes.push(buildTick(i, n, startS));
    else {
      wrong++;
      notes.push(...offNote(startS));
    }
  }
  const climaxStart = solvePulseClimaxAtMs(n) / 1000;
  notes.push(...(wrong > 0 ? warningClimax(climaxStart) : triumphantClimax(climaxStart, n - wrong)));
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
        if (n.detune) osc.detune.setValueAtTime(n.detune, now + n.start);
        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(n.gain ?? PEAK_GAIN, now + n.start + 0.02);
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
    playVerifySweep: (verdicts: readonly boolean[]) => {
      if (verdicts.length > 0) play(verifySweep(verdicts));
    },
    playPuzzleSolved: () => play(WIN_NOTES),
  };
}
