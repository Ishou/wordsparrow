import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';

// Discreet regen cooldown for the solo hint affordance (regen spec §D): a quiet ring that fills over the refill
// interval, shown whenever the budget is below capacity; announced politely even though it reads as subtle.

const containerStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  fontFamily: 'wsUi',
  fontWeight: 'semibold',
  fontSize: '11px',
  color: 'ws.jadeInk',
  opacity: 0.7,
  userSelect: 'none',
});

const ringStyles = css({
  width: '14px',
  height: '14px',
  borderRadius: '999px',
  flexShrink: 0,
  background:
    'conic-gradient(token(colors.ws.or) calc(var(--cooldown-progress, 0) * 360deg), color-mix(in srgb, token(colors.ws.or) 16%, transparent) 0)',
});

// Visually hidden but announced; carries only transition-level text, never the per-second countdown.
const srOnlyStyles = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export interface HintCooldownProps {
  readonly hintsRemaining: number;
  readonly hintsAllowed: number;
  /** Live seconds until the next regenerated credit; `null` when the budget is full. */
  readonly secondsUntilNextHint: number | null;
  /** Refill interval in seconds; drives the ring fill fraction. */
  readonly intervalSeconds?: number;
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function HintCooldown({
  hintsRemaining,
  hintsAllowed,
  secondsUntilNextHint,
  intervalSeconds = 600,
}: HintCooldownProps) {
  const visible = hintsRemaining < hintsAllowed && secondsUntilNextHint !== null;
  const available = (secondsUntilNextHint ?? 0) <= 0;

  // Announce only at meaningful transitions (appears / becomes available), never on each ticker second (ADR-0050).
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!visible) {
      setAnnouncement('');
      return;
    }
    setAnnouncement(
      available
        ? 'Un indice est de nouveau disponible.'
        : `Régénération d’un indice en cours, ${hintsRemaining} sur ${hintsAllowed}.`,
    );
  }, [visible, available, hintsRemaining, hintsAllowed]);

  if (!visible) return null;

  const remaining = Math.max(0, secondsUntilNextHint ?? 0);
  const progress = Math.min(1, Math.max(0, (intervalSeconds - remaining) / intervalSeconds));

  return (
    <span className={containerStyles} data-testid="hint-cooldown">
      <span
        className={ringStyles}
        style={{ '--cooldown-progress': progress } as React.CSSProperties}
        aria-hidden="true"
      />
      <span aria-hidden="true">+1 dans {formatMmSs(remaining)}</span>
      <span
        className={srOnlyStyles}
        data-testid="hint-cooldown-status"
        role="status"
        aria-live="polite"
      >
        {announcement}
      </span>
    </span>
  );
}
