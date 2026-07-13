import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';

// Discreet regen cooldown ring for the active solo assist affordance (hint's token-bucket regen or verify's 30-min cooldown).

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
  // Wrap as one block within the clue rail's trailing slot; never break the label mid-countdown.
  whiteSpace: 'nowrap',
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

export interface AssistCooldownProps {
  // Caller decides whether the ring should be shown at all — hint keys this on remaining budget, verify on "a cooldown has been seeded".
  readonly visible: boolean;
  /** Live seconds until the next allowed action. */
  readonly secondsRemaining: number | null;
  /** Cooldown duration in seconds; drives the ring fill fraction. */
  readonly intervalSeconds: number;
  /** Fully-formatted visible text, e.g. "+1 dans 4:32" (hint) or a bare "12:04" (verify). */
  readonly label: string;
  /** SR announcement once `secondsRemaining` reaches 0. */
  readonly availableAnnouncement: string;
  /** SR announcement while still cooling; omit to stay silent until the transition to available (ADR-0050: no per-tick spam). */
  readonly progressAnnouncement?: string;
}

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function AssistCooldown({
  visible,
  secondsRemaining,
  intervalSeconds,
  label,
  availableAnnouncement,
  progressAnnouncement,
}: AssistCooldownProps) {
  const available = (secondsRemaining ?? 0) <= 0;

  // Announce only at meaningful transitions (appears / becomes available), never on each ticker second (ADR-0050).
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!visible) {
      setAnnouncement('');
      return;
    }
    setAnnouncement(available ? availableAnnouncement : (progressAnnouncement ?? ''));
  }, [visible, available, availableAnnouncement, progressAnnouncement]);

  if (!visible) return null;

  const remaining = Math.max(0, secondsRemaining ?? 0);
  const progress = Math.min(1, Math.max(0, (intervalSeconds - remaining) / intervalSeconds));

  return (
    <span className={containerStyles} data-testid="assist-cooldown">
      <span
        className={ringStyles}
        style={{ '--cooldown-progress': progress } as React.CSSProperties}
        aria-hidden="true"
      />
      <span aria-hidden="true">{label}</span>
      <span
        className={srOnlyStyles}
        data-testid="assist-cooldown-status"
        role="status"
        aria-live="polite"
      >
        {announcement}
      </span>
    </span>
  );
}
