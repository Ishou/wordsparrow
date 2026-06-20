import { css } from 'styled-system/css';

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
    </main>
  );
}
