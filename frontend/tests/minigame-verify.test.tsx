import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { SampleWord, WordsRepository } from '@/application';
import { MiniGame } from '@/ui/home/MiniGame';

const SAMPLE: ReadonlyArray<SampleWord> = [{ clue: 'Astre', answerLength: 4, token: 'tok-LUNE' }];

function repo(verify: WordsRepository['verifySample']): WordsRepository {
  return { fetchSampleWords: vi.fn().mockResolvedValue(SAMPLE), verifySample: verify };
}

async function renderWithWord(wordsRepository: WordsRepository) {
  render(<MiniGame wordsRepository={wordsRepository} />);
  await waitFor(() => {
    expect(screen.queryByLabelText('Chargement du mot du jour')).toBeNull();
  });
}

function cells(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[aria-label^="Astre — lettre"]'),
  );
}

// The mini-game cells are uncontrolled (ADR-0002 §4): a letter arrives via onChange.
function typeWord(word: string) {
  const inputs = cells();
  act(() => inputs[0].focus());
  for (let i = 0; i < word.length; i += 1) {
    act(() => {
      fireEvent.change(inputs[i], { target: { value: word[i] } });
    });
  }
}

describe('MiniGame server verification (ADR-0076)', () => {
  it('renders answerLength cells without a plaintext answer', async () => {
    await renderWithWord(repo(vi.fn().mockResolvedValue(false)));
    expect(cells()).toHaveLength(4);
  });

  it('drives the solve path when verifySample resolves true', async () => {
    const verifySample = vi.fn().mockResolvedValue(true);
    await renderWithWord(repo(verifySample));

    typeWord('XYZW');

    await waitFor(() => {
      expect(verifySample).toHaveBeenCalledWith('tok-LUNE', 'XYZW');
    });
    await waitFor(() => {
      expect(document.querySelectorAll('[data-cell-state="solved"]').length).toBe(4);
    });
    expect(screen.queryByRole('button', { name: /Passer/ })).toBeNull();
  });

  it('drives the wrong path (Passer appears) when verifySample resolves false', async () => {
    const verifySample = vi.fn().mockResolvedValue(false);
    await renderWithWord(repo(verifySample));

    typeWord('XYZW');

    await waitFor(() => {
      expect(verifySample).toHaveBeenCalledWith('tok-LUNE', 'XYZW');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Passer/ })).toBeTruthy();
    });
    expect(document.querySelectorAll('[data-cell-state="solved"]').length).toBe(0);
  });

  it('shows a discreet validating pulse on the word while a slow check is pending, then clears it', async () => {
    let resolveVerify: (correct: boolean) => void = () => {};
    const verifySample = vi.fn().mockImplementation(
      () => new Promise<boolean>((r) => { resolveVerify = r; }),
    );
    await renderWithWord(repo(verifySample));

    typeWord('XYZW');

    await waitFor(() => expect(verifySample).toHaveBeenCalledWith('tok-LUNE', 'XYZW'));
    // The pulse arms behind a short delay, then marks every cell of the word.
    await waitFor(() => {
      expect(document.querySelectorAll('[data-validating="true"]').length).toBe(4);
    });

    await act(async () => {
      resolveVerify(false);
    });
    await waitFor(() => {
      expect(document.querySelectorAll('[data-validating="true"]').length).toBe(0);
    });
  });

  it('never flashes the pulse when the check resolves quickly', async () => {
    const verifySample = vi.fn().mockResolvedValue(false);
    await renderWithWord(repo(verifySample));

    typeWord('XYZW');

    await waitFor(() => expect(screen.getByRole('button', { name: /Passer/ })).toBeTruthy());
    expect(document.querySelectorAll('[data-validating="true"]').length).toBe(0);
  });

  it('surfaces nothing as correct when verifySample rejects', async () => {
    const verifySample = vi.fn().mockRejectedValue(new Error('network'));
    await renderWithWord(repo(verifySample));

    typeWord('XYZW');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Passer/ })).toBeTruthy();
    });
    expect(document.querySelectorAll('[data-cell-state="solved"]').length).toBe(0);
  });
});
