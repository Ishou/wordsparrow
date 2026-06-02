# Contribuer UX Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the `/contribuer` single-card rating loop into the warm field-journal aesthetic with a collapsible tri-state metadata band (local UI state), a real perceived-difficulty selector, preserved correction + auth gating, and Playwright visual verification against the mock-up screenshots.

**Architecture:** Frontend-only. Decompose the 448-line `RatingCard.tsx` into a card shell + a presentational `MetadataBand` driven by a new `useMetadataBand` hook that owns a local `pristine → modified → saved` state machine. The page (`contribuer.lazy.tsx`) owns the hook so it can read band state at submit-time for the rating payload and toast subtitle. No backend/schema changes; metadata still commits with the verdict.

**Tech Stack:** React 19, TanStack Router, Panda CSS (tokens only), Ark UI primitives, Vitest + Testing Library, MSW (preview-only), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-02-contribuer-ux-revamp-design.md` — read it before starting.

---

## Pre-read (every workstream)

Run `scripts/adr-context.sh` on the paths you touch and read the matched ADRs in full. For this feature the load-bearing ones are ADR-0002 (frontend stack, §4 uncontrolled inputs), ADR-0005 (brand tokens), ADR-0050 (a11y, 56px targets), ADR-0056 (survey context), ADR-0061 (auth-only meta). Read the frontend skill (`.claude/skills/frontend/SKILL.md`).

## File structure

| File | Responsibility | Disposition |
|---|---|---|
| `frontend/panda.config.ts` | Add band-state semantic tokens (gold/amber/green) mapping onto existing ramps | Modify |
| `frontend/src/ui/components/sondage/useMetadataBand.ts` | Local tri-state machine + baseline diff + derived submission fields + `enriched` | Create |
| `frontend/src/ui/components/sondage/MetadataBand.tsx` | Presentational band: collapsed summary, status, buttons, expandable fields | Create |
| `frontend/src/ui/components/sondage/PerceivedDifficultyPicker.tsx` | 1–5 dots selector wired to `difficulte` | Create |
| `frontend/src/ui/components/sondage/StyleTooltip.tsx` | Style label + Ark tooltip, 9-style copy | Create |
| `frontend/src/ui/components/sondage/styleCopy.ts` | The 9-style tooltip strings (from clue-style-guide-v2 §4) | Create |
| `frontend/src/ui/components/sondage/RatingCard.tsx` | Card shell: top meta row, word, inline-edit definition, verdicts; renders MetadataBand | Modify (shrink) |
| `frontend/src/ui/components/sondage/CategorieMultiSelect.tsx` | Restyle to gold-tinted pill chips + full-list expander | Modify |
| `frontend/src/ui/components/sondage/SenseInput.tsx`, `GlossChipInput.tsx` | Restyle to field-journal | Modify |
| `frontend/src/ui/components/primitives/Toast.tsx` | Add positive/negative/neutral/metadata tones + icons | Modify |
| `frontend/src/ui/routes/contribuer.lazy.tsx` | Page shell, header stats strip, session counters, owns `useMetadataBand`, toasts, entry animation | Modify |
| `frontend/src/ui/routes/contribuer.tsx` | Restyle skeleton to match | Modify |
| `frontend/src/infrastructure/mocks/handlers/` + `fixtures/` | Preview deck matching the mock-up (AUTOMNE/SOURIS/HIBOU/ÎLE) | Modify |
| `frontend/tests/visual/contribuer/` | Playwright visual specs + 4 reference baselines | Create |

## Workstream decomposition (PR-sized, ≤400 lines each)

- **WS-A — Design tokens + page shell** (no dep). Panda band tokens, fonts, paper bg, leaf motifs, header brand+stats strip, campaign meta line, legend, card entry animation. Mostly CSS; behavior unchanged.
- **WS-B — `useMetadataBand` hook** (no dep). The state machine + tests. Pure logic, no visuals.
- **WS-C — `MetadataBand` + field restyle** (dep: A tokens, B hook). The band UI, collapsed summary, status/buttons, expandable fields, PerceivedDifficultyPicker, multisense badge. Wires B into the card.
- **WS-D — Card top row + StyleTooltip + verdicts + inline edit** (dep: A). TypeSelect restyle, StyleTooltip + 9-style copy, difficulty dots, verdict buttons, inline definition edit (correction flow preserved).
- **WS-E — Toasts + session counters + keyboard** (dep: C, D). Toast tones/copy, Notées/Enrichies/Série, Space/A/S shortcuts, rate-time commit + subtitle logic.
- **WS-F — MSW preview deck + Playwright visual baselines** (dep: all). Deterministic deck, 4 reference screenshots, visual loop.

Waves: **Wave 1** = A, B, D (independent). **Wave 2** = C (needs A+B). **Wave 3** = E (needs C+D). **Wave 4** = F (needs all).

---

## WS-B — `useMetadataBand` hook (do first; it anchors the contracts)

**Files:**
- Create: `frontend/src/ui/components/sondage/useMetadataBand.ts`
- Test: `frontend/tests/sondage-use-metadata-band.test.ts`

The hook's public contract (used by every later workstream):

```ts
export type BandState = 'pristine' | 'modified' | 'saved';

export interface BandValues {
  readonly targetCategories: ReadonlyArray<SurveyCategorie>;
  readonly targetSense: string;
  readonly isMultisense: boolean;
  readonly subTags: ReadonlyArray<string>;
  readonly perceivedDifficulty: LikertScore | null; // null until the human picks
}

export interface MetadataBand {
  readonly state: BandState;
  readonly enriched: boolean;       // state !== 'pristine'
  readonly values: BandValues;
  readonly expanded: boolean;
  readonly difficulteForSubmit: LikertScore; // perceivedDifficulty ?? 3
  setCategories(next: ReadonlyArray<SurveyCategorie>): void;
  setSense(next: string): void;
  setMultisense(next: boolean): void;
  setSubTags(next: ReadonlyArray<string>): void;
  setPerceivedDifficulty(next: LikertScore): void;
  confirm(): void;        // pristine|modified → saved
  undoSave(): void;       // saved → modified, or pristine if no edits
  reset(): void;          // → pristine, restores baseline
  toggleExpanded(): void;
  primaryAction(): void;  // Space: confirm() unless already saved (no-op when saved)
}
```

Baseline for a card: `{ targetCategories: [item.categorie], targetSense: '', isMultisense: false, subTags: [], perceivedDifficulty: null }`. A field is "modified" iff it differs from this baseline (order-insensitive for arrays). `difficulteForSubmit` is `perceivedDifficulty ?? 3` (keeps today's default for untouched cards; only enriched cards carry a real perceived value).

- [ ] **Step 1: Write failing tests**

```ts
// frontend/tests/sondage-use-metadata-band.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMetadataBand } from '@/ui/components/sondage/useMetadataBand';
import type { SurveyItem } from '@/application/survey';

const item = {
  itemId: 'i1', mot: 'AUTOMNE', definition: 'Elle précède l’hiver',
  pos: 'nom_commun', categorie: 'meteo', style: 'cryptique',
  forceClaimed: 3, longueur: 7, tier: 'mid', isCalibration: false,
} satisfies SurveyItem;

describe('useMetadataBand', () => {
  it('starts pristine, not enriched, difficulte defaults to 3', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    expect(result.current.state).toBe('pristine');
    expect(result.current.enriched).toBe(false);
    expect(result.current.values.targetCategories).toEqual(['meteo']);
    expect(result.current.difficulteForSubmit).toBe(3);
  });

  it('editing a field moves pristine → modified and enriches', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setSense('Saison entre l’été et l’hiver'));
    expect(result.current.state).toBe('modified');
    expect(result.current.enriched).toBe(true);
  });

  it('confirm from pristine → saved (verified, no edits)', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.confirm());
    expect(result.current.state).toBe('saved');
    expect(result.current.enriched).toBe(true);
  });

  it('reset restores baseline and returns to pristine', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setSubTags(['froid']));
    act(() => result.current.reset());
    expect(result.current.state).toBe('pristine');
    expect(result.current.values.subTags).toEqual([]);
  });

  it('undoSave from saved-with-edits → modified', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setSense('x'));
    act(() => result.current.confirm());
    expect(result.current.state).toBe('saved');
    act(() => result.current.undoSave());
    expect(result.current.state).toBe('modified');
    expect(result.current.values.targetSense).toBe('x');
  });

  it('undoSave from saved-no-edits → pristine', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.confirm());
    act(() => result.current.undoSave());
    expect(result.current.state).toBe('pristine');
  });

  it('editing after save returns to modified', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.confirm());
    act(() => result.current.setMultisense(true));
    expect(result.current.state).toBe('modified');
  });

  it('perceived difficulty: picking sets value, marks modified, drives submit', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setPerceivedDifficulty(5));
    expect(result.current.state).toBe('modified');
    expect(result.current.difficulteForSubmit).toBe(5);
  });

  it('reselecting the baseline category set returns to pristine', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setCategories(['meteo', 'conceptuel']));
    expect(result.current.state).toBe('modified');
    act(() => result.current.setCategories(['meteo']));
    expect(result.current.state).toBe('pristine');
  });

  it('primaryAction confirms unless already saved', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.primaryAction());
    expect(result.current.state).toBe('saved');
    act(() => result.current.primaryAction()); // no-op when saved
    expect(result.current.state).toBe('saved');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && pnpm test --run tests/sondage-use-metadata-band.test.ts`
Expected: FAIL — `useMetadataBand` not found.

- [ ] **Step 3: Implement the hook**

Implement `useMetadataBand(item)` returning the contract above. Hold `values` + an explicit `saved` flag in state. Derive `state`: if `saved` → `'saved'`; else if `valuesDifferFromBaseline` → `'modified'`; else `'pristine'`. `enriched = state !== 'pristine'`. Re-seed baseline + reset all state in a `useEffect` keyed on `item.itemId` (mirror the existing RatingCard reset effect at `RatingCard.tsx:233`). Array comparison is order-insensitive set equality. `confirm` sets `saved=true`; `undoSave` sets `saved=false`; `reset` restores baseline values and `saved=false`; any setter that changes a value sets `saved=false` first. `primaryAction` = `if (state !== 'saved') confirm()`.

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && pnpm test --run tests/sondage-use-metadata-band.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
cd frontend && pnpm typecheck && pnpm lint
git add src/ui/components/sondage/useMetadataBand.ts tests/sondage-use-metadata-band.test.ts
git commit -s -m "feat(frontend-survey): add useMetadataBand local state machine"
```

---

## WS-A — Design tokens + page shell

**Files:**
- Modify: `frontend/panda.config.ts`, `frontend/src/ui/routes/contribuer.lazy.tsx`, `frontend/src/ui/routes/contribuer.tsx`
- Test: `frontend/tests/contribuer-header-shell.test.tsx`

- [ ] **Step 1: Add band-state semantic tokens** to `panda.config.ts` `semanticTokens.colors`, mapping the spec's Appendix B palette onto existing ramps (gold/pristine → `secondary` honey ramp; amber/modified → a darker honey stop; green/saved → `primary` mousse). Add only the ramp stops you actually need; never hex literals in components.

```ts
// in semanticTokens.colors (illustrative names — keep the trio cohesive)
metaSuggestedBg:   { value: '{colors.secondary.100}' },
metaSuggestedLine: { value: '{colors.secondary.300}' },
metaSuggestedText: { value: '{colors.secondary.700}' },
metaModifiedBg:    { value: '{colors.secondary.200}' },
metaModifiedLine:  { value: '{colors.secondary.500}' },
metaModifiedText:  { value: '{colors.secondary.800}' },
metaSavedBg:       { value: '{colors.primary.100}' },
metaSavedLine:     { value: '{colors.primary.300}' },
metaSavedText:     { value: '{colors.primary.700}' },
```

- [ ] **Step 2: Write failing test** for the header shell (brand + stats strip placeholders + meta line + legend), asserting the new accessible structure.

```tsx
// frontend/tests/contribuer-header-shell.test.tsx — render the page with a mock surveyClient
// (follow the harness in tests/contribuer-route.test.tsx for router+context setup)
expect(screen.getByText('WordSparrow')).toBeInTheDocument();
expect(screen.getByText('Alpha')).toBeInTheDocument();
expect(screen.getByTestId('stats-notees')).toHaveTextContent('Notées 0');
expect(screen.getByTestId('stats-enrichies')).toHaveTextContent('Enrichies 0');
expect(screen.getByTestId('stats-serie')).toHaveTextContent('série 0');
expect(screen.getByRole('link', { name: /Mode paires/ })).toHaveAttribute('href', '/contribuer/pairs');
```

- [ ] **Step 3: Run, verify fail.** Run: `cd frontend && pnpm test --run tests/contribuer-header-shell.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement** the header (brand `WordSparrow` + badge `Alpha`, stats strip with `data-testid` hooks reading session counters defined in WS-E — for now wire to literal 0 placeholders that WS-E replaces), campaign meta line `Moineau 10 — 01/06/2026`, keep the existing `Mode paires →` link, add the keyboard legend, paper background + leaf motifs (inline SVG, `aria-hidden`), and the per-card fade-and-rise entry animation (CSS keyframes, gated on `prefers-reduced-motion`). All via Panda tokens.
- [ ] **Step 5: Run, verify pass.** Then `pnpm typecheck && pnpm lint && pnpm build`.
- [ ] **Step 6: Commit.** `git commit -s -m "feat(frontend-survey): field-journal shell + band-state tokens for /contribuer"`

---

## WS-D — Card top row, StyleTooltip, verdicts, inline definition edit

**Files:**
- Create: `frontend/src/ui/components/sondage/StyleTooltip.tsx`, `styleCopy.ts`
- Modify: `frontend/src/ui/components/sondage/RatingCard.tsx`
- Test: `frontend/tests/sondage-style-tooltip.test.tsx`, extend `tests/sondage-rating-card-meta.test.tsx`

- [ ] **Step 1: Create `styleCopy.ts`** — a `Record<string, { definition: string; example: string }>` for the 9 styles, content from the spec's "Style tooltip copy" section (derived from `docs/clue-style-guide-v2.md §4`). Unknown styles → fall back to label only.

```ts
export const STYLE_COPY: Record<string, { definition: string; example: string }> = {
  definition_directe: { definition: 'Sens premier du mot : synonyme, paraphrase courte ou étiquette grammaticale. Aucun détour.', example: 'RAT → « Rongeur »' },
  periphrase: { definition: 'Désigne le mot par une caractéristique ou un attribut emblématique, sans synonyme direct.', example: 'COQ → « Mâle de la basse-cour »' },
  metonymie: { definition: 'Pointe le mot par contiguïté : contenant pour contenu, lieu pour activité, partie pour tout.', example: 'NO → « Côté breton »' },
  fonction_role: { definition: 'Désigne le mot par son usage ou l’action qu’il accomplit — typiquement un verbe d’action.', example: 'COU → « Porte la tête »' },
  calembour: { definition: 'Jeu de mots à double sens signalé par un « ? » final, qui met le solveur en alerte.', example: 'VENT → « Met les voiles ? »' },
  culturel: { definition: 'Référence à une œuvre, un personnage, un lieu ou un fait reconnaissable. Le solveur identifie la référence.', example: 'NOÉ → « Rescapé du déluge »' },
  cryptique: { definition: 'Définition indirecte : double sens implicite, sans « ? ». Le solveur décode une astuce plutôt qu’une définition littérale.', example: 'AVOCAT → « Robe noire ou peau verte »' },
  cryptique_morphologique: { definition: 'Opération sur la graphie d’un autre mot : lettre ôtée, accent supprimé, palindrome, troncature.', example: 'LOU → « Loup sans p »' },
  technique: { definition: 'Renvoie à un domaine spécialisé (sciences, sport, musique, informatique…) via un marqueur de domaine ou un terme catégoriel.', example: 'HZ → « Unité de fréquence »' },
};
```

- [ ] **Step 2: Write failing test** — `StyleTooltip` renders `Style : {label}`, exposes the definition + an `Exemple` block on hover/focus (use the Ark Tooltip primitive; assert the trigger has the right `aria` and the content text appears after focus).
- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement `StyleTooltip`** using the existing Ark tooltip primitive (check `src/ui/components/primitives/` for an existing wrapper; if none, wrap `@ark-ui/react` Tooltip following the `Select` wrapper's pattern). Dark ink popover, paper text, ~280px, arrow.
- [ ] **Step 5: Restyle the card top row** in `RatingCard.tsx`: `TypeSelect` (reuse the existing `Select<SurveyPos>` over `POS_OPTIONS`; render `polyvalent` set apart with the gold token; on change call `onTypeChange` — a new optional prop — and surface the "Type mis à jour" toast in WS-E), the `StyleTooltip`, the announced difficulty as 5 dots (display-only, filled to `forceClaimed`), and the `◆ Plusieurs sens` badge shown when the band's `isMultisense` is true. Keep `aria-keyshortcuts`.
- [ ] **Step 6: Inline definition edit** — replace the standalone "Corriger" verdict button with the inline affordance: a "Corriger la définition" trigger (key `C`, double-click on the definition) that swaps the blockquote for an editor (textarea + POS select), `Enregistrer la correction` / `Annuler`. Submitting calls the existing `onCorriger` (unchanged semantics — `correctif`, auto-GOOD + propose). Preserve the current keyboard handler's `C` branch (`RatingCard.tsx:258`) but point it at the inline editor. Verdicts stay J/K/L only.
- [ ] **Step 7: Run tests, typecheck, lint, build.** Update `tests/sondage-rating-card-meta.test.tsx` for the new structure (verdict group has 3 buttons; correction via inline edit).
- [ ] **Step 8: Commit.** `git commit -s -m "feat(frontend-survey): card top row, style tooltip, inline definition edit"`

---

## WS-C — MetadataBand + field restyle

**Files:**
- Create: `frontend/src/ui/components/sondage/MetadataBand.tsx`, `PerceivedDifficultyPicker.tsx`
- Modify: `RatingCard.tsx` (render `MetadataBand`, drop inline meta inputs), `CategorieMultiSelect.tsx`, `SenseInput.tsx`, `GlossChipInput.tsx`
- Test: `frontend/tests/sondage-metadata-band.test.tsx`, `tests/sondage-perceived-difficulty.test.tsx`

- [ ] **Step 1: Write failing tests** for `MetadataBand` (driven by a `MetadataBand` value from `useMetadataBand`): collapsed by default showing the full non-truncated summary (every category label, sense text, every keyword); status label + buttons per state (pristine `✦ Suggéré par l'IA · non vérifié` + `Confirmer`; modified `● Modifié · non enregistré` + `Enregistrer`/`Réinitialiser`; saved `✓ Enregistré` + `Annuler l'enregistrement`/`Réinitialiser`); `Ajuster ▾`/`Réduire ▴` toggles the editable region; band tint class changes with state.

```tsx
// drive via a small harness that renders <MetadataBand band={band} item={item} .../>
// using renderHook(useMetadataBand) or a wrapper component; assert summary lists ALL values.
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `PerceivedDifficultyPicker`** — 5 clickable dots, label `Difficulté ressentie` + hint `— annoncée : {forceClaimed}/5`, calls `band.setPerceivedDifficulty`. Accessible radiogroup (reuse `Likert.tsx` pattern if it fits).
- [ ] **Step 4: Implement `MetadataBand`** — Ark Collapsible for expand/collapse; overline `Métadonnées · optionnel, aide l'entraînement`; status + buttons driven by `band.state`; collapsed summary reads `band.values` fully (use `categorieLabel`); expandable region hosts `CategorieMultiSelect` (with `+ Toutes les catégories ▾` expander; suggested = the seeded category, gold-tinted), the multisense checkbox, `SenseInput` (mono; disabled when multisense), `GlossChipInput`, and `PerceivedDifficultyPicker`. Band tint uses the WS-A tokens. **Auth-only:** the band renders only when `isAuth` (page passes the flag; anon path renders no band).
- [ ] **Step 5: Rewire `RatingCard`** to render `<MetadataBand>` instead of the inline `metaInputsStyles` block (remove `RatingCard.tsx:359-398`); the band value comes from a `band` prop the page supplies. Restyle category/sense/keyword sub-components to pill chips per Appendix B (gold tint + `✦` for suggested, solid green for selected).
- [ ] **Step 6: Run tests, typecheck, lint, build. Commit.** `git commit -s -m "feat(frontend-survey): collapsible tri-state metadata band"`

---

## WS-E — Toasts, session counters, keyboard, rate-time commit

**Files:**
- Modify: `Toast.tsx`, `contribuer.lazy.tsx`, `RatingCard.tsx`
- Test: `frontend/tests/contribuer-toasts.test.tsx`, `tests/contribuer-counters.test.tsx`

- [ ] **Step 1: Extend `Toast`** with tones `positive | negative | neutral | metadata` and icons `✓ ! ↺ ✓`, plus an optional one-line subtitle. Keep the single-slot model.
- [ ] **Step 2: Write failing tests** for: (a) verdict toasts with the correct subtitle per band state at rate-time — saved → `métadonnées vérifiées enregistrées`, modified → `vos modifications de métadonnées sont enregistrées`, pristine → `suggestions IA conservées (non vérifiées)`; (b) session counters — `Notées` increments on GOOD/BAD only (not SKIP), `Enrichies` increments only when `band.enriched`, `Série` is the consecutive-rating streak; (c) keyboard: `A` toggles band, `S` flags + advances, `Space` runs `band.primaryAction` only when not typing and not already saved.

```tsx
// counters: rate two cards GOOD (one with edited meta) → Notées 2, Enrichies 1, série 2.
// then SKIP → Notées 2 (unchanged), série resets to 0.
```

- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement.** In `contribuer.lazy.tsx`: lift `useMetadataBand(item)` to the page; pass `band` to `RatingCard`. On verdict, build the payload from `band.values` + `band.difficulteForSubmit` (replaces `DIFFICULTE_PLACEHOLDER` and the `meta` arg threading) and fire the verdict toast with the state-derived subtitle; bump counters (`Notées`/`Série` on GOOD/BAD, `Enrichies` when `band.enriched`); reset `Série` on SKIP. Add the `S` signaler action (new `flag` on the payload + advance + `Indice signalé pour révision` toast) and `Space` → `band.primaryAction()`. Wire metadata-band action toasts (Confirmer/Enregistrer/undo/reset) and `Type mis à jour` / `Définition corrigée`. Keep keyboard handlers off when typing (existing guard at `RatingCard.tsx:251-256`); avoid the `useToast()` object-in-deps pitfall — destructure `const { show } = useToast()`.
- [ ] **Step 5: Run tests, typecheck, lint, build. Commit.** `git commit -s -m "feat(frontend-survey): toasts, session counters, band keyboard wiring"`

---

## WS-F — MSW preview deck + Playwright visual verification

**Files:**
- Modify: `frontend/src/infrastructure/mocks/handlers/` + `fixtures/`
- Create: `frontend/tests/visual/contribuer/*.spec.ts` + 4 reference images
- Test: Playwright (`pnpm e2e`)

- [ ] **Step 1: Add a deterministic preview deck** (preview/mock mode only — never prod bundle) serving the mock-up cards: AUTOMNE (Météo+Conceptuel, sense `Saison entre l'été et l'hiver`, keywords saison/froid/feuilles/équinoxe), SOURIS, HIBOU, ÎLE — matching the spec's sample deck. Provide matching `getLemmaMeta` responses. Verify prod tree-shakes MSW: `pnpm build && grep -r setupWorker dist/` → empty.
- [ ] **Step 2: Save the 4 reference baselines** the maintainer supplies into `frontend/tests/visual/contribuer/` (card+collapsed band, band expanded, style tooltip, full category list). **Blocker:** these images must be provided; do not synthesize them.
- [ ] **Step 3: Write Playwright specs** that boot the preview build, navigate `/contribuer` (signed-in fixture), and capture each of the 4 states (default; expand band via `A`; hover the style label; expand `+ Toutes les catégories`). Compare against baselines.
- [ ] **Step 4: Run the visual loop** — `pnpm e2e`; for each diff, adjust Panda tokens/layout in the relevant component; repeat until each state matches its baseline.
- [ ] **Step 5: Commit.** `git commit -s -m "test(frontend-survey): preview deck + Playwright visual baselines for /contribuer"`

---

## Final integration pass

- [ ] Full gate from the worktree: `cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm a11y`.
- [ ] Manual smoke in the browser (golden path + anon path hides band + rating undo still works).
- [ ] Confirm each PR ≤400 lines (excluding generated/blank); if a workstream exceeds, invoke the cap-override with justification per the standing authorization, or split.

## Self-review notes (author)

- Spec coverage: tri-state band (WS-B/C), local-only semantics (WS-B), full summary (WS-C), verdicts+signaler (WS-D/E), inline correction preserved (WS-D), real difficulte (WS-B/E), auth gating (WS-C), undo preserved (untouched in page), 9-style tooltips (WS-D), counters (WS-E), toasts+verbatim copy (WS-E), Panda tokens (WS-A), Playwright visual (WS-F). No gaps.
- Type consistency: `MetadataBand` interface in WS-B is the single source consumed by WS-C/D/E; `difficulteForSubmit` and `enriched` names are stable across tasks.
- Known follow-up seams (out of scope): persisted verified flag, AI suggestions for sense/keywords, candidate senseOptions + true ambiguous picker.
