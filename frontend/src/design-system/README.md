# WordSparrow design system v2

Standalone jade/sakura/khaki component library (ADR-0072), built isolated from
the live app and migrated in later. Visual contract:
`docs/superpowers/specs/2026-06-20-wordsparrow-design-foundation.md`.

- Tokens: namespaced `ws.*` in `frontend/panda.config.ts` (coexist with the
  ADR-0043 set; reference as `ws.jade`, `ws.sakura`, … in `css()`).
- Isolation: `eslint-plugin-boundaries` forbids this module from importing app
  code, and forbids app code from importing it — except the dev-only
  `/design-system` gallery route.
- Preview: the gallery renders every component + variant and is the
  `/design-sync` surface.
