import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoPopover } from '@/ui/components/primitives/InfoPopover';

describe('InfoPopover', () => {
  it('runs onActivate when the trigger is clicked (fine pointer)', () => {
    const onActivate = vi.fn();
    render(
      <InfoPopover info="Explication" onActivate={onActivate}>
        <button type="button">Vérifier</button>
      </InfoPopover>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('reveals the info text on focus', async () => {
    render(
      <InfoPopover info="Vérifie tes lettres" onActivate={() => {}}>
        <button type="button">Vérifier</button>
      </InfoPopover>,
    );
    const trigger = screen.getByRole('button', { name: 'Vérifier' });
    act(() => {
      trigger.focus();
      fireEvent.pointerMove(trigger);
    });
    await waitFor(() =>
      expect(screen.getByText('Vérifie tes lettres')).toBeInTheDocument(),
    );
  });

  it('describes the trigger via aria-describedby once open', async () => {
    render(
      <InfoPopover info="Vérifie tes lettres" onActivate={() => {}}>
        <button type="button">Vérifier</button>
      </InfoPopover>,
    );
    const trigger = screen.getByRole('button', { name: 'Vérifier' });
    act(() => {
      trigger.focus();
      fireEvent.pointerMove(trigger);
    });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-describedby'));
  });

  it('when disabled: blocks onActivate, marks aria-disabled, still reveals info', async () => {
    const onActivate = vi.fn();
    render(
      <InfoPopover info="Connecte-toi pour vérifier" onActivate={onActivate} disabled>
        <button type="button">Vérifier</button>
      </InfoPopover>,
    );
    const trigger = screen.getByRole('button', { name: 'Vérifier' });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(trigger);
    expect(onActivate).not.toHaveBeenCalled();
    act(() => {
      trigger.focus();
      fireEvent.pointerMove(trigger);
    });
    await waitFor(() =>
      expect(screen.getByText('Connecte-toi pour vérifier')).toBeInTheDocument(),
    );
  });

  it('touch: a long-press suppresses the tap, a short tap activates', () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      const onActivate = vi.fn();
      render(
        <InfoPopover info="Explication" onActivate={onActivate} longPressMs={500}>
          <button type="button">Vérifier</button>
        </InfoPopover>,
      );
      const trigger = screen.getByRole('button', { name: 'Vérifier' });
      act(() => { fireEvent.pointerDown(trigger, { clientX: 0, clientY: 0 }); });
      act(() => { vi.advanceTimersByTime(500); });
      act(() => { fireEvent.pointerUp(trigger); fireEvent.click(trigger); });
      expect(onActivate).not.toHaveBeenCalled();          // long-press swallowed the tap
      act(() => {
        fireEvent.pointerDown(trigger, { clientX: 0, clientY: 0 });
        vi.advanceTimersByTime(100);
        fireEvent.pointerUp(trigger);
        fireEvent.click(trigger);
      });
      expect(onActivate).toHaveBeenCalledTimes(1);         // short tap activates
    } finally {
      window.matchMedia = original;
      vi.useRealTimers();
    }
  });
});
