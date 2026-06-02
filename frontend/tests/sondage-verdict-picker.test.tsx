import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SurveyItem } from '@/application/survey';
import { RatingCard } from '@/ui/components/sondage';

const sampleItem: SurveyItem = {
  itemId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  mot: 'CHAT',
  definition: 'Animal domestique à moustaches',
  pos: 'nom_commun',
  categorie: 'faune_flore',
  style: 'definition_directe',
  forceClaimed: 2,
  longueur: 4,
  tier: 'mid',
  isCalibration: false,
};

// Pristine band seeds difficulte from the announced force (no human pick yet → fallback 3).
const SEEDED_META = { targetCategories: ['faune_flore'], targetSense: '', isMultisense: false, subTags: [] };
const PRISTINE_DIFFICULTE = 3;

describe('RatingCard verdict picker', () => {
  it('renders mot, definition, the POS pill, three verdict buttons, and an inline Corriger trigger', () => {
    const { container } = render(<RatingCard item={sampleItem} onVerdict={() => Promise.resolve()} onCorriger={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'CHAT' })).toBeInTheDocument();
    expect(container.querySelector('blockquote')?.textContent).toContain('Animal domestique à moustaches');
    const pos = container.querySelector<HTMLSelectElement>('[data-testid="pos-pill"]');
    expect(pos?.value).toBe('nom_commun');
    expect(container.querySelector('[data-verdict="BAD"]')).not.toBeNull();
    expect(container.querySelector('[data-verdict="SKIP"]')).not.toBeNull();
    expect(container.querySelector('[data-verdict="GOOD"]')).not.toBeNull();
    expect(container.querySelector('[data-verdict="CORRIGER"]')).toBeNull();
    expect(container.querySelector('[data-testid="corriger-trigger"]')).not.toBeNull();
  });

  it('exposes the Verdict role=group with aria-keyshortcuts j k l', () => {
    render(<RatingCard item={sampleItem} onVerdict={() => Promise.resolve()} onCorriger={async () => {}} />);
    const group = screen.getByRole('group', { name: 'Verdict' });
    expect(group.getAttribute('aria-keyshortcuts')).toBe('j k l');
  });

  it('each verdict button has an aria-label citing the definition and meets the 56px touch target', () => {
    const { container } = render(<RatingCard item={sampleItem} onVerdict={() => Promise.resolve()} onCorriger={async () => {}} />);
    const verdictLabels = { BAD: 'Mauvaise', SKIP: 'Passer', GOOD: 'Bonne' } as const;
    for (const verdict of ['BAD', 'SKIP', 'GOOD'] as const) {
      const btn = container.querySelector<HTMLButtonElement>(`[data-verdict="${verdict}"]`);
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute('aria-label')).toContain(verdictLabels[verdict]);
      expect(btn!.getAttribute('aria-label')).toContain('Animal domestique à moustaches');
      // jsdom doesn't compute layout; assert the css contract is wired via class names rather than getBoundingClientRect.
      expect(btn!.className).toMatch(/min/i);
    }
  });

  it('clicking GOOD invokes onVerdict("GOOD", latencyMs >= 0, meta, difficulte)', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-verdict="GOOD"]')!);
    });
    expect(onVerdict).toHaveBeenCalledTimes(1);
    expect(onVerdict.mock.calls[0][0]).toBe('GOOD');
    expect(onVerdict.mock.calls[0][1]).toBeGreaterThanOrEqual(0);
    expect(onVerdict.mock.calls[0][2]).toEqual(SEEDED_META);
    expect(onVerdict.mock.calls[0][3]).toBe(PRISTINE_DIFFICULTE);
  });

  it('clicking BAD invokes onVerdict("BAD")', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-verdict="BAD"]')!);
    });
    expect(onVerdict).toHaveBeenCalledWith('BAD', expect.any(Number), SEEDED_META, PRISTINE_DIFFICULTE);
  });

  it('clicking SKIP invokes onVerdict("SKIP")', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-verdict="SKIP"]')!);
    });
    expect(onVerdict).toHaveBeenCalledWith('SKIP', expect.any(Number), SEEDED_META, PRISTINE_DIFFICULTE);
  });

  it('pressing j/k/l triggers BAD/SKIP/GOOD via the document-level keydown handler', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    render(<RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'j' });
    });
    expect(onVerdict).toHaveBeenLastCalledWith('BAD', expect.any(Number), SEEDED_META, PRISTINE_DIFFICULTE);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k' });
    });
    expect(onVerdict).toHaveBeenLastCalledWith('SKIP', expect.any(Number), SEEDED_META, PRISTINE_DIFFICULTE);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'l' });
    });
    expect(onVerdict).toHaveBeenLastCalledWith('GOOD', expect.any(Number), SEEDED_META, PRISTINE_DIFFICULTE);
  });

  it('ignores modifier-key chords (Cmd/Ctrl/Alt + j)', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    render(<RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'j', metaKey: true });
      fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    });
    expect(onVerdict).not.toHaveBeenCalled();
  });

  it('does not fire a verdict when j/k/l is pressed on the POS pill select', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    render(<RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} />);
    const select = screen.getByRole('combobox', { name: 'Nature grammaticale' });
    await act(async () => {
      fireEvent.keyDown(select, { key: 'l' });
      fireEvent.keyDown(select, { key: 'j' });
    });
    expect(onVerdict).not.toHaveBeenCalled();
  });

  it('Corriger trigger opens textarea pre-filled with definition; submit invokes onCorriger', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const onCorriger = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={onCorriger} />,
    );
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="corriger-trigger"]') as HTMLButtonElement);
    });

    const textarea = container.querySelector('textarea#correctif-text') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe(sampleItem.definition);

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Une définition corrigée plus précise' } });
    });
    const submit = container.querySelector('[data-testid="correctif-submit"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(submit); });

    expect(onCorriger).toHaveBeenCalledWith(
      'Une définition corrigée plus précise',
      sampleItem.pos,
      expect.any(Number),
      SEEDED_META,
      PRISTINE_DIFFICULTE,
    );
    expect(onVerdict).not.toHaveBeenCalled();
  });

  it('the POS pill is a labelled select pre-set to the item POS', () => {
    render(<RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} />);
    const select = screen.getByRole('combobox', { name: 'Nature grammaticale' }) as HTMLSelectElement;
    expect(select.value).toBe('nom_commun');
  });

  it('changing only the POS submits the original text with the new POS', async () => {
    const onCorriger = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={onCorriger} />,
    );
    const select = screen.getByRole('combobox', { name: 'Nature grammaticale' }) as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: 'polyvalent' } }); });
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="corriger-trigger"]') as HTMLButtonElement);
    });
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="correctif-submit"]') as HTMLButtonElement);
    });
    expect(onCorriger).toHaveBeenCalledWith(sampleItem.definition, 'polyvalent', expect.any(Number), SEEDED_META, PRISTINE_DIFFICULTE);
  });

  it('Corriger submit is a no-op when text equals the original definition', async () => {
    const onCorriger = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={onCorriger} />,
    );
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="corriger-trigger"]') as HTMLButtonElement);
    });
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="correctif-submit"]') as HTMLButtonElement);
    });
    expect(onCorriger).not.toHaveBeenCalled();
  });

  it('c key opens Corriger box; Escape cancels', async () => {
    const onCorriger = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={onCorriger} />,
    );
    await act(async () => { fireEvent.keyDown(window, { key: 'c' }); });
    const textarea = container.querySelector('textarea#correctif-text') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    await act(async () => { fireEvent.keyDown(textarea, { key: 'Escape' }); });
    expect(container.querySelector('textarea#correctif-text')).toBeNull();
    expect(onCorriger).not.toHaveBeenCalled();
  });

  it('renders the Signaler action only when onSignaler is provided', async () => {
    const onSignaler = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} />,
    );
    expect(container.querySelector('[data-testid="signaler"]')).toBeNull();
    rerender(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} onSignaler={onSignaler} />,
    );
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="signaler"]') as HTMLButtonElement);
    });
    expect(onSignaler).toHaveBeenCalledWith(expect.any(Number));
  });

  it('renders the metadata band only when enrichable', () => {
    const { container, rerender } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} />,
    );
    expect(container.querySelector('[data-testid="metadata-band"]')).toBeNull();
    rerender(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable />,
    );
    expect(container.querySelector('[data-testid="metadata-band"]')).not.toBeNull();
  });
});
