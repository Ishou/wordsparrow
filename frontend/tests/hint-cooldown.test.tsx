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

  it('renders a polite status cooldown below cap (2/3)', () => {
    render(
      <HintCooldown hintsRemaining={2} hintsAllowed={3} secondsUntilNextHint={600} />,
    );
    const cooldown = screen.getByTestId('hint-cooldown');
    expect(cooldown).toHaveAttribute('role', 'status');
    expect(cooldown).toHaveAttribute('aria-live', 'polite');
    expect(cooldown).toHaveAttribute('aria-label', expect.stringContaining('2 sur 3'));
    expect(cooldown).toHaveTextContent('+1 dans 10:00');
  });

  it('formats sub-minute remainders as m:ss and stays visible at 0 tokens', () => {
    render(
      <HintCooldown hintsRemaining={0} hintsAllowed={3} secondsUntilNextHint={65} />,
    );
    const cooldown = screen.getByTestId('hint-cooldown');
    expect(cooldown).toHaveTextContent('+1 dans 1:05');
  });
});
