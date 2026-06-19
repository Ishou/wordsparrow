# WordSparrow — Claude Design build plan

**Date:** 2026-06-20 · Companion to
`2026-06-20-wordsparrow-design-foundation.md`. An ordered set of **ready-to-paste
prompts** for building the fresh design system + screens **in Claude Design**
(claude.ai/design). Pure design — no `frontend/` code.

**How to use:** start a fresh Claude Design project. Paste the phases in order;
after each, look at the render, iterate in plain language, then move on. Phases
0–1 build the visual language; 2–5 build screens on it. Real renders beat my
HTML sketches — trust your eye over the mockups.

**Locked palette (paste reference):**
`Jade field #C4E5D3 (grad #CDE9DA→#BBE0CD)` · `Jade-ink #214B40` ·
`Sable #E8E2C6` · `Khaki #4C4824` · `Or #D8C77A` · `Sakura #D45D83`
(rose `#E586A4`, blush `#F7DEE7`) · `White #FFFFFF`.
Rule: jade = field/structure, khaki = ink/foliage, **sakura = single live accent**.

---

## Phase 0 — Design tokens & type

> Build the foundation of a design system for **WordSparrow**, a serene,
> elegant, naturalist daily French *mots fléchés* (crossword) game. Mobile-first.
> Mood: calm, warm, kimono-inspired (jade green + cherry blossom + foliage),
> playful only in small moments. Define color tokens:
> — surfaces: `jade-field #C4E5D3` (also a soft gradient `#CDE9DA→#BBE0CD`),
>   `white #FFFFFF`, `sable #E8E2C6`.
> — ink: `jade-ink #214B40` (primary text, headings), `khaki #4C4824` (letters,
>   body).
> — accents: `or #D8C77A` (arrows, small accents), `sakura #D45D83` (the single
>   live accent — active states, primary CTA), with `sakura-rose #E586A4` and
>   `sakura-blush #F7DEE7`.
> — states (propose, keep WCAG AA): success, error (a terracotta, clearly NOT
>   sakura), focus ring.
> Define a radius scale (cells/cards lean soft, ~8–14px), spacing scale, and one
> soft shadow. Then propose **3 type pairings** for me to compare with real
> text: a display/heading face and a body/UI face, plus a monospace for letters.
> Keep it tasteful and editorial, not techy.

*Check:* pick the type pairing here — it's load-bearing and we never chose one.

## Phase 1 — Core grid primitives

> Using those tokens, design the core *mots fléchés* grid components:
> 1. **LetterCell**, three states: *empty* (white, soft shadow, khaki letter),
>    *solved* (`sable #E8E2C6` fill, khaki letter), *active* (`sakura #D45D83`
>    fill, white letter, subtle `#BE4970` inner ring). Rounded ~9px.
> 2. **DefCell** (clue cell): `jade-ink #214B40` fill, white clue text, a gold
>    `#D8C77A` arrow pointing right or down (the fléchés signature).
> 3. **SplitDefCell**: a def-cell holding two clues, stacked with a hairline
>    divider — top clue with a right arrow, bottom clue with a down arrow.
> 4. **ClueRail**: a white rounded card — a small gold label "HORIZONTAL ▸"
>    with a sakura dot, the active clue in `jade-ink` (large, legible), `‹ ›`
>    steppers, and a position counter (e.g. 4/18).
> 5. **KeyboardKey**: white, khaki letter, soft shadow; a **confirm key** in
>    `sakura #D45D83` with a white check.
> 6. **Button**: primary (sakura), secondary (jade-ink outline), ghost.
> 7. **StreakPill**: translucent-white pill on the jade field, jade-ink text
>    (e.g. "🔥 7 · 02:14").
> Show them on the jade field so contrast reads true. Keep AA.

## Phase 2 — Play screen (the anchor)

> Design the **play screen** (mobile) from those primitives. Jade-field
> background. Top: the WordSparrow wordmark (left) + StreakPill (right). Center:
> a *mots fléchés* grid shown at solving zoom — a window into a larger grid
> (cells bleed past the edges). Include def-cells with in-cell clues + arrows,
> a split two-clue cell, several solved cells (sable), empty cells (white), and
> one **active word** as solid sakura with white letters (e.g. answer "PARIS"
> for clue "Capitale de la France"). A simple `− / +` zoom control on its own
> row (no minimap covering the board). Below the grid: the **ClueRail** showing
> the active clue. Bottom: a French **AZERTY** on-screen keyboard with the
> sakura confirm key. Calm, generous spacing. Real French clue text
> ("Petit oiseau", "Arbre fruitier", "Cours d'eau", "Note", "Article défini").

*Iterate here the most — this screen sets the bar.*

## Phase 3 — Win / celebration

> Design the **win screen** — the reward moment. This is where the cherry
> blossom finally blooms: the completed grid briefly fills with `sakura-blush`,
> petals/bloom motion (tasteful, not confetti spam). Show the final time, the
> streak (now 🔥 8), a "Parfait !" headline in the display face, and two
> actions: primary **Rejouer** and secondary **Partager**. Maybe a small
> "Revenez demain" line. Warm, celebratory but elegant — the one place pink is
> allowed to be generous.

## Phase 4 — Home / daily

> Design the **home / daily** screen: today's puzzle as the hero (date, a
> "Jouer" primary CTA, difficulty), the streak, and access to past puzzles
> (a calendar or list — "Grilles précédentes"). Jade field, sable/white cards.
> Keep it a calm daily-ritual landing, not a busy dashboard.

## Phase 5 — Account & settings

> Design the **account** screen: profile (pseudonym, avatar), preferences
> (notifications via the RadioGroup/ToggleGroup style), and a quiet settings
> list. Reuse the button + field primitives. Restrained.

---

## Standing guidance for every phase

- **Mobile-first.** Phone is primary; desktop is a later adaptation.
- **AA contrast** on everything (it's a hard requirement). Watch khaki-on-sable
  and any text on the jade field.
- **Pink is a jewel.** One sakura moment per screen (active word; primary CTA;
  the win bloom). If a screen is getting pink-heavy, pull back.
- **Identity is the grid** — never let the grid become a plain table; arrows +
  in-cell clues stay.
- Use **real French content**, never lorem/foo.

## Open decisions to resolve as you go

Typography (Phase 0), motion language, dark mode, exact state colors. These are
the agenda — the foundation brief lists them.
