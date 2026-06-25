import { Dialog } from '@ark-ui/react/dialog';
import { X } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { Button } from '@/design-system';

const screen = css({
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  overflow: 'hidden',
  background:
    'radial-gradient(125% 78% at 50% 24%, rgba(247,222,231,0.95) 0%, rgba(247,222,231,0) 56%), linear-gradient(168deg, #CDE9DA 0%, #DEE7DD 46%, #F7DEE7 100%)',
  animation: 'wsFade 0.4s ease both',
});

const closeBtn = css({
  position: 'absolute',
  top: '18px',
  right: '18px',
  zIndex: 3,
  width: '38px',
  height: '38px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  border: 'none',
  bg: 'rgba(255,255,255,0.5)',
  color: 'ws.jadeInk',
  fontSize: '19px',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(33,75,64,0.12)',
  _hover: { bg: 'rgba(255,255,255,0.8)' },
});

const petalLayer = css({ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' });
const petalEl = css({
  position: 'absolute',
  top: '-34px',
  borderRadius: '62% 0 62% 62%',
  animationName: 'wsPetalFall',
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0 },
});

const content = css({
  position: 'relative',
  zIndex: 2,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '20px',
  padding: '70px 28px 44px',
  textAlign: 'center',
});

const flower = css({
  position: 'relative',
  width: '62px',
  height: '62px',
  animation: 'wsBloomGlow 3.4s ease-in-out infinite',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
});
const bloomPetal = css({ position: 'absolute', left: '50%', top: '50%', width: '17px', height: '25px', bg: 'ws.sakuraRose', borderRadius: '50%' });
const bloomCenter = css({ position: 'absolute', left: '50%', top: '50%', width: '16px', height: '16px', bg: 'ws.or', borderRadius: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 3px rgba(255,255,255,0.45)' });

const headline = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '37px', lineHeight: '1.04', margin: 0, color: 'ws.jadeInk', letterSpacing: '-0.015em', whiteSpace: 'nowrap' });

const gridCard = css({ bg: 'rgba(255,255,255,0.42)', border: '0.5px solid rgba(255,255,255,0.6)', borderRadius: '16px', padding: '12px', boxShadow: '0 8px 22px rgba(33,75,64,0.10)' });
const miniGrid = css({ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', width: '154px' });
const miniCell = css({ aspectRatio: '1', borderRadius: '3px' });

const statsBar = css({
  width: '100%',
  maxWidth: '296px',
  display: 'flex',
  alignItems: 'center',
  bg: 'rgba(255,255,255,0.55)',
  backdropFilter: 'blur(8px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  borderRadius: '16px',
  padding: '13px 6px',
  boxShadow: '0 6px 18px rgba(33,75,64,0.08)',
});
const statCol = css({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' });
const statLabel = css({ fontFamily: 'wsUi', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'ws.khaki', opacity: 0.7 });
const statValue = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '26px', color: 'ws.jadeInk', lineHeight: '1', whiteSpace: 'nowrap' });

const subtext = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'semibold', color: 'ws.khaki', opacity: 0.8, marginTop: '-8px' });

const actions = css({ width: '100%', maxWidth: '296px', display: 'flex', flexDirection: 'column', gap: '11px', marginTop: '2px' });
const fullBtn = css({ width: '100%', height: '52px' });

const quiet = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'semibold', color: 'ws.khaki', opacity: 0.6, marginTop: '2px' });

const PETAL_COLORS = ['#F7DEE7', '#E586A4', '#FBEFF2', '#F7DEE7', '#EBA7BD', '#F7DEE7'] as const;
const PETAL_LEFTS = [4, 12, 21, 31, 41, 52, 62, 71, 80, 88, 95, 8, 27, 46, 66, 85] as const;
const PETALS = PETAL_LEFTS.map((left, i) => ({
  left: `${left}%`,
  size: `${8 + (i % 4) * 3}px`,
  color: PETAL_COLORS[i % PETAL_COLORS.length],
  opacity: 0.5 + (i % 3) * 0.17,
  dur: `${(7 + (i % 5) * 1.4).toFixed(1)}s`,
  delay: `-${((i * 1.7) % 9).toFixed(1)}s`,
}));

// Decorative "bloomed grid" motif (7×6): jade definition cells with a gold
// edge, the rest blushed in blush / rose / sakura, one gold accent.
const CELL = {
  D: { bg: '#214B40', sh: 'inset -2px 0 0 0 #D8C77A' },
  B: { bg: '#F7DEE7', sh: 'none' },
  R: { bg: '#E586A4', sh: 'none' },
  S: { bg: '#D45D83', sh: 'none' },
  G: { bg: '#D8C77A', sh: 'none' },
} as const;
const GRID = [
  'D', 'R', 'B', 'S', 'D', 'B', 'R',
  'B', 'S', 'D', 'R', 'B', 'S', 'D',
  'D', 'B', 'R', 'B', 'D', 'R', 'S',
  'S', 'D', 'B', 'S', 'R', 'B', 'B',
  'D', 'R', 'S', 'D', 'B', 'R', 'S',
  'B', 'S', 'R', 'B', 'D', 'S', 'G',
] as const;

export interface WinScreenProps {
  readonly time: string;
  readonly onReplay: () => void;
  readonly onShare: () => void;
  // Dismiss the celebration to reveal the completed grid (without replaying).
  readonly onDismiss: () => void;
}

export function WinScreen({ time, onReplay, onShare, onDismiss }: WinScreenProps) {
  return (
    <Dialog.Root open modal>
      <Dialog.Content className={screen} aria-label="Grille terminée">
      <button type="button" className={closeBtn} onClick={onDismiss} aria-label="Revoir la grille">
        <X aria-hidden="true" weight="bold" />
      </button>
      <div className={petalLayer} aria-hidden="true">
        {PETALS.map((p, i) => (
          <div
            key={i}
            className={petalEl}
            style={{ left: p.left, width: p.size, height: p.size, background: p.color, opacity: p.opacity, animationDuration: p.dur, animationDelay: p.delay }}
          />
        ))}
      </div>

      <div className={content}>
        <div className={flower} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={bloomPetal} style={{ transform: `translate(-50%, -50%) rotate(${i * 72}deg) translateY(-15px)` }} />
          ))}
          <div className={bloomCenter} />
        </div>

        <h1 className={headline}>Grille terminée !</h1>

        <div className={gridCard} aria-hidden="true">
          <div className={miniGrid}>
            {GRID.map((code, i) => {
              const c = CELL[code];
              return <div key={i} className={miniCell} style={{ background: c.bg, boxShadow: c.sh }} />;
            })}
          </div>
        </div>

        <div className={statsBar}>
          <div className={statCol}>
            <span className={statLabel}>Temps</span>
            <span className={statValue}>{time}</span>
          </div>
        </div>
        <div className={subtext}>Plus rapide que 78 % des joueurs</div>

        <div className={actions}>
          <Button variant="primary" className={fullBtn} onClick={onReplay}>Rejouer</Button>
          <Button variant="secondary" className={fullBtn} onClick={onShare}>Partager</Button>
        </div>

        <div className={quiet}>Nouvelle grille demain</div>
      </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
