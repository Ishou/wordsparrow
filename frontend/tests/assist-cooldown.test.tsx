import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistCooldown, formatMmSs } from '@/ui/components/grid/AssistCooldown';

describe('AssistCooldown', () => {
  it('renders nothing when not visible', () => {
    render(
      <AssistCooldown
        visible={false}
        secondsRemaining={null}
        intervalSeconds={600}
        label="+1 dans 0:00"
        availableAnnouncement="Un indice est de nouveau disponible."
      />,
    );
    expect(screen.queryByTestId('assist-cooldown')).toBeNull();
  });

  it('renders the discreet ring + countdown text when visible', () => {
    render(
      <AssistCooldown
        visible
        secondsRemaining={600}
        intervalSeconds={600}
        label={`+1 dans ${formatMmSs(600)}`}
        availableAnnouncement="Un indice est de nouveau disponible."
        progressAnnouncement="Régénération d’un indice en cours, 2 sur 3."
      />,
    );
    const cooldown = screen.getByTestId('assist-cooldown');
    expect(cooldown).toBeVisible();
    expect(cooldown).toHaveTextContent('+1 dans 10:00');
  });

  it('exposes a polite live region carrying the progress announcement, no ticking value', () => {
    render(
      <AssistCooldown
        visible
        secondsRemaining={600}
        intervalSeconds={600}
        label={`+1 dans ${formatMmSs(600)}`}
        availableAnnouncement="Un indice est de nouveau disponible."
        progressAnnouncement="Régénération d’un indice en cours, 2 sur 3."
      />,
    );
    const status = screen.getByTestId('assist-cooldown-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Régénération d’un indice en cours, 2 sur 3.');
    expect(status.textContent).not.toContain('10:00');
  });

  it('keeps the live region stable across per-second ticks while the visible text counts down', () => {
    const { rerender } = render(
      <AssistCooldown
        visible
        secondsRemaining={600}
        intervalSeconds={600}
        label={`+1 dans ${formatMmSs(600)}`}
        availableAnnouncement="Un indice est de nouveau disponible."
        progressAnnouncement="Régénération d’un indice en cours, 2 sur 3."
      />,
    );
    const statusBefore = screen.getByTestId('assist-cooldown-status').textContent;
    expect(screen.getByTestId('assist-cooldown')).toHaveTextContent('+1 dans 10:00');

    rerender(
      <AssistCooldown
        visible
        secondsRemaining={598}
        intervalSeconds={600}
        label={`+1 dans ${formatMmSs(598)}`}
        availableAnnouncement="Un indice est de nouveau disponible."
        progressAnnouncement="Régénération d’un indice en cours, 2 sur 3."
      />,
    );

    expect(screen.getByTestId('assist-cooldown')).toHaveTextContent('+1 dans 9:58');
    expect(screen.getByTestId('assist-cooldown-status').textContent).toBe(statusBefore);
  });

  it('announces once when the cooldown reaches 0 (available)', () => {
    const { rerender } = render(
      <AssistCooldown
        visible
        secondsRemaining={2}
        intervalSeconds={600}
        label={`+1 dans ${formatMmSs(2)}`}
        availableAnnouncement="Un indice est de nouveau disponible."
        progressAnnouncement="Régénération d’un indice en cours, 0 sur 3."
      />,
    );
    expect(screen.getByTestId('assist-cooldown-status')).toHaveTextContent(
      'Régénération d’un indice en cours, 0 sur 3.',
    );

    rerender(
      <AssistCooldown
        visible
        secondsRemaining={0}
        intervalSeconds={600}
        label={`+1 dans ${formatMmSs(0)}`}
        availableAnnouncement="Un indice est de nouveau disponible."
        progressAnnouncement="Régénération d’un indice en cours, 0 sur 3."
      />,
    );
    expect(screen.getByTestId('assist-cooldown-status')).toHaveTextContent(
      'Un indice est de nouveau disponible.',
    );
    expect(screen.getByTestId('assist-cooldown')).toHaveTextContent('+1 dans 0:00');
  });

  it('verify usage: no progressAnnouncement stays silent while cooling, then announces availability', () => {
    const { rerender } = render(
      <AssistCooldown
        visible
        secondsRemaining={900}
        intervalSeconds={1800}
        label={`+ vérification dans ${formatMmSs(900)}`}
        availableAnnouncement="Nouvelle vérification disponible."
      />,
    );
    expect(screen.getByTestId('assist-cooldown')).toHaveTextContent('+ vérification dans 15:00');
    expect(screen.getByTestId('assist-cooldown-status')).toHaveTextContent('');

    rerender(
      <AssistCooldown
        visible
        secondsRemaining={0}
        intervalSeconds={1800}
        label={`+ vérification dans ${formatMmSs(0)}`}
        availableAnnouncement="Nouvelle vérification disponible."
      />,
    );
    expect(screen.getByTestId('assist-cooldown-status')).toHaveTextContent(
      'Nouvelle vérification disponible.',
    );
  });
});
