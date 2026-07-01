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
  if (hintsRemaining >= hintsAllowed || secondsUntilNextHint === null) return null;

  const remaining = Math.max(0, secondsUntilNextHint);
  const progress = Math.min(1, Math.max(0, (intervalSeconds - remaining) / intervalSeconds));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const label = `Prochain indice dans ${minutes} min ${seconds} s, ${hintsRemaining} sur ${hintsAllowed}`;

  return (
    <span
      className={containerStyles}
      data-testid="hint-cooldown"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span
        className={ringStyles}
        style={{ '--cooldown-progress': progress } as React.CSSProperties}
        aria-hidden="true"
      />
      <span aria-hidden="true">+1 dans {formatMmSs(remaining)}</span>
    </span>
  );
}
