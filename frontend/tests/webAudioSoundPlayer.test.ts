import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebAudioSoundPlayer } from '@/infrastructure/session/webAudioSoundPlayer';

class FakeParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class FakeOsc {
  frequency = new FakeParam();
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
    player.playWordValidated();
    player.playPuzzleSolved();
    expect(created).toHaveLength(0);
  });

  it('emits a two-note chime for a validated word', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated();
    expect(created[0]?.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('emits a three-note arpeggio for a solved puzzle', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playPuzzleSolved();
    expect(created[0]?.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('reuses a single AudioContext across plays', () => {
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated();
    player.playPuzzleSolved();
    expect(created).toHaveLength(1);
  });

  it('does not throw when AudioContext is unavailable', () => {
    // @ts-expect-error simulate an environment without Web Audio
    globalThis.AudioContext = undefined;
    const player = createWebAudioSoundPlayer(() => true);
    expect(() => player.playWordValidated()).not.toThrow();
  });
});
