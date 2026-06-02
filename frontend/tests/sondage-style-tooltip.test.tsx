import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StyleTooltip } from '@/ui/components/sondage/StyleTooltip';

describe('StyleTooltip', () => {
  it('renders the human style label inline', () => {
    render(<StyleTooltip style="cryptique" />);
    expect(screen.getByText(/Style :/)).toHaveTextContent('Style : Cryptique');
  });

  it('exposes the style definition and example on focus', async () => {
    render(<StyleTooltip style="calembour" />);
    const trigger = screen.getByRole('button', { name: /En savoir plus sur le style/ });
    act(() => {
      trigger.focus();
      fireEvent.pointerMove(trigger);
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Jeu de mots à double sens signalé par un/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/VENT → « Met les voiles/)).toBeInTheDocument();
  });

  it('falls back to the label alone for an unknown style with no info trigger', () => {
    render(<StyleTooltip style="future_style_x" />);
    expect(screen.getByText(/Style :/)).toHaveTextContent('Style : future_style_x');
    expect(screen.queryByRole('button', { name: /En savoir plus sur le style/ })).toBeNull();
  });
});
