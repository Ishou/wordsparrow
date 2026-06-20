# ADR-0072: WordSparrow design system v2 (jade/sakura/khaki) — standalone-first

## Status

Accepted, 2026-06-20. **Supersedes ADR-0043 (nature/forest visual direction)
for visual identity** — the palette and typography below replace ADR-0043's
papier-crème/forest/Fraunces direction. Respects ADR-0002 (frontend stack),
ADR-0050 (a11y baseline — WCAG AA), and ADR-0054 (page-shell primitive). The
forest palette and existing components remain live in the app until the
migration effort (see Consequences); this ADR governs the new standalone
module only.

## Context

The 2026-06 redesign (captured in
`docs/superpowers/specs/2026-06-20-wordsparrow-design-foundation.md` and the
companion Claude Design build plan) pivots WordSparrow's look from ADR-0043's
forest-green/papier-crème/Fraunces identity to a **serene, elegant,
naturalist** language derived from a green-and-cherry-blossom kimono: a jade
field, sakura as a single live accent, foliage-khaki ink, sable settled cells.
The grid is the brand; playful energy lives in motion + a warm-modern type,
not in loud colour. The maintainer validated the palette and the play / win /
home screens in Claude Design.

This is a non-trivial visual-identity change and warrants an ADR per ADR-0001
§7 and CLAUDE.md. To de-risk it, the new system is built **standalone first**
(isolated module + design-synced for design work) and the live app is migrated
to it **separately and later**.

## Decision

### 1. Visual language (supersedes ADR-0043 palette + type)

The new palette, with exact tokens (full rationale in the foundation brief):

| Role | Token | Hex |
|---|---|---|
| Field (play background) | `ws.jade` | `#C4E5D3` (grad `#CDE9DA→#BBE0CD`) |
| Ink / clue-cells / headings | `ws.jadeInk` | `#214B40` |
| Solved ("settled") cells | `ws.sable` | `#E8E2C6` |
| Letters / body ink | `ws.khaki` | `#4C4824` |
| Arrows / small accents | `ws.or` | `#D8C77A` |
| Active word + primary CTA | `ws.sakura` | `#D45D83` |
| Accent (rings, hovers) | `ws.sakuraRose` | `#E586A4` |
| Soft tint (celebration) | `ws.sakuraBlush` | `#F7DEE7` |
| Empty cells, cards, keys | white | `#FFFFFF` |

State colours (success, error = a terracotta distinct from sakura, focus ring)
are finalized for WCAG AA during implementation. Typography is **warm
friendly-modern** (a geometric/grotesk display + body, e.g. the Hanken Grotesk
family used in the Claude Design exploration), not Fraunces — the playful
personality lives in the type and in motion, on a calm palette.

### 2. Standalone module

A new `frontend/src/design-system/` module holds the v2 components (atoms →
composites). The v2 tokens are added **namespaced** (`ws.*`) to
`frontend/panda.config.ts` so they coexist with the live app's current tokens
without touching them. The module is **isolated**: nothing under it imports app
feature code, and no app file imports it, until migration — enforced by an
`eslint-plugin-boundaries` rule.

### 3. How it's seen and shipped to design

A dev-only `/design-system` gallery route renders every component + variant
(there is no Storybook). The same module is **design-synced** to a *new*
Claude Design project (the existing old-DS project is left intact) so the
design agent builds with the real v2 components.

### 4. Accessibility

ADR-0050's WCAG AA gate is binding: every component ships an axe check;
khaki-on-sable, white-on-sakura, and jade-ink-on-jade contrast are verified.

## Consequences

- **Temporary duplication.** The app keeps ADR-0043's tokens + components live
  while the v2 module grows beside them. This is deliberate (standalone-first
  de-risks the redesign) but must not become permanent.
- **Migration is required, not optional.** Porting the app's `ui/components/` +
  screens to the v2 module, removing the old tokens, and retiring ADR-0043's
  styles is a tracked follow-up effort. Until it lands, the redesign is not
  user-visible.
- **ADR-0043 stays "Accepted (superseded for identity)"** — its non-identity
  decisions (light-only theme, the semantic-token layering mechanism) still
  inform the work; only its palette + typography are replaced.
- Easier: the redesign can be perfected in isolation + in Claude Design without
  risking the live app. Harder: two token sets and two component layers exist
  until migration, so contributors must know which layer they're in.
