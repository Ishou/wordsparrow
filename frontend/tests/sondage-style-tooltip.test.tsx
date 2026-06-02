import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StyleTooltip } from '@/ui/components/sondage/StyleTooltip';

describe('StyleTooltip', () => {
  it('renders the human style label as the trigger', () => {
    render(<StyleTooltip style="cryptique" definition="Elle précède l'hiver" mot="AUTOMNE" />);
    expect(
      screen.getByRole('button', { name: /En savoir plus sur le style/ }),
    ).toHaveTextContent('Cryptique');
  });

  it('exposes the definition and the live clue as the worked example on focus', async () => {
    render(<StyleTooltip style="cryptique" definition="Elle précède l'hiver" mot="AUTOMNE" />);
    const trigger = screen.getByRole('button', { name: /En savoir plus sur le style/ });
    act(() => {
      trigger.focus();
      fireEvent.pointerMove(trigger);
    });
    await waitFor(() =>
      expect(screen.getByText(/Définition indirecte : jeu de mots/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/« Elle précède l'hiver » → AUTOMNE/)).toBeInTheDocument();
  });

  it('falls back to the label alone for an unknown style with no info trigger', () => {
    render(<StyleTooltip style="future_style_x" definition="x" mot="Y" />);
    expect(screen.getByText(/Style :/)).toHaveTextContent('Style : future_style_x');
    expect(screen.queryByRole('button', { name: /En savoir plus sur le style/ })).toBeNull();
  });
});
