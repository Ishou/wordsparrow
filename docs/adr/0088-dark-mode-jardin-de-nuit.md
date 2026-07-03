# ADR-0088: Dark mode — « jardin de nuit »

## Status

Accepted

## Context

The v2 design (ADR-0072, jade/sakura/khaki kimono palette; ADR-0043 nature
ramp for the play grid) ships light-only. A "Mode sombre" toggle was promised
by the retired `/menu` placeholder and selected by the maintainer in the
2026-07-03 UX exploration. The palette hues are locked (ADR-0072); dark mode
must keep them and invert the lightness roles, not introduce a new palette.

Two color systems must both theme:

1. **`ws.*`** (v2 chrome) — plain `tokens.colors` in `panda.config.ts`.
   Plain tokens cannot carry per-condition values.
2. **Semantic roles** (`bg`, `surface`, `fg`, `accent*`, … — ADR-0043) —
   already `semanticTokens.colors`, which natively accept
   `{ base, _dark }` values.

Hardcoded colors outside tokens were mostly eliminated by the 2026-07-03
token sweep (PR #1282); the remaining raw values are the hero gradients,
SVG art fills, and shadow/scrim rgba tints.

## Decision

1. **Mechanism.** Add a Panda condition `dark: '[data-theme=dark] &'`.
   Promote every `ws.*` color to `semanticTokens.colors` with
   `{ base: <current>, _dark: <night> }`; add `_dark` values to the
   existing semantic roles. Consumers keep their `ws.*` / role token names —
   zero call-site changes for tokenized colors.
2. **The night ramp (maintainer-reviewed proposal, 2026-07-03).** Page
   gradient `#0E1F1A → #14261F`; `sable → #23301F`; white cards → `#1C2D25`;
   `jadeInk` text → `#E9F2EC`; `khaki` muted → `#A8B49B`; `sakura #D45D83`
   becomes the primary fill on dark (near-black `#24101A` text for AA);
   `sakuraDark → #E58CAC` where it was a text/icon accent;
   `sakuraBlush → #3A2230`; `or → #C9B96A` with `orInk → #E7DCA8`;
   `clueSurface`-family fills lighten (`#7FA98D`) so progress reads on dark.
   Exact values live in `panda.config.ts`; every text/fill pair re-verified
   WCAG AA before its surface ships.
3. **Theme setting.** `'clair' | 'sombre' | 'auto'`, persisted in
   localStorage (`bliss.theme`), applied as `data-theme` on `<html>` by the
   composition root before first paint (inline in `index.html` head to avoid
   a flash); `auto` follows `prefers-color-scheme` live. Réglages owns the
   control; default is `auto` once QA completes (see rollout).
4. **Non-token surfaces.** Hero gradients and SVG art consume
   `var(--colors-*)` custom properties (the pattern `DailyCalendar`'s
   progress ring already uses) so they theme with the tokens; shadows/scrims
   keep their rgba tints (they are tints, not palette dimensions) unless QA
   shows otherwise.
5. **Rollout (dark first, bright later).** Wave A ships the condition,
   the token migration and the night values with the default pinned to
   `clair` — no visible change. Wave B walks every surface in dark
   (screenshot review with the maintainer, AA checks), fixing stragglers.
   Wave C ships the Réglages control and flips the default to `auto`.

## Consequences

- Palette changes stay single-file, now including their dark halves; the
  `ws.*` names gain a layer of indirection (semantic, conditional) without
  any consumer churn.
- Every future color addition must supply a `_dark` value — the token sweep
  habits from PR #1282 (no raw hexes in `ui/`) become load-bearing.
- The play grid (ADR-0043 roles) themes through the same switch; its
  contrast pairs (documented per token in `panda.config.ts`) need dark
  equivalents with the same AA documentation.
- `prefers-color-scheme: dark` users see light until Wave C — deliberate
  (deploy dark, release bright).
- No server, schema, or authz change; no threat-model impact.
