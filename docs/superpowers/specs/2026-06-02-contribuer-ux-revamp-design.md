# Design — `/contribuer` UX/UI revamp

## Status

Proposed — 2026-06-02.

## Context

`/contribuer` is the single-card clue-rating loop in the survey bounded
context (ADR-0056). An external mock-up agent produced a functional spec +
screenshots for a "Contribuer" redesign (warm field-journal aesthetic, a
collapsible AI-suggested metadata band with gold/amber/green states, J/K/L
verdicts, session counters). The mock-up was authored **outside the project**
and invents a data model that partially conflicts with the live survey
context.

This spec is the **adaptation** of that mock-up to the real project. It is a
**pure frontend UX/UI revamp** of the existing loop. It introduces **no
backend or schema changes**. Field names, the real `SurveyItem` /
`RatingSubmission` shapes, auth gating, and rating undo are all preserved.

### Current state (what exists today)

- Route: `frontend/src/ui/routes/contribuer.tsx` (eager head + skeleton) +
  `contribuer.lazy.tsx` (loop) + `RatingCard.tsx` (448 lines — the card and
  all metadata inputs).
- Pairwise sibling already exists: `/contribuer/pairs`
  (`contribuer.pairs.{tsx,lazy.tsx}`) — the "Mode paires →" link already
  points here (`contribuer.lazy.tsx:281`).
- Verdicts today: **4 buttons** — Mauvaise (`J`, qualite=1), Passer (`K`,
  no write), Bonne (`L`, qualite=5), **Corriger (`C`)** which opens an inline
  text+POS editor and submits a `correctif` (auto-GOOD + propose).
- Metadata (auth-only, per-rating, committed *with* the verdict):
  `targetCategories` (seeded from the item's single `categorie`),
  `targetSense` (free text, empty; autocompletes from
  `getLemmaMeta(mot).priorSenses`), `isMultisense` (user checkbox; disables
  the sense field), `subTags` (free chips, empty; autocompletes from
  `priorSubTags`).
- `difficulte` is **required** in `RatingSubmission` but hardcoded to `3`.
- Rating undo: 8s grace via `/v1/actions/undo` (`undoToken`).
- Toasts: single-slot imperative `useToast()` context, tones `info` / `error`
  only, used today for errors.

### Data-model reality vs the mock-up's invented model

| Mock-up field | Real shape | Disposition |
|---|---|---|
| `word` | `mot` | keep `mot` |
| `type` (7 POS) | `pos` (**13** values, incl. `polyvalent`) | keep all 13 |
| `style` (2 values) | `style` (**9** values) | keep all 9 |
| `announcedDifficulty` | `forceClaimed` | keep `forceClaimed` |
| `suggestedCategories` (AI baseline) | `categorie` (single seed) | **no AI baseline** — seed from single `categorie` |
| `keywords` (AI-suggested set) | `subTags` (empty, autocomplete-seeded) | **no AI baseline** |
| `ambiguous` + `senseOptions` (data-driven) | `isMultisense` (user checkbox), no candidate senses | **dropped** — no picker, no `senseOptions` |
| `sense` | `targetSense` (free text) | keep `targetSense` |
| perceived difficulty 1–5 | `difficulte` (hardcoded 3) | **wire for real** |

## Decision

### Scope

Frontend-only revamp. Adopt the mock-up's **visual language and interaction
model**; reject the parts that depend on data the backend does not produce.
Two genuinely new wirings: the metadata-band visual state machine
(**local UI state only**) and a real `difficulte` 1–5 selector.

### Adopted from the mock-up

- Field-journal aesthetic: Fraunces (serif: word, definition, headings) +
  Hanken Grotesk (sans: UI), paper background, leaf motifs, gentle
  fade-and-rise entry on each advance.
- One card center-stage; single centered column (~680px max).
- Header: brand `WordSparrow` + `Alpha` badge; live stats strip; campaign
  title `Campagne de qualité des indices` + meta line `Moineau 10 —
  01/06/2026` · `Mode paires →` link (existing route).
- Collapsible **tri-state metadata band** (gold → amber → green), **local UI
  state**; a follow-up backend workstream will give the states persisted
  meaning.
- **Full, non-truncated** collapsed summary: every category, the sense text,
  every keyword.
- Verdicts `J`/`K`/`L` = Mauvaise/Passer/Bonne; secondary `Signaler` (`S`);
  `Space` acts on the band's current-state primary action.
- Session counters: **Notées** / **Enrichies** / **Série** — counters only,
  no goal/progress bar.
- Toasts on every action with positive / negative / neutral / metadata tones
  and the verbatim copy in Appendix A.

### Rejected / adapted (incoherences in the mock-up)

1. **No AI baseline.** The mock-up's Suggested→Modified→Saved machine assumes
   AI suggestions to "confirm." We have none. The band's pristine state =
   the item's seeded single `categorie` + empty sense/keywords + difficulty.
   The state machine is **local UI affordance only**; nothing persists until
   rate-time. "Saving" writes nothing — rating always commits the live
   metadata regardless of band state.
2. **`pos` and `isMultisense` stay separate.** The mock-up's "Polyvalent =
   a pun spanning several parts of speech" conflates an orthogonal POS value
   with the multi-sense pun flag. `polyvalent` remains just another `pos`
   value (styled apart in the dropdown per the mock-up); `isMultisense`
   remains the pun flag.
3. **`isMultisense` stays a user checkbox** (mock-up's "data-driven, not
   user-editable" rejected — that data doesn't exist). The "◆ Plusieurs
   sens" badge reflects the live `isMultisense` value; the `targetSense`
   free-text field disables when it is checked (current behavior). **No
   sense picker** (no `senseOptions`).
4. **"Saved" vs "Modified" is local-only.** Kept as a UI affordance per the
   approved decision, not faked as persistence. The spec is explicit that no
   save endpoint exists.

### Correction (`C`) — kept as its own action

`C` (and a "Corriger la définition" affordance, and double-click on the
definition) opens the inline definition editor. Confirming
(`Enregistrer la correction`) submits the `correctif` with auto-GOOD +
propose — **current semantics preserved**, restyled as the inline-edit
affordance rather than a 4th verdict button. `Annuler` cancels. This keeps
the existing backend capability untouched; J/K/L remain for uncorrected
rating.

### Perceived difficulty — wired for real

Add a 1–5 `PerceivedDifficultyPicker` in the metadata band
("Difficulté ressentie", showing announced difficulty for reference) and
submit the chosen value in `difficulte` instead of the hardcoded `3`. Uses
an existing schema field; changes what is submitted (real perceived
difficulty vs always-middle).

### Auth gating (preserved)

Metadata is auth-only (ADR-0056 / ADR-0061 — anon meta returns 401). The
**metadata band renders only for signed-in users**. Anon raters see the card,
the verdict buttons, the style tooltip and difficulty display — no band.

### Rating undo (preserved)

Keep the existing 8s undo (`/v1/actions/undo`, `undoToken`). The mock-up
omits it; removing it would be a regression. The mock-up's "Annuler
l'enregistrement" is **metadata-band** undo (local), distinct from rating
undo.

## Component decomposition

Today's `RatingCard.tsx` (448 lines) is too large; split it for isolation and
testability. All new code lives in `ui/` (view state) and respects
eslint-plugin-boundaries.

- `RatingCard` — card shell: top meta row, large word, inline-editable
  definition, verdict buttons. Owns no metadata state.
- `MetadataBand` (new) — the collapsible tri-state band; presentational,
  driven entirely by `useMetadataBand`.
- `useMetadataBand` (new hook) — the **local** state machine
  (`pristine → modified → saved`), diffs each field against the card's seeded
  baseline, exposes the derived `RatingSubmission` metadata fields + an
  `enriched` boolean (true once the human edits any field or confirms).
  Designed so the planned backend follow-up plugs in.
- Top-meta sub-parts: `TypeSelect` (13 POS, `polyvalent` styled apart),
  `StyleTooltip`, display-only difficulty dots, "◆ Plusieurs sens" badge.
- Metadata fields: reuse `CategorieMultiSelect`, `SenseInput`,
  `GlossChipInput`; add `PerceivedDifficultyPicker`.
- Page (`contribuer.lazy.tsx`): restyle, header stats strip, session
  counters, card entry animation, keyboard-shortcut legend.

### Metadata-band state semantics (local)

- **pristine / gold** — `✦ Suggéré par l'IA · non vérifié`. Seeded
  `categorie` + empty sense/keywords + difficulty. Primary action
  `Confirmer` (`Space`) → saved.
- **modified / amber** — `● Modifié · non enregistré`. Any field differs from
  the card baseline (the instant an edit happens). Actions `Enregistrer`
  (`Space`) + `Réinitialiser`.
- **saved / green** — `✓ Enregistré`. Actions `Annuler l'enregistrement` +
  `Réinitialiser`. Editing any field → back to modified.
- `Réinitialiser` discards human edits → pristine. `Annuler
  l'enregistrement` reverses a save without discarding → modified (or pristine
  if nothing was edited). A field is "modified" only when it differs from the
  card's seeded baseline.
- **Rate-time commit:** rating always submits the live metadata with the
  verdict, regardless of band state. Toast subtitle reflects which case
  occurred (saved / edited-not-saved / untouched).
- **Enrichies** counts only cards the human edited or confirmed (the
  `enriched` flag), not cards where the seeded values were merely carried
  along.

## Styling

Panda CSS tokens only — **no hex literals** (frontend skill / ADR-0005). Map
the mock-up's Appendix B palette onto existing brand tokens; add the missing
gold/amber ramp entries to `frontend/panda.config.ts`. Fraunces + Hanken
Grotesk via the existing font-loading path.

## Style tooltip copy (derived from `docs/clue-style-guide-v2.md` §4)

Tooltip layout: title line `Style : {label}`, a one-line definition, then an
`Exemple` block. Draft copy for all 9 styles (for review):

- **Définition directe** — `Sens premier du mot : synonyme, paraphrase courte
  ou étiquette grammaticale. Aucun détour.` · ex. `RAT → « Rongeur »`
- **Périphrase** — `Désigne le mot par une caractéristique ou un attribut
  emblématique, sans synonyme direct.` · ex. `COQ → « Mâle de la
  basse-cour »`
- **Métonymie** — `Pointe le mot par contiguïté : contenant pour contenu,
  lieu pour activité, partie pour tout.` · ex. `NO → « Côté breton »`
- **Fonction / rôle** — `Désigne le mot par son usage ou l'action qu'il
  accomplit — typiquement un verbe d'action.` · ex. `COU → « Porte la
  tête »`
- **Calembour** — `Jeu de mots à double sens signalé par un « ? » final, qui
  met le solveur en alerte.` · ex. `VENT → « Met les voiles ? »`
- **Culturel** — `Référence à une œuvre, un personnage, un lieu ou un fait
  reconnaissable. Le solveur identifie la référence.` · ex. `NOÉ → « Rescapé
  du déluge »`
- **Cryptique** — `Définition indirecte : double sens implicite, sans « ? ».
  Le solveur décode une astuce plutôt qu'une définition littérale.` · ex.
  `AVOCAT → « Robe noire ou peau verte »`
- **Cryptique morphologique** — `Opération sur la graphie d'un autre mot :
  lettre ôtée, accent supprimé, palindrome, troncature.` · ex. `LOU → « Loup
  sans p »`
- **Technique** — `Renvoie à un domaine spécialisé (sciences, sport, musique,
  informatique…) via un marqueur de domaine ou un terme catégoriel.` · ex.
  `HZ → « Unité de fréquence »`

Styles without full copy degrade gracefully to the label alone — but all 9
are covered above.

## Keyboard shortcuts (active when not typing in a field)

`J`/`K`/`L` rate + advance; `C` edit definition; `A` expand/collapse band;
`S` signaler + advance; `Space` band primary action (only when not already
saved).

## Toasts

Extend the existing single-slot `useToast()` with tones positive / negative /
neutral / metadata and icons `✓` / `!` / `↺` / `✓`. Wire the verbatim
messages in Appendix A, including the metadata-outcome subtitles
(saved / edited-not-saved / untouched).

## Visual verification (Playwright, against the mock-up screenshots)

The revamp is verified visually against the 4 mock-up screenshots, with an
AI-driven render → screenshot → compare → adjust loop:

- **Reference baselines:** save the 4 supplied mock-up screenshots as
  reference images under `frontend/tests/visual/contribuer/` (card default,
  band expanded, style tooltip, full category list expanded).
- **Deterministic deck:** the mock-up screenshots show a specific deck
  (AUTOMNE / SOURIS / HIBOU / ÎLE) and a fully-expanded band (Météo,
  Conceptuel, sense text, keywords). To reproduce them, add an **MSW preview
  fixture** serving that exact deck (preview/mock mode only — never in the
  prod bundle; see frontend skill). `getLemmaMeta` and the seeded `categorie`
  must match the screenshots.
- **Driver:** Playwright (the project's `pnpm e2e` Playwright, or the
  Playwright MCP during the AI loop) drives the preview build, navigates to
  `/contribuer`, exercises each state (default card, expand band via `A`,
  hover the style label for the tooltip, expand the full category list), and
  captures screenshots.
- **Loop:** compare each capture to its reference baseline; adjust Panda
  tokens / layout; repeat until it visually matches. This is the acceptance
  bar for the look-and-feel, complementing the behavioral tests below.
- The four states to match: (1) card with collapsed band, (2) band expanded
  with editable fields, (3) style tooltip popover, (4) full category list
  expanded.

## Testing

- `useMetadataBand`: unit tests for the state machine — pristine→modified on
  edit, →saved on confirm, `Réinitialiser`/`Annuler l'enregistrement`
  transitions, baseline-diff `enriched` flag, derived submission fields.
- `RatingCard` / page: verdict → submit + advance, `C` correction flow
  (correctif submitted), `S` flag, keyboard shortcuts gated when typing,
  anon path hides the band, rating undo bar.
- Tests under `frontend/tests/`, deterministic fixtures (no `Date.now()` /
  `Math.random()`), Testing Library accessible queries.

## Consequences

- **Easier:** a clear, accessible rating surface; the band state machine is
  isolated in a hook that the backend follow-up can extend; the 448-line
  component is decomposed.
- **Harder / changed:** `difficulte` now carries real perceived difficulty
  (downstream consumers should expect non-`3` values); the band's
  saved/modified distinction is intentionally local theater until the backend
  follow-up lands.
- **Out of scope (backend follow-up seams):** persisted "verified" flag, real
  AI suggestions for sense/keywords, candidate `senseOptions` + a true
  ambiguous-word sense picker.

## Appendix A — verbatim UI strings & toasts

(Reproduce exactly.)

### Status labels
- pristine `✦ Suggéré par l'IA · non vérifié`
- modified `● Modifié · non enregistré`
- saved `✓ Enregistré`

### Band buttons
- pristine `Confirmer` (`Espace`); modified `Enregistrer` + `Réinitialiser`;
  saved `Annuler l'enregistrement` + `Réinitialiser`; toggle `Ajuster ▾` /
  `Réduire ▴` (`A`).

### Field labels / hints
- Categories: `Catégories` + `— l'IA en a surligné {n}`; expander
  `+ Toutes les catégories ▾` / `– Réduire les catégories ▴`.
- Sense (mono): `Sens visé par cette définition` +
  `— le sens exact que l'indice cible`; placeholder `ex. saison entre l'été
  et l'hiver`.
- Keywords: `Mots-clés` + `— concepts associés, pour la recherche &
  l'entraînement`; placeholder `+ ajouter…`.
- Perceived difficulty: `Difficulté ressentie` +
  `— annoncée : {forceClaimed}/5`.
- Band overline: `Métadonnées` + `· optionnel, aide l'entraînement`.

### Card / header
- Brand `WordSparrow` + badge `Alpha`; title `Campagne de qualité des
  indices`; meta `Moineau 10 — 01/06/2026` · `Mode paires →`.
- Stats: `Notées {n}`, `Enrichies {n}`, `série {n} 🔥`.
- Card top: `Style : {style}` · `Difficulté annoncée` (5 dots) · badge
  `◆ Plusieurs sens`. Type control title `Modifier le type (nature)`.
- Definition edit: trigger `Corriger la définition` (`C`); submit
  `Enregistrer la correction`; cancel `Annuler`.
- Verdicts: `Mauvaise` (`J`), `Passer` (`K`), `Bonne` (`L`); `Signaler`
  (`S`).
- Legend: `J K L noter` · `C corriger` · `A ajuster les métadonnées` ·
  `Espace confirmer / enregistrer`.

### Toasts (title — subtitle)
- Bonne: `Noté : Bonne` — saved → `métadonnées vérifiées enregistrées`;
  edited-not-saved → `vos modifications de métadonnées sont enregistrées`;
  untouched → `suggestions IA conservées (non vérifiées)`.
- Mauvaise: `Noté : Mauvaise` — same subtitle logic.
- Passer: `Passé — au suivant` — same subtitle logic.
- Confirm/Save: `Métadonnées enregistrées` — `vos modifications sont
  incluses` (edited) or `suggestions IA validées` (untouched).
- Undo save: `Enregistrement annulé` — `modifications conservées, non
  enregistrées` or `retour aux suggestions IA`.
- Reset: `Réinitialisé aux suggestions IA` (no subtitle).
- Definition committed: `Définition corrigée` (no subtitle).
- Type changed: `Type mis à jour` — subtitle = new type label.
- Flag: `Indice signalé pour révision` (no subtitle).
- Icons by kind: positive `✓`, negative `!`, neutral `↺`, metadata `✓`.
