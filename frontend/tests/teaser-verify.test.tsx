import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { SampleWord, WordsRepository } from '@/application';
import { TeaserWord } from '@/ui/home/TeaserWord';

const SAMPLE: ReadonlyArray<SampleWord> = [{ clue: 'Astre', answerLength: 4, token: 'tok-LUNE' }];

function repo(verify: WordsRepository['verifySample']): WordsRepository {
  return { fetchSampleWords: vi.fn().mockResolvedValue(SAMPLE), verifySample: verify };
}

async function renderWithWord(wordsRepository: WordsRepository) {
  render(<TeaserWord wordsRepository={wordsRepository} />);
  await waitFor(() => {
    expect(screen.queryByLabelText('Chargement du mot du jour')).toBeNull();
  });
}

function cells(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[aria-label^="Astre — lettre"]'),
  );
}

// The teaser cells are uncontrolled (ADR-0002 §4): a letter arrives via onChange.
function typeWord(word: string) {
  const inputs = cells();
  act(() => inputs[0].focus());
  for (let i = 0; i < word.length; i += 1) {
    act(() => {
      fireEvent.change(inputs[i], { target: { value: word[i] } });
    });
  }
}

describe('TeaserWord server verification (ADR-0076)', () => {
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
