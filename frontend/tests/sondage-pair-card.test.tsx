import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ItemPair, SurveyItem } from '@/application/survey';
import { PairCard } from '@/ui/components/sondage';

const leftItem: SurveyItem = {
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

const rightItem: SurveyItem = {
  itemId: '0190e3a4-7a2c-7c9e-8f1a-cafecafecafe',
  mot: 'CHAT',
  definition: 'Félin domestique aux iris fendus',
  pos: 'nom_commun',
  categorie: 'faune_flore',
  style: 'periphrase',
  forceClaimed: 3,
  longueur: 4,
  tier: 'mid',
  isCalibration: false,
};

const samplePair: ItemPair = { mot: 'CHAT', left: leftItem, right: rightItem };

describe('PairCard', () => {
  it('renders the mot once and both definitions in side panels', () => {
    const { container } = render(<PairCard pair={samplePair} onVerdict={() => Promise.resolve()} />);
    expect(screen.getByRole('heading', { name: 'CHAT', level: 2 })).toBeInTheDocument();
    const left = container.querySelector('[data-side="left"]');
    const right = container.querySelector('[data-side="right"]');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    // Definition text also appears in the StyleTooltip example, so scope to the side panel's blockquote.
    expect(left!.querySelector('blockquote')!.textContent).toMatch(/Animal domestique à moustaches/);
    expect(right!.querySelector('blockquote')!.textContent).toMatch(/Félin domestique aux iris fendus/);
  });

  it('renders all five verdict buttons with min touch-target class', () => {
    const { container } = render(<PairCard pair={samplePair} onVerdict={() => Promise.resolve()} />);
    for (const verdict of ['LEFT_WINS', 'RIGHT_WINS', 'BOTH_GOOD', 'BOTH_BAD', 'SKIP'] as const) {
      const btn = container.querySelector<HTMLButtonElement>(`[data-verdict="${verdict}"]`);
      expect(btn, `missing button ${verdict}`).not.toBeNull();
      expect(btn!.className).toMatch(/min/i);
      expect(btn!.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('exposes the Verdict role=group with aria-keyshortcuts', () => {
    render(<PairCard pair={samplePair} onVerdict={() => Promise.resolve()} />);
    const group = screen.getByRole('group', { name: /Comparaison des deux définitions/i });
    expect(group.getAttribute('aria-keyshortcuts')).toBe('g d j k l space escape');
  });

  it('clicking LEFT_WINS invokes onVerdict("LEFT_WINS", latencyMs >= 0)', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PairCard pair={samplePair} onVerdict={onVerdict} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-verdict="LEFT_WINS"]')!);
    });
    expect(onVerdict).toHaveBeenCalledTimes(1);
    expect(onVerdict.mock.calls[0][0]).toBe('LEFT_WINS');
    expect(onVerdict.mock.calls[0][1]).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['RIGHT_WINS'],
    ['BOTH_GOOD'],
    ['BOTH_BAD'],
    ['SKIP'],
  ] as const)('clicking %s invokes onVerdict with that verdict', async (verdict) => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PairCard pair={samplePair} onVerdict={onVerdict} />);
    await act(async () => {
      fireEvent.click(container.querySelector(`[data-verdict="${verdict}"]`)!);
    });
    expect(onVerdict).toHaveBeenCalledWith(verdict, expect.any(Number));
  });

  it('keyboard shortcuts g/d/j/l map to LEFT_WINS/RIGHT_WINS/BOTH_BAD/BOTH_GOOD', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    render(<PairCard pair={samplePair} onVerdict={onVerdict} />);
    await act(async () => { fireEvent.keyDown(window, { key: 'g' }); });
    expect(onVerdict).toHaveBeenLastCalledWith('LEFT_WINS', expect.any(Number));
    await act(async () => { fireEvent.keyDown(window, { key: 'd' }); });
    expect(onVerdict).toHaveBeenLastCalledWith('RIGHT_WINS', expect.any(Number));
    await act(async () => { fireEvent.keyDown(window, { key: 'j' }); });
    expect(onVerdict).toHaveBeenLastCalledWith('BOTH_BAD', expect.any(Number));
    await act(async () => { fireEvent.keyDown(window, { key: 'l' }); });
    expect(onVerdict).toHaveBeenLastCalledWith('BOTH_GOOD', expect.any(Number));
  });

  it('k, space, and Escape all map to SKIP', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    render(<PairCard pair={samplePair} onVerdict={onVerdict} />);
    await act(async () => { fireEvent.keyDown(window, { key: 'k' }); });
    expect(onVerdict).toHaveBeenLastCalledWith('SKIP', expect.any(Number));
    await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });
    expect(onVerdict).toHaveBeenLastCalledWith('SKIP', expect.any(Number));
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(onVerdict).toHaveBeenLastCalledWith('SKIP', expect.any(Number));
  });

  it('ignores modifier-key chords (Cmd/Ctrl/Alt + g)', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    render(<PairCard pair={samplePair} onVerdict={onVerdict} />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'g', metaKey: true });
      fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'j', altKey: true });
    });
    expect(onVerdict).not.toHaveBeenCalled();
  });

  it('ignores keys typed in an INPUT/TEXTAREA', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <input data-testid="probe-input" />
        <PairCard pair={samplePair} onVerdict={onVerdict} />
      </>,
    );
    const input = screen.getByTestId('probe-input');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'g' });
    });
    expect(onVerdict).not.toHaveBeenCalled();
  });
});
