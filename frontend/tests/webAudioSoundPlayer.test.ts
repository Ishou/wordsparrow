import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebAudioSoundPlayer } from '@/infrastructure/session/webAudioSoundPlayer';

class FakeParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class FakeOsc {
  frequency = new FakeParam();
  detune = new FakeParam();
  type = '';
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
}

// Genuine constructor (not a vi.fn returning an object) so `new` is reliable;
// each instance registers itself so the test can inspect the cached context.
const created: FakeCtx[] = [];
class FakeCtx {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = vi.fn(() => new FakeOsc());
  createGain = vi.fn(() => new FakeGain());
  resume = vi.fn();
  constructor() {
    created.push(this);
  }
}

type AudioContextSlot = typeof globalThis.AudioContext;
const original = globalThis.AudioContext;

beforeEach(() => {
  created.length = 0;
  globalThis.AudioContext = FakeCtx as unknown as AudioContextSlot;
});

afterEach(() => {
  globalThis.AudioContext = original;
  vi.restoreAllMocks();
});

describe('webAudioSoundPlayer', () => {
  it('plays nothing while muted', () => {
    const player = createWebAudioSoundPlayer(() => false);
    player.playWordValidated(4);
    player.playPuzzleSolved();
    expect(created).toHaveLength(0);
  });

  it('a short word: one build tick per cell plus a soft single-note climax', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated(5);
    // 5 build notes + 1 climax voice (a short word does not bloom the triad)
    expect(created[0]?.createOscillator).toHaveBeenCalledTimes(6);
  });

  it('a wide sweep caps the build and blooms into a triad climax', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated(40);
    // capped at 18 accelerating build notes + a 3-note triad climax — stays snappy, never 40 ticks
    expect(created[0]?.createOscillator).toHaveBeenCalledTimes(21);
  });

  it('always emits at least one tick even for a zero count', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated(0);
    expect(created[0]?.createOscillator.mock.calls.length).toBeGreaterThan(0);
  });

  it('a clean verify sweep: one build tick per correct cell plus a triumphant landing', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playVerifySweep([true, true, true]);
    // 3 build ticks + 1 triumphant climax voice (short run stays a single top note)
    expect(created[0]?.createOscillator).toHaveBeenCalledTimes(4);
  });

  it('a verify sweep with errors: build ticks, a two-osc thud per wrong cell, and a 3-note warning', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playVerifySweep([true, false, true]);
    // 2 build ticks + (2 oscillators for the wrong-cell thud) + 3 warning-climax notes
    expect(created[0]?.createOscillator).toHaveBeenCalledTimes(7);
  });

  it('plays nothing for an empty verify sweep', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playVerifySweep([]);
    expect(created).toHaveLength(0);
  });

  it('emits a three-note arpeggio for a solved puzzle', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playPuzzleSolved();
    expect(created[0]?.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('reuses a single AudioContext across plays', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated(3);
    player.playPuzzleSolved();
    expect(created).toHaveLength(1);
  });

  it('does not throw when AudioContext is unavailable', () => {
    // @ts-expect-error simulate an environment without Web Audio
    globalThis.AudioContext = undefined;
    const player = createWebAudioSoundPlayer(() => true);
    expect(() => player.playWordValidated(4)).not.toThrow();
  });
});
