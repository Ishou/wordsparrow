# WordSparrow design system

The reusable UI of **WordSparrow**, a French *mots fléchés* (crossword)
puzzle game. The look is warm and editorial: a papier-crème background,
a forest-green accent, a serif display face, and a small, deliberate set
of primitives. Build with the real components below; for your own layout
glue, use the design tokens — never invent colors, fonts, or spacing.

## Setup & wrapping

No global theme provider is needed — all tokens are plain CSS custom
properties defined in `_ds_bundle.css` (reached via `styles.css`) and
apply globally. Drop a component in and it is styled.

One exception — **toasts**. Wrap the subtree in `ToastProvider`, render a
single `<Toast />` near the root, and trigger notifications with the
`useToast()` hook:

```tsx
import { ToastProvider, Toast, useToast, Button } from '@bliss/frontend';

function Save() {
  const { show } = useToast();
  return <Button onClick={() => show({ text: 'Grille enregistrée.', tone: 'info' })}>Enregistrer</Button>;
}

// near the app root:
<ToastProvider><Save /><Toast /></ToastProvider>
```

`Dialog`, `Select`, and `OverflowMenu` use Ark UI internally (portals,
focus-trap, ESC/outside-click) — no extra setup.

## Styling idiom: props for components, tokens for glue

There are **no utility classes**. Each component carries the design
language through a small prop surface — style by prop, not by class:

- `Button` — `variant`: `primary` | `secondary` | `ghost`; `disabled`.
- `IconButton` — `tone`: `accent` | `muted`; requires `aria-label`.
- `TextField` / `PinInput` — `label`, `invalid`, `errorText`, `disabled`.
- `Select` / `RadioGroup` / `ToggleGroup` — `label`, `value`,
  `onValueChange`, `options`.
- `Wordmark` / `Lockup` — `size`: `hero` | `desktop` | `mobile`.
- `Sparrow` — `width`, `eye`.

For your **own** layout and surfaces, style with the design tokens as CSS
custom properties (`var(--…)`). The vocabulary (all defined in
`_ds_bundle.css`):

- **Colors** — surfaces: `--colors-bg` (papier crème `#faf6eb`),
  `--colors-surface` (`#fff`), `--colors-surface-elevated`,
  `--colors-fg` (near-black forest), `--colors-fg-muted`,
  `--colors-border`. Accent: `--colors-accent` (forest `#3f6431`),
  `--colors-accent-bg`, `--colors-accent-hover`, `--colors-on-accent`
  (white). State: `--colors-error` (terracotta), `--colors-error-bg`,
  `--colors-error-text`, `--colors-success`, `--colors-focus-ring`
  (ochre). Scales when you need them: `--colors-primary-50…900`
  (greens), `--colors-secondary-50…900` (ochres),
  `--colors-neutral-50…900`, `--colors-terra-*`.
- **Fonts** — `--fonts-heading` (Fraunces, serif display),
  `--fonts-body` (Outfit), `--fonts-mono` (Lekton, puzzle clue text).
- **Font sizes** — `--font-sizes-xxs|xs|sm|md|body|lg|xl|display`.
- **Spacing** — `--spacing-xs|sm|md|lg|xl`.
- **Radii** — `--radii-sm|md|lg`. **Shadow** — `--shadows-floating`.

## Where the truth lives

- `_ds_bundle.css` — every token, as `:root` custom properties. Read it
  before styling anything custom.
- `components/<group>/<Name>/<Name>.d.ts` — the exact prop contract.
- `components/<group>/<Name>/<Name>.prompt.md` — usage notes per component.

## Idiomatic example

```tsx
import { Dialog, DialogDescription, Button } from '@bliss/frontend';

export function WinDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Partie terminée">
      <DialogDescription>Bravo&nbsp;! Grille du jour complétée.</DialogDescription>
      {/* your own layout glue uses tokens, never hard-coded values */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
        <Button variant="primary" onClick={onClose}>Rejouer</Button>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
      </div>
    </Dialog>
  );
}
```
