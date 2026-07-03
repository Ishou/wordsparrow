import { css, cx } from 'styled-system/css';
import type { CSSProperties } from 'react';

// Tone matches the surface the placeholder sits on.
export type SkeletonTone = 'jade' | 'deep' | 'onCard';

export interface SkeletonProps {
  readonly width?: number | string;
  readonly height?: number | string;
  readonly radius?: number | string;
  readonly circle?: boolean;
  readonly tone?: SkeletonTone;
  readonly className?: string;
  readonly style?: CSSProperties;
}

// CSS-var form (not a token string): inline React style can't resolve Panda tokens, but custom properties re-resolve under [data-theme=dark].
const TONE_BG: Record<SkeletonTone, string> = {
  jade: 'var(--colors-ws-skeleton-jade)',
  deep: 'var(--colors-ws-skeleton-deep)',
  onCard: 'var(--colors-ws-skeleton-on-card)',
};

const base = css({
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '8px',
  _after: {
    content: '""',
    position: 'absolute',
    inset: 0,
    transform: 'translateX(-100%)',
    backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)',
    animation: 'wsShimmer 1.5s infinite',
  },
  // The bright white sweep flashes on night surfaces; dim it to a gentle sheen.
  _dark: { _after: { backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent)' } },
  // display:none removes the band entirely; animation:none alone leaves a static artifact.
  '@media (prefers-reduced-motion: reduce)': { _after: { animation: 'none', display: 'none' } },
});

function toLen(v: number | string | undefined): string | undefined {
  return typeof v === 'number' ? `${v}px` : v;
}

export function Skeleton({ width, height, radius, circle, tone = 'jade', className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(base, className)}
      style={{
        display: 'block',
        width: toLen(width),
        height: toLen(height),
        borderRadius: circle ? '50%' : toLen(radius),
        background: TONE_BG[tone],
        ...style,
      }}
    />
  );
}
