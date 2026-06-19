# WordSparrow — design foundation brief

**Date:** 2026-06-20 · **Status:** Foundation brief (pre-implementation). The
base for building real mockups in **Claude Design** (claude.ai/design).
**Not** an ADR; not an approved implementation plan.

> This captures the decisions reached in a visual brainstorming session
> (mockups under `.superpowers/brainstorm/`). It exists so the direction +
> palette + play-screen model are durable and reusable — the starting point
> for high-fidelity mockup work, not the finished design.

## North star

A **mobile-first daily French *mots fléchés*** that feels **serene, elegant,
and naturalist** — calm, warm, and confident, with playful *moments* rather
than loud playfulness. (We started at "modern & playful"; the kimono reference
the maintainer loves pulled the direction toward serene-elegant, which is the
real, stronger brief.)

Differentiators, decided:

- **Grid-led identity.** The *mots fléchés* grid itself is the brand — clue
  text + arrows live in the cells. Strip them and it's a generic crossword.
  Everything radiates from the grid.
- **No mascot.** A sparrow *character* would read as derivative (Duolingo owns
  bird-mascot territory). The name **WordSparrow** is fixed and the **sparrow
  stays as a refined mark/logo**, not an animated character.
- **Kimono-derived palette.** Jade field + sakura + foliage-khaki + white,
  taken from a green-and-cherry-blossom kimono (reference image in the
  brainstorm folder). Pink is a **jewel**, not wallpaper.

## Palette (locked)

Mapping principle: **jade = the field/structure, khaki = the ink/foliage,
sakura = the single live accent.**

| Token | Role | Hex |
|---|---|---|
| **Jade** | Play-screen field (immersive ground). Gradient. | `#CDE9DA → #BBE0CD` (base `#C4E5D3`) |
| **Jade+** | Clue/def-cells, primary ink, headings | `#214B40` |
| **Sable** | Solved/validated cells ("settled") | `#E8E2C6` |
| **Khaki** | Letters / body ink | `#4C4824` |
| **Or** | Arrows, small accents | `#D8C77A` (on dark: `#E2CE7E`) |
| **Sakura** | Active word + confirm key (white letters on it) | `#D45D83` |
| Sakura rose | Lighter accent (rings, hovers) | `#E586A4` |
| Sakura blush | Soft tint (celebration, optional) | `#F7DEE7` |
| **Blanc** | Empty cells, cards, keys | `#FFFFFF` |

**State colors — PROPOSED, confirm before use** (we did not validate these in
session): success = a clear jade-green distinct from the brand jade; error =
a terracotta/rose-red clearly separable from sakura; focus ring = `Or` or
`Sakura`. Resolve these for WCAG AA (ADR-0050 is a hard requirement).

Decisions worth remembering:

- Solved cells settle to **sable**, not pink — earlier a "blush bloom on every
  solved cell" was explored and **rejected**: at high fill the grid turned into
  pink confetti. Khaki/sable keeps it calm. (The sakura *bloom* is a great
  candidate to **return on the win/celebration screen** as the reward.)
- The structure color must avoid the **mid-emerald "success green"** look —
  that's why jade, not a generic green.
- Active-word letters are **white** (a blush-letter variant was tried and
  dropped).

## Play-screen interaction model (locked)

- **In-cell clues + arrows** (identity). Includes split **two-clue cells**
  (two definitions + two arrows). Authentic mots fléchés.
- **Big, zoomable grid.** Pinch zoom/pan; the grid is larger than the viewport.
  Reuse existing `GridMinimap` / `GridZoomControls` / `GridScrollbar` — but the
  minimap must **not overlap the board**; prefer simple `− / +` zoom controls,
  minimap as an optional non-occluding overlay.
- **Clue rail (helper).** A readable rail under the grid always shows the
  **active clue** large, with `‹ ›` to step answers and a position counter
  (e.g. 4/18). The active clue's def-cell is ringed sakura so grid ↔ rail stay
  linked. Solves "can't read tiny in-cell text when zoomed out" without
  replacing the in-cell clues.
- **Custom AZERTY keyboard**, white keys, khaki letters, sakura confirm key.
- Status: wordmark + streak/timer in a translucent-white pill (gold-on-jade was
  illegible — fixed).

This is essentially the **current** interaction model, re-skinned in the new
palette and tidied — the maintainer confirmed the model works well.

## Still open (take into Claude Design)

1. **Typography** — untouched this session, and load-bearing. Current app uses
   Fraunces (display) / Outfit (body) / Lekton (clue mono). The serene-elegant
   direction may keep or change these — explore with real font rendering.
2. **Other core screens** — home/daily entry, the **win/celebration** moment
   (where sakura bloom can return), account, archive.
3. **Motion language** — the "playful" now lives in motion + interaction
   feedback, since the palette is calm. Define it.
4. **Dark mode**, spacing/radius scale, exact split-cell rendering (true
   diagonal), accessibility pass.

## Scope: this is design, not app code

The deliverable is a **fresh design system + screens, built natively in Claude
Design** (claude.ai/design) — the new visual language and the key screens,
designed in the tool. **The `frontend/` app rework is a separate, later track**
and is explicitly out of scope here. Do not touch app code as part of this.

Two unrelated, deferred notes (not part of the design work):

- The component library synced to Claude Design on 2026-06-19 (project
  `402d7bb0-77ff-4745-a96f-a0da03c42d17`, see `.design-sync/`) is the **old**
  forest-green look. The fresh design system here is authored anew in Claude
  Design, independent of that sync.
- Porting the finished design into the real React app (and any re-sync of a
  restyled component library) happens *later*, only once the design is settled.

## How to use this in Claude Design

Build the new system + screens in Claude Design from the locked palette tokens
+ play-screen model above. Suggested order: design-system foundations (color
tokens, type, the core grid primitives — cell, def-cell, split cell, clue
rail, keyboard key, button) → the **play screen** (anchors everything) → the
**win/celebration** screen (where sakura bloom returns) → home/daily → account.
Decide typography early, with real renders. Treat "still open" as the agenda.
