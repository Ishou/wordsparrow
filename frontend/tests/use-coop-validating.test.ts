import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCoopValidating } from '@/ui/v2/multiplayer/useCoopValidating';
import type { Puzzle } from '@/domain';

// Hook reads cell values via document.querySelector; inputs must be in the DOM.
const puzzle: Puzzle = {
  id: 'coop-validate-puzzle',
  title: 't',
  language: 'fr',
  width: 5,
  height: 1,
  hintsAllowed: 3,
  hintsRemaining: 3,
  cells: [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'demo', arrow: 'right' }] },
    { kind: 'letter', position: { row: 0, col: 1 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 2 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 3 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 4 }, entry: '' },
  ],
};

const WORD_KEYS = ['0,1', '0,2', '0,3', '0,4'] as const;
const WORD_POSITIONS = [
  { row: 0, column: 1 },
  { row: 0, column: 2 },
  { row: 0, column: 3 },
  { row: 0, column: 4 },
] as const;

function fillWord() {
  for (const [i, value] of ['D', 'E', 'M', 'O'].entries()) {
    const input = document.createElement('input');
    input.setAttribute('data-cell-kind', 'letter');
    input.setAttribute('data-row', '0');
    input.setAttribute('data-col', String(i + 1));
    input.value = value;
    document.body.appendChild(input);
  }
}

describe('useCoopValidating', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('arms the pulse for a completed word after the delay, then clears it when the server locks it', async () => {
    fillWord();
    const { result, rerender } = renderHook(
      ({ validated }: { validated: ReadonlySet<string> }) => useCoopValidating(puzzle, validated),
      { initialProps: { validated: new Set<string>() } },
    );

    act(() => result.current.noteLocalFill(0, 4));
    await waitFor(() => expect(result.current.validating.has('0,1')).toBe(true));
    for (const k of WORD_KEYS) expect(result.current.validating.has(k)).toBe(true);

    rerender({ validated: new Set<string>(WORD_KEYS) }); // server `wordLocked`
    await waitFor(() => expect(result.current.validating.size).toBe(0));
  });

  it('never flashes the pulse when the lock arrives before the delay', () => {
    vi.useFakeTimers();
    fillWord();
    const { result, rerender } = renderHook(
      ({ validated }: { validated: ReadonlySet<string> }) => useCoopValidating(puzzle, validated),
      { initialProps: { validated: new Set<string>() } },
    );

    act(() => result.current.noteLocalFill(0, 4));
    act(() => rerender({ validated: new Set<string>(WORD_KEYS) })); // locked before the 200ms gate
    act(() => vi.advanceTimersByTime(400));

    expect(result.current.validating.size).toBe(0);
  });

  it('the safety timeout only clears the pulse — never shakes (ADR-0085)', () => {
    vi.useFakeTimers();
    fillWord();
    const { result } = renderHook(
      ({ validated }: { validated: ReadonlySet<string> }) => useCoopValidating(puzzle, validated),
      { initialProps: { validated: new Set<string>() } },
    );

    act(() => result.current.noteLocalFill(0, 4));
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.validating.has('0,1')).toBe(true);

    act(() => vi.advanceTimersByTime(3500)); // MAX_MS elapses with no lock and no reject
    expect(result.current.validating.size).toBe(0);
    expect(result.current.rejecting.size).toBe(0);
  });

  it('shakes the cells on a server wordRejected, then clears after the window', () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      ({ validated }: { validated: ReadonlySet<string> }) => useCoopValidating(puzzle, validated),
      { initialProps: { validated: new Set<string>() } },
    );

    act(() => result.current.noteServerReject(WORD_POSITIONS));
    for (const k of WORD_KEYS) expect(result.current.rejecting.has(k)).toBe(true);

    act(() => vi.advanceTimersByTime(600));
    expect(result.current.rejecting.size).toBe(0);
  });

  it('noteServerReject clears any pending pulse on the rejected cells', () => {
    vi.useFakeTimers();
    fillWord();
    const { result } = renderHook(
      ({ validated }: { validated: ReadonlySet<string> }) => useCoopValidating(puzzle, validated),
      { initialProps: { validated: new Set<string>() } },
    );

    act(() => result.current.noteLocalFill(0, 4));
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.validating.has('0,1')).toBe(true);

    act(() => result.current.noteServerReject(WORD_POSITIONS));
    expect(result.current.validating.size).toBe(0);
    for (const k of WORD_KEYS) expect(result.current.rejecting.has(k)).toBe(true);

    act(() => vi.advanceTimersByTime(600));
    expect(result.current.rejecting.size).toBe(0);
  });

  it('cancels an in-progress reject shake when a lock arrives for the same cells', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ validated }: { validated: ReadonlySet<string> }) => useCoopValidating(puzzle, validated),
      { initialProps: { validated: new Set<string>() } },
    );

    act(() => result.current.noteServerReject(WORD_POSITIONS));
    for (const k of WORD_KEYS) expect(result.current.rejecting.has(k)).toBe(true);

    // A `wordLocked` broadcast lands after the reject shake already started.
    act(() => rerender({ validated: new Set<string>(WORD_KEYS) }));

    expect(result.current.rejecting.size).toBe(0);
  });

  it('a word locked before the safety window never rejects', () => {
    vi.useFakeTimers();
    fillWord();
    const { result, rerender } = renderHook(
      ({ validated }: { validated: ReadonlySet<string> }) => useCoopValidating(puzzle, validated),
      { initialProps: { validated: new Set<string>() } },
    );

    act(() => result.current.noteLocalFill(0, 4));
    act(() => vi.advanceTimersByTime(200));
    act(() => rerender({ validated: new Set<string>(WORD_KEYS) })); // server `wordLocked`
    act(() => vi.advanceTimersByTime(4100)); // past MAX_MS + the reject window

    expect(result.current.rejecting.size).toBe(0);
    expect(result.current.validating.size).toBe(0);
  });
});
