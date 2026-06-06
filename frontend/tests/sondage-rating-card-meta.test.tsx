import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LemmaMeta, SurveyClient, SurveyItem } from '@/application/survey';
import { clearLemmaMetaCache, RatingCard } from '@/ui/components/sondage';

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

function stubClient(meta: LemmaMeta): SurveyClient {
  return {
    getNextItem: vi.fn(),
    submitRating: vi.fn(),
    getNextPair: vi.fn(),
    submitPairRating: vi.fn(),
    undoAction: vi.fn(),
    getProgress: vi.fn(),
    getContributions: vi.fn(),
    patchPreferences: vi.fn(),
    getCurrentCampaign: vi.fn(),
    getLemmaMeta: vi.fn().mockResolvedValue(meta),
  };
}

function lastMeta(fn: ReturnType<typeof vi.fn>) {
  const call = fn.mock.calls[fn.mock.calls.length - 1];
  return call[2];
}

async function clickEl(el: Element | null): Promise<void> {
  await act(async () => { fireEvent.click(el as HTMLButtonElement); });
}

type FieldKey = 'nature' | 'categories' | 'sens' | 'motscles';

// Each editable field is opened by clicking its read-only trigger; no global Ajuster anymore.
// Catégories and Nature are always-edit (no trigger), so opening them is a no-op.
async function openField(container: HTMLElement, field: FieldKey): Promise<void> {
  if (field === 'categories' || field === 'nature') return;
  await clickEl(container.querySelector(`[data-testid="band-edit-${field}"]`));
}
async function openCategoryPicker(): Promise<void> {
  await clickEl(screen.getByRole('button', { name: /Toutes les catégories/ }));
}
async function clickCategory(container: HTMLElement, cat: string): Promise<void> {
  await clickEl(container.querySelector(`[data-categorie="${cat}"]`));
}
async function clickGood(container: HTMLElement): Promise<void> {
  await clickEl(container.querySelector('[data-verdict="GOOD"]'));
}

describe('RatingCard meta inputs', () => {
  beforeEach(() => { clearLemmaMetaCache(); });

  it('toggling a category adds it; verdict carries the new selection', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['faune_flore', 'objet']);
  });

  it('cannot drop below the seed (min 1) but can remove an added category', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await clickCategory(container, 'faune_flore');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickCategory(container, 'objet');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['faune_flore']);
  });

  it('caps category selection at 6', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    for (const c of ['objet', 'corps', 'culture', 'histoire', 'jeu']) {
      await clickCategory(container, c);
    }
    await clickCategory(container, 'sport');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toHaveLength(6);
  });

  it('checking "autre" clears every other category', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickCategory(container, 'autre');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['autre']);
  });

  it('checking another category clears a previously selected "autre"', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'autre');
    await clickCategory(container, 'objet');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['objet']);
  });

  it('announces all cleared when "autre" replaces other selections', async () => {
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickCategory(container, 'autre');
    const liveRegion = container.querySelector('[data-testid="band-categories"] [role="status"]')!;
    expect(liveRegion.textContent).toContain('retirées');
  });

  it('announces "autre" removed when a non-exclusive category is selected', async () => {
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'autre');
    await clickCategory(container, 'objet');
    const liveRegion = container.querySelector('[data-testid="band-categories"] [role="status"]')!;
    expect(liveRegion.textContent).toContain('Autre');
    expect(liveRegion.textContent).toContain('retirée');
  });

  it('autre is still clickable when 6 categories are already selected', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    for (const c of ['objet', 'corps', 'culture', 'histoire', 'jeu']) {
      await clickCategory(container, c);
    }
    const autreOption = container.querySelector<HTMLButtonElement>('[data-categorie="autre"]')!;
    expect(autreOption.disabled).toBe(false);
    await clickCategory(container, 'autre');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['autre']);
  });

  it('Space inside the open Catégories editor does not confirm the band', async () => {
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    const picker = screen.getByRole('button', { name: /Toutes les catégories/ });
    await act(async () => {
      picker.focus();
      fireEvent.keyDown(picker, { key: ' ', code: 'Space' });
    });
    const badge = container.querySelector('[data-testid="band-status-badge"]')!;
    expect(badge.textContent).not.toContain('Enregistré');
  });

  it('typing a single sense threads it into the verdict meta', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'sens');
    const sense = screen.getByRole('combobox', { name: 'Sens visé par cette définition' }) as HTMLInputElement;
    await act(async () => { fireEvent.change(sense, { target: { value: 'animal félin' } }); });
    await clickGood(container);
    expect(lastMeta(onVerdict).targetSense).toBe('animal félin');
    expect(lastMeta(onVerdict).isMultisense).toBe(false);
  });

  it('the lemma cannot be entered as a sense (ADR-0061 repetition rule)', async () => {
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'sens');
    const sense = screen.getByRole('combobox', { name: 'Sens visé par cette définition' }) as HTMLInputElement;
    await act(async () => { fireEvent.change(sense, { target: { value: 'le chat' } }); });
    expect(sense.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert')).toHaveTextContent(/ne doit pas répéter/i);
  });

  it('adds and removes sub-tags; verdict carries them', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'motscles');
    const subInput = screen.getByRole('combobox', { name: 'Mots-clés' }) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(subInput, { target: { value: 'félin' } });
      fireEvent.keyDown(subInput, { key: 'Enter' });
    });
    await act(async () => {
      fireEvent.change(subInput, { target: { value: 'domestique' } });
      fireEvent.keyDown(subInput, { key: 'Enter' });
    });
    await clickGood(container);
    expect(lastMeta(onVerdict).subTags).toEqual(['félin', 'domestique']);
  });

  it('sub-tags start empty per item (no prior prefill)', async () => {
    const client = stubClient({ priorSenses: [], priorSubTags: ['ancien-tag'] });
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable surveyClient={client} />,
    );
    await waitFor(() => expect(client.getLemmaMeta).toHaveBeenCalled());
    await clickGood(container);
    expect(lastMeta(onVerdict).subTags).toEqual([]);
  });

  it('autocompletes sub-tags and senses from lemma-meta priors', async () => {
    const client = stubClient({ priorSenses: ['conversation digitale'], priorSubTags: ['capitale'] });
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable surveyClient={client} />,
    );
    await waitFor(() => expect(client.getLemmaMeta).toHaveBeenCalled());
    await openField(container, 'sens');
    const sense = screen.getByRole('combobox', { name: 'Sens visé par cette définition' }) as HTMLInputElement;
    await act(async () => {
      fireEvent.focus(sense);
      fireEvent.change(sense, { target: { value: 'conv' } });
    });
    expect(screen.getByRole('listbox', { name: 'Sens visé par cette définition' }).textContent).toContain('conversation digitale');
  });

  it('resets meta to the item prior when the item changes', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    const next: SurveyItem = { ...sampleItem, itemId: 'next-id', mot: 'BANQUE', categorie: 'societe' };
    rerender(<RatingCard item={next} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />);
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['societe']);
  });

  it('Réinitialiser restores the nature grammaticale to the item prior', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    const select = container.querySelector('[data-testid="band-pos-select"]') as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: 'verbe_infinitif' } }); });
    expect(select.value).toBe('verbe_infinitif');
    await clickEl(container.querySelector('[data-testid="band-reset"]'));
    expect(select.value).toBe('nom_commun');
  });
});
