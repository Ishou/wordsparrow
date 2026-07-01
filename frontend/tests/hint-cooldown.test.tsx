import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HintCooldown } from '@/ui/components/grid/HintCooldown';

describe('HintCooldown', () => {
  it('renders nothing at full budget (3/3)', () => {
    render(
      <HintCooldown hintsRemaining={3} hintsAllowed={3} secondsUntilNextHint={null} />,
    );
    expect(screen.queryByTestId('hint-cooldown')).toBeNull();
  });

  it('renders nothing when secondsUntilNextHint is null even below cap', () => {
    render(
      <HintCooldown hintsRemaining={2} hintsAllowed={3} secondsUntilNextHint={null} />,
    );
    expect(screen.queryByTestId('hint-cooldown')).toBeNull();
  });

  it('renders the discreet ring + countdown text below cap (2/3)', () => {
    render(
      <HintCooldown hintsRemaining={2} hintsAllowed={3} secondsUntilNextHint={600} />,
    );
    const cooldown = screen.getByTestId('hint-cooldown');
    expect(cooldown).toBeVisible();
    expect(cooldown).toHaveTextContent('+1 dans 10:00');
  });

  it('exposes a polite live region that carries no ticking value', () => {
    render(
      <HintCooldown hintsRemaining={2} hintsAllowed={3} secondsUntilNextHint={600} />,
    );
    const status = screen.getByTestId('hint-cooldown-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Régénération d’un indice en cours, 2 sur 3.');
    expect(status.textContent).not.toContain('10:00');
  });

  it('keeps the live region stable across per-second ticks while the visible text counts down', () => {
    const { rerender } = render(
      <HintCooldown hintsRemaining={2} hintsAllowed={3} secondsUntilNextHint={600} />,
    );
    const statusBefore = screen.getByTestId('hint-cooldown-status').textContent;
    expect(screen.getByTestId('hint-cooldown')).toHaveTextContent('+1 dans 10:00');

    rerender(
      <HintCooldown hintsRemaining={2} hintsAllowed={3} secondsUntilNextHint={599} />,
    );
    rerender(
      <HintCooldown hintsRemaining={2} hintsAllowed={3} secondsUntilNextHint={598} />,
    );

    // Visible countdown advanced, but the announced text did not (no per-tick screen-reader spam).
    expect(screen.getByTestId('hint-cooldown')).toHaveTextContent('+1 dans 9:58');
    expect(screen.getByTestId('hint-cooldown-status').textContent).toBe(statusBefore);
  });

  it('announces once when the cooldown reaches 0 (hint available)', () => {
    const { rerender } = render(
      <HintCooldown hintsRemaining={0} hintsAllowed={3} secondsUntilNextHint={2} />,
    );
    expect(screen.getByTestId('hint-cooldown-status')).toHaveTextContent(
      'Régénération d’un indice en cours, 0 sur 3.',
    );

    rerender(
      <HintCooldown hintsRemaining={0} hintsAllowed={3} secondsUntilNextHint={0} />,
    );
    expect(screen.getByTestId('hint-cooldown-status')).toHaveTextContent(
      'Un indice est de nouveau disponible.',
    );
    // Still visible at 0 tokens, formatting the sub-minute remainder as m:ss.
    expect(screen.getByTestId('hint-cooldown')).toHaveTextContent('+1 dans 0:00');
  });
});
