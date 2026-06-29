import { useEffect, useState } from 'react';
import { Timer } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { formatClock } from '@/ui/play/formatClock';

// ADR-0072 co-op timer: ticks against the server start instant, freezes at `frozenAtMs` (mirrors prod TimerPill).

const SECOND_MS = 1000;

const format = (elapsedMs: number): string => formatClock(elapsedMs / 1000);

const pill = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontFamily: 'wsMono',
  fontWeight: 'semibold',
  fontSize: '13.5px',
  color: 'ws.jadeInk',
  flex: 'none',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
  paddingInline: '2px',
});
const icon = css({ fontSize: '14px', opacity: 0.55, flex: 'none' });

export interface LiveTimerProps {
  // Server-emitted `gameStarted.startedAt` ISO instant; ticks against it.
  readonly startedAt: string;
  // Frozen duration in ms (COMPLETED); renders fixed and stops ticking.
  readonly frozenAtMs?: number;
  // Deterministic override for tests.
  readonly fixedElapsedMs?: number;
}

export function LiveTimer({ startedAt, frozenAtMs, fixedElapsedMs }: LiveTimerProps) {
  const [elapsedMs, setElapsedMs] = useState<number>(() => {
    if (fixedElapsedMs !== undefined) return fixedElapsedMs;
    if (frozenAtMs !== undefined) return frozenAtMs;
    return Date.now() - new Date(startedAt).getTime();
  });

  useEffect(() => {
    if (fixedElapsedMs !== undefined) {
      setElapsedMs(fixedElapsedMs);
      return;
    }
    if (frozenAtMs !== undefined) {
      setElapsedMs(frozenAtMs);
      return;
    }
    const startMs = new Date(startedAt).getTime();
    setElapsedMs(Date.now() - startMs);
    const id = setInterval(() => setElapsedMs(Date.now() - startMs), SECOND_MS);
    return () => clearInterval(id);
  }, [startedAt, frozenAtMs, fixedElapsedMs]);

  const label = format(elapsedMs);
  return (
    <span className={pill} role="timer" aria-label={`Temps ${label}`}>
      <Timer aria-hidden="true" weight="bold" className={icon} />
      {label}
    </span>
  );
}
