import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { SampleWord, WordsRepository } from '@/application';
import { MiniGame } from '@/ui/home/MiniGame';

// Distinct clues per batch so the displayed word is identifiable from the cell aria-label.
function batch(prefix: string, size: number): SampleWord[] {
  return Array.from({ length: size }, (_, i) => ({
    clue: `${prefix}${i}`,
    answerLength: 3,
    token: `tok-${prefix}${i}`,
  }));
}

// The current clue is embedded in every cell's aria-label: `${clue} — lettre N sur M`.
function currentClue(): string {
  const input = document.querySelector<HTMLInputElement>('input[aria-label*="— lettre 1 sur"]');
  const label = input?.getAttribute('aria-label') ?? '';
  return label.split(' — ')[0];
}

function cellInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label*="— lettre"]'));
}

// Fill the word so the verify fires; a false result unlocks the Passer button.
function fillWord() {
  const inputs = cellInputs();
  act(() => inputs[0].focus());
  for (let i = 0; i < inputs.length; i += 1) {
    act(() => {
      fireEvent.change(inputs[i], { target: { value: 'A' } });
    });
  }
}

async function unlockPasser() {
  fillWord();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Passer/ })).toBeTruthy();
  });
}

function passer() {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /Passer/ }));
  });
}

async function renderEndless(wordsRepository: WordsRepository) {
  render(<MiniGame wordsRepository={wordsRepository} />);
  await waitFor(() => {
    expect(screen.queryByLabelText('Chargement du mot du jour')).toBeNull();
  });
}

describe('MiniGame endless rotation', () => {
  it('walks every word in a batch before repeating (shuffle-then-walk)', async () => {
    const only = batch('one', 6);
    const fetchSampleWords = vi.fn().mockResolvedValue(only);
    await renderEndless({ fetchSampleWords, verifySample: vi.fn().mockResolvedValue(false) });

    await unlockPasser();
    const seen: string[] = [currentClue()];
    // Walk through the rest of the batch; each Passer advances one word.
    for (let i = 1; i < only.length; i += 1) {
      passer();
      seen.push(currentClue());
    }

    expect(new Set(seen).size).toBe(only.length); // no early repeat within the batch
    expect(new Set(seen)).toEqual(new Set(only.map((w) => w.clue)));
  });

  it('refetches near exhaustion and continues into a second batch without a gap', async () => {
    const first = batch('one', 6);
    const second = batch('two', 6);
    const fetchSampleWords = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    await renderEndless({ fetchSampleWords, verifySample: vi.fn().mockResolvedValue(false) });

    await unlockPasser();
    const seen: string[] = [currentClue()];
    // Walk past the first batch; the rolling refetch must keep the game supplied.
    for (let i = 0; i < first.length + 2; i += 1) {
      passer();
      await waitFor(() => {
        expect(currentClue()).not.toBe('');
      });
      seen.push(currentClue());
    }

    await waitFor(() => {
      expect(fetchSampleWords.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(seen.some((c) => c.startsWith('two'))).toBe(true); // batch-2 words reached
  });

  it('keeps playing the current pool when a refetch fails', async () => {
    const first = batch('one', 6);
    const fetchSampleWords = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValue(new Error('network'));
    await renderEndless({ fetchSampleWords, verifySample: vi.fn().mockResolvedValue(false) });

    await unlockPasser();
    // Walk well past the batch; a rejected refetch must not crash — it wraps the pool.
    for (let i = 0; i < first.length + 4; i += 1) {
      passer();
      await waitFor(() => {
        expect(currentClue()).not.toBe('');
      });
    }

    expect(currentClue().startsWith('one')).toBe(true);
  });
});
