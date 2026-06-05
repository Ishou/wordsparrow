# /contribuer Metadata Band — Field-by-Field Inline Editing (Variant C)

## Status
Design — approved direction, pending spec review.

## Context

The `/contribuer` metadata band (`frontend/src/ui/components/sondage/MetadataBand.tsx`)
today renders its six fields **twice**: once as a read-only `<dl>` summary
(Nature, Style, Catégories, Sens, Mots-clés, Difficulté), then again in full as an
editable section below a divider once the user hits **Ajuster**. The two lists are the
same data in two representations — a duplicated section that adds height, scanning cost,
and maintenance surface for no UX gain.

The band is auth-only (ADR-0061) and is the sole difficulty-display surface for the
authed tier. Most contributors **confirm without editing**; a minority tweak one or two
fields. The redesign must keep the fast confirm path while letting an editor change a
single field in place, with no duplicated section.

Selected direction: **field-by-field inline editing**. Read-only compact grid by
default; clicking one value swaps just that cell to its editor; the rest stay
summarized. No global edit mode, no divider, no second copy.

## Decision

### Model
One representation: the compact summary grid. Each row is read-only until that row is
opened for editing. The band's existing tri-state commit model (status badge +
Confirmer/Enregistrer primary action + Réinitialiser) and its re-seed-on-item-change
behavior are unchanged. This redesign reshapes only how the six rows display and edit.

The global **Ajuster / Réduire** toggle, the `expanded` band state, and the full-width
divider are **removed**. The freed `A` keyboard shortcut is retired (not reassigned).

### Per-field behavior

| Field       | Editable? | Display (resting)                    | Editor (open)                                  |
|-------------|-----------|--------------------------------------|------------------------------------------------|
| Nature      | yes       | POS label as a quiet value button    | native `<select>`; picking a value auto-closes |
| Style       | **no**    | tooltip text (read-only), no ✎       | — (never toggles)                              |
| Catégories  | yes       | comma-joined labels as value button  | in-place encart: chips + "toutes les catégories" picker |
| Sens        | yes       | value, or `+ préciser le sens…` pill | free-text input + autocomplete from priors     |
| Mots-clés   | yes       | tags, or `+ ajouter…` pill           | chip input + autocomplete from priors          |
| Difficulté  | **no toggle** | always-live dot picker           | — (the dots are the control; announced shown muted until perceived is set) |

Only **Nature, Catégories, Sens, Mots-clés** swap display ⇄ editor — exactly the four
that were duplicated. Style stays read-only. Difficulté stays an always-interactive
compact picker (no open/close), because it is the field contributors touch most and a
click-to-edit dance there would be pure friction.

### Cross-cutting interaction rules (the "smoothest possible" contract)

1. **Affordance without noise.** At rest, editable values read as quiet text. Hover or
   keyboard focus tints the row and reveals a ✎ glyph. On touch / no-hover
   (`@media (hover: none)`), the ✎ stays faintly visible permanently so editability is
   discoverable without hover.
2. **Inviting empty states.** Empty editable fields render a dashed
   `+ préciser le sens…` / `+ ajouter…` pill instead of a dead `—`. Doubles as the
   touch-affordance and the primary discoverability cue.
3. **Zero-friction entry.** Click, or Enter/Space on a focused value, swaps that one
   cell to its editor and moves focus into it (no second click). Text caret lands at the
   end of existing content.
4. **One field open at a time.** Opening another field (via click or `Tab`) commits and
   closes the currently open one. Never more than one editor open.
5. **Live commit, gentle exit.** Every keystroke / choice updates the band model
   immediately (badge → Modifié). `Enter` or blur closes the editor keeping the value;
   `Escape` reverts the in-flight edit to the value-at-open and closes. A native
   `<select>` auto-closes on pick; chip editors (Catégories, Mots-clés) stay open until
   focus leaves their region.
6. **Minimal layout shift.** The editor appears in the same grid cell; transition is a
   140 ms fade + height, disabled under `prefers-reduced-motion`. The rest of the band
   does not jump.
7. **Managed focus (a11y, ADR-0050 / WCAG AA).** Each editable value is a real `button`
   with a descriptive `aria-label` (e.g. "Modifier le sens — vide"). Open → focus moves
   to the editor; close → focus returns to the trigger button. Tab order stays linear.
   Tap targets ≥ 24×24.
8. **Keyboard hygiene.** `Tab` walks the value buttons. `Space` remains the band's
   Confirmer shortcut **only when focus is not inside a text editor** — typing a space in
   Sens / Mots-clés must never trigger confirm. This requires the card-level Space
   handler to ignore events originating from an open editor.
9. **Réinitialiser** closes any open editor and restores the baseline, returning every
   row to read-only display.

### Validation change (correction from review)

"Sens" and "Mots-clés" are **metadata** (the target sense and associated concepts),
**not** the clue shown to players. The ADR-0061 no-repeat-the-lemma rule is a *clue*
constraint and does not apply to metadata. Therefore:

- The `bannedTerm={item.mot}` wiring is **removed** from both `SenseInput` and
  `GlossChipInput` as used by the band. No `aria-invalid`, no repetition error, no
  inline alert, no focus-trap. Enter/blur always commits.
- Trivial, non-blocking constraints remain: trimming, max length, and de-duplication on
  Mots-clés.
- The existing test asserting the sens repetition error
  ("the lemma cannot be entered as a sense (ADR-0061 repetition rule)") is **deleted**.
- If `bannedTerm` becomes unused after removal, drop the prop entirely from the
  component(s); if it is still referenced by another consumer, leave the prop but stop
  passing it from the band. (Verify at implementation time.)

### State ownership

- `useMetadataBand` keeps owning the band values + tri-state. It **loses** `expanded` /
  `toggleExpanded` (no global expand).
- `MetadataBand` gains a local `openField: FieldKey | null` (the single open editor).
  Opening a field sets it; committing/closing clears it. POS continues to live in
  `RatingCard` (`correctifPos`) and reaches the band via `pos` / `onPosChange` — the
  Nature inline editor drives `onPosChange`, exactly as the current select does.

## File structure

- **`MetadataBand.tsx`** — rewritten around the single grid. Each row renders either a
  read-only display or its editor based on `openField`. Owns `openField` state, focus
  return, Escape/blur handling, the per-row affordance. The Ajuster button, `expanded`
  plumbing, and divider are deleted.
- **`InlineEditableRow.tsx`** *(new, small)* — reusable wrapper for a grid row that
  toggles between a display `button` and an editor. Props: `label`, `isOpen`,
  `onOpen`, `onCancel` (Escape), `onCommit` (Enter/blur), `renderDisplay`,
  `renderEditor`. Centralizes focus management, key handling, and motion so each field
  stays declarative. Difficulté and Style do not use it (they never toggle).
- **`useMetadataBand.ts`** — remove `expanded` / `toggleExpanded` from the interface and
  implementation; everything else unchanged.
- **`SenseInput.tsx`** — drop the `bannedTerm` ban path; expose what the inline wrapper
  needs (autofocus, Enter/Escape signaling). Keep autocomplete.
- **`GlossChipInput.tsx`** — drop the `bannedTerm` ban path; keep length/dedupe/max-items.
- **`PerceivedDifficultyPicker.tsx`** — unchanged; rendered as the always-live
  Difficulté row.
- **`StyleTooltip.tsx`** — unchanged; rendered as the read-only Style row.
- **`RatingCard.tsx`** — adjust how the band is mounted: remove reliance on `expanded`;
  ensure the Space-to-confirm handler ignores events from an open editor.
- **`tests/sondage-rating-card-meta.test.tsx`** — substantial rewrite: replace the
  `expandBand` (global Ajuster) helper with per-field `openField(name)` helpers; delete
  the sens-repetition test; keep coverage for category add/remove/cap/exclusive,
  sense threading, sub-tag add/remove, prior autocomplete, item-change reset, and the
  Nature reset-to-prior behavior — each now routed through opening the relevant field.

## Consequences

- **Easier:** one source of truth for each field's presentation; no duplicated section;
  shorter resting band; the confirm-fast path is preserved and slightly cleaner.
- **Harder / riskier:** per-field affordances must be discoverable (mitigated by inviting
  empty pills + persistent touch ✎); focus management on open/close must be correct;
  the Space-confirm-vs-typing conflict must be handled. These are the parts to test.
- **Behavior change beyond layout:** metadata fields no longer reject the lemma. This is
  intentional and aligns the fields with their metadata semantics.
- **Test churn:** the meta test file is largely rewritten around the new interaction; net
  coverage is equal or higher.

## Out of scope

- The band's commit/tri-state semantics, status badge copy, re-seed-on-item-change.
- Any backend / submit-shape change (`onCorriger` / `onVerdict` payloads unchanged).
- The pairs (`/contribuer/pairs`) surface.
- Difficulté semantics (announced vs perceived) — unchanged.
