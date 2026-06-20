import { css } from 'styled-system/css';
import { Cell } from '../components/Cell/Cell';
import { DefCell } from '../components/DefCell/DefCell';
import { Grid } from '../components/Grid/Grid';
import { ClueRail } from '../components/ClueRail/ClueRail';
import { Button } from '../components/Button/Button';
import { KeyboardKey } from '../components/KeyboardKey/KeyboardKey';
import type { GridLayout } from '../components/Grid/layout';

const SAMPLE_LAYOUT: GridLayout = {
  columns: 5,
  cells: [
    { kind: 'def', clues: ['Petit oiseau'], arrow: 'right' },
    { kind: 'letter', letter: 'M' },
    { kind: 'letter', letter: 'É' },
    { kind: 'def', clues: ['Note'], arrow: 'down' },
    { kind: 'empty' },
    { kind: 'def', clues: ['Arbre'], arrow: 'right' },
    { kind: 'letter', letter: 'P', active: true },
    { kind: 'letter', letter: 'A', active: true },
    { kind: 'letter', letter: 'R', active: true },
    { kind: 'letter', letter: 'I', active: true },
  ],
};

// Panda kebab-cases camelCase segments: jadeInk → --colors-ws-jade-ink.
const SWATCHES = [
  ['Jade', 'ws.jade', '--colors-ws-jade'],
  ['Jade ink', 'ws.jadeInk', '--colors-ws-jade-ink'],
  ['Sable', 'ws.sable', '--colors-ws-sable'],
  ['Khaki', 'ws.khaki', '--colors-ws-khaki'],
  ['Or', 'ws.or', '--colors-ws-or'],
  ['Sakura', 'ws.sakura', '--colors-ws-sakura'],
  ['Sakura rose', 'ws.sakuraRose', '--colors-ws-sakura-rose'],
  ['Sakura blush', 'ws.sakuraBlush', '--colors-ws-sakura-blush'],
] as const;

export function DesignSystemGallery() {
  return (
    <main className={css({ padding: 'lg', display: 'flex', flexDirection: 'column', gap: 'lg' })}>
      <h1 className={css({ fontSize: 'xl', letterSpacing: '-0.02em', margin: 0, color: 'fg' })}>
        WordSparrow — Design System v2
      </h1>
      <section aria-label="Jetons de couleur" className={css({ display: 'flex', flexWrap: 'wrap', gap: 'md' })}>
        {SWATCHES.map(([label, token, cssVar]) => (
          <figure key={token} className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', width: '120px', margin: 0 })}>
            <div
              data-token={token}
              style={{ background: `var(${cssVar})` }}
              className={css({ height: '64px', borderRadius: 'md', border: '1px solid token(colors.border)' })}
            />
            <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>{label}</figcaption>
          </figure>
        ))}
      </section>
      <section aria-label="Cases de grille" className={css({ display: 'flex', flexWrap: 'wrap', gap: 'lg', alignItems: 'flex-start' })}>
        <figure className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', margin: 0 })}>
          <div className={css({ display: 'flex', gap: 'xs' })}>
            <div style={{ width: 56 }}><Cell state="empty" /></div>
            <div style={{ width: 56 }}><Cell state="solved" letter="A" /></div>
            <div style={{ width: 56 }}><Cell state="active" letter="R" /></div>
          </div>
          <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>Cell — empty · solved · active</figcaption>
        </figure>
        <figure className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', margin: 0 })}>
          <div className={css({ display: 'flex', gap: 'sm' })}>
            <div style={{ width: 64 }}><DefCell clues={['Petit oiseau'] as const} arrow="right" /></div>
            <div style={{ width: 64 }}><DefCell clues={['Note'] as const} arrow="down" /></div>
            <div style={{ width: 64 }}><DefCell clues={['Sud', 'Oui'] as const} /></div>
            <div style={{ width: 64 }}><DefCell clues={['Arbre'] as const} arrow="right" active /></div>
          </div>
          <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>DefCell — single → · single ↓ · split · active</figcaption>
        </figure>
      </section>
      <section aria-label="Composites" className={css({ display: 'flex', flexWrap: 'wrap', gap: 'lg', alignItems: 'flex-start' })}>
        <figure className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', margin: 0, width: '320px' })}>
          <Grid layout={SAMPLE_LAYOUT} size="full" />
          <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>Grid — full</figcaption>
        </figure>
        <figure className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', margin: 0, width: '160px' })}>
          <Grid layout={SAMPLE_LAYOUT} size="mini" />
          <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>Grid — mini</figcaption>
        </figure>
        <figure className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', margin: 0, width: '320px' })}>
          <ClueRail direction="horizontal" clue="Capitale de la France" index={4} total={18} />
          <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>ClueRail</figcaption>
        </figure>
      </section>
      <section aria-label="Actions et clavier" className={css({ display: 'flex', flexWrap: 'wrap', gap: 'lg', alignItems: 'flex-start' })}>
        <figure className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', margin: 0 })}>
          <div className={css({ display: 'flex', gap: 'sm', flexWrap: 'wrap' })}>
            <Button variant="primary">Jouer</Button>
            <Button variant="secondary">Partager</Button>
            <Button variant="primary" disabled>Valider</Button>
          </div>
          <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>Button — primary · secondary · disabled</figcaption>
        </figure>
        <figure className={css({ display: 'flex', flexDirection: 'column', gap: 'xs', margin: 0 })}>
          <div className={css({ display: 'flex', gap: 'xs' })}>
            <KeyboardKey type="letter" label="A" />
            <KeyboardKey type="letter" label="Z" />
            <KeyboardKey type="backspace" />
            <KeyboardKey type="confirm" />
          </div>
          <figcaption className={css({ fontSize: 'sm', color: 'fg' })}>KeyboardKey — letter · backspace · confirm</figcaption>
        </figure>
      </section>
    </main>
  );
}
