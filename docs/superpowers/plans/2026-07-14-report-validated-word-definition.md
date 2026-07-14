# Report a Validated Word's Definition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player tap a definition (arrow) cell to select its word in any state — including validated/locked and after the whole puzzle is won — with a visible "selected" outline on the word, and reach the existing Flag → report flow for that clue.

**Architecture:** The core tap-to-select mechanic already works on fresh `main` (`handleDefinitionClick` makes even a fully-locked word the active clue; the clue rail + `ReportClueSheet` derive from that active clue; ADR-0111 resolves the answer word server-side, so no client word plumbing). Two gaps remain: (1) a validated word's letter cells don't show the selection highlight because the `validated → 'solved'` styling short-circuits it — add an additive selection outline to the design-system `Cell`; (2) the won-state `bottomBar` drops the clue rail + report for a lone results button — keep the rail + report mounted alongside the results button.

**Tech Stack:** Vite + React 19 + TS + Panda CSS (`styled-system/css`) + Ark UI; Vitest + Testing Library + axe (`@/test/a11y`).

## Global Constraints

- **Design tokens only** for the selection outline — use `token(colors.ws.sakuraDark)` (ADR-0072); no raw hex.
- **WCAG AA** — the selection outline must pass axe against the sage `ws.sable` solved fill; every `Cell` test stays axe-clean (ADR-0050).
- **No client `wordText`** — the report sends only `clueText` + `surface` + optional `puzzleId`; the server resolves the answer word (ADR-0111, ADR-0076). Do not add or reintroduce any word-folding on the client.
- **Read-only letter cells stay non-selectable** — do not touch the `handleClick` validated early-return (`useGridNavigation.ts:465`). Selection is via the definition cell only.
- **Commits:** conventional, bounded-context scope, `-s` sign-off. Scope `frontend-grid` (Cell/PuzzleBoard) and `frontend-play` (PlayScreen).
- **Observability:** no `console.log`.

---

### Task 1: Additive selection outline on the design-system `Cell`

**Files:**
- Modify: `frontend/src/design-system/components/Cell/Cell.tsx`
- Test: `frontend/tests/design-system-cell.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CellProps.selected?: boolean`. When `state === 'solved'` and `selected` is true, the cell renders `data-selected="true"` and layers a sakura outline over the solved fill. For any non-`solved` state, `selected` is a no-op (no attribute, no outline).

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe('Cell', …)` in `frontend/tests/design-system-cell.test.tsx`:

```tsx
it('layers a selection outline only on a solved + selected cell', async () => {
  const { container, rerender } = render(<Cell state="solved" letter="A" selected />);
  const solved = container.querySelector('[data-cell-state="solved"]');
  expect(solved?.getAttribute('data-selected')).toBe('true');
  await expectAxeClean(container);

  // Gated on 'solved': active/word cells already carry the pink selection, so `selected` is inert there.
  rerender(<Cell state="active" letter="R" selected />);
  expect(container.querySelector('[data-cell-state="active"]')?.getAttribute('data-selected')).toBeNull();

  // Solved but not selected → no outline attribute.
  rerender(<Cell state="solved" letter="A" />);
  expect(container.querySelector('[data-cell-state="solved"]')?.getAttribute('data-selected')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/design-system-cell.test.tsx`
Expected: FAIL — `data-selected` is `null` (prop not implemented yet).

- [ ] **Step 3: Implement the `selected` prop + outline**

In `frontend/src/design-system/components/Cell/Cell.tsx`:

Add this style constant immediately after the `solvedTint` definition (currently line 61):

```tsx
// Additive selection ring on a solved/locked cell whose word is currently selected — an outline (not box-shadow) so it never clobbers the solved inset shadow. Mirrors the `solvedTint` additive pattern.
const selectedRing = css({
  outline: '2.5px solid token(colors.ws.sakuraDark)',
  outlineOffset: '-2.5px',
  borderRadius: '9px',
});
```

Add the prop to the interface (after `tinted?`):

```tsx
  readonly tinted?: boolean;
  // When solved/locked, mark this cell as part of the currently-selected word — layers a selection outline over the solved fill.
  readonly selected?: boolean;
```

Replace the component body with:

```tsx
export function Cell({ state, letter, solveDelay, tinted, selected }: CellProps) {
  const ripple = state === 'solved' && solveDelay !== undefined;
  const showSelected = state === 'solved' && selected === true;
  return (
    <div
      data-cell-state={state}
      data-selected={showSelected ? 'true' : undefined}
      className={cx(base, byState[state], ripple && solveRipple, state === 'solved' && tinted && solvedTint, showSelected && selectedRing)}
      style={ripple ? { animationDelay: `${solveDelay}ms` } : undefined}
    >
      {state === 'empty' ? '' : letter}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/design-system-cell.test.tsx`
Expected: PASS (all `Cell` cases, including axe-clean).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Cell/Cell.tsx frontend/tests/design-system-cell.test.tsx
git commit -s -m "feat(frontend-grid): add selected-word outline to the design-system Cell"
```

---

### Task 2: Pass `selected` from `PuzzleBoard` so a validated word's cells outline

**Files:**
- Modify: `frontend/src/ui/components/grid/PuzzleBoard.tsx` (the `LetterSlot` `<Cell>` render, currently line 128)
- Test: `frontend/tests/puzzleboard-def-cell-focus.test.tsx`

**Interfaces:**
- Consumes: `CellProps.selected` from Task 1; `highlight.focused` / `highlight.currentWord` from `nav.highlightFor` (existing `CellHighlight`).
- Produces: every letter cell of the active word renders `data-selected="true"` when that cell is `solved` (validated); no new exports.

- [ ] **Step 1: Write the failing test**

In `frontend/tests/puzzleboard-def-cell-focus.test.tsx`, add this keycap helper next to the existing `inputAt`/`defByText` helpers (after the `defByText` definition):

```tsx
// The state keycap (data-cell-state / data-selected) lives inside the slot wrapper, alongside the input.
const keycapAt = (row: number, col: number) =>
  document.querySelector<HTMLElement>(`div[data-row="${row}"][data-col="${col}"] [data-cell-state]`)!;
```

Then add this test inside the `describe('PuzzleBoard wires def-cell tap-to-focus …')` block:

```tsx
it('selecting a fully-locked word outlines every letter cell of that word', () => {
  render(<Harness puzzle={basePuzzle()} validated={new Set(['0,1', '0,2', '0,3', '0,4'])} />);
  fireEvent.click(defByText('across'));
  for (const col of [1, 2, 3, 4]) {
    expect(keycapAt(0, col).getAttribute('data-selected')).toBe('true');
  }
  // A cell outside the selected word is not outlined.
  expect(keycapAt(1, 1).getAttribute('data-selected')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/puzzleboard-def-cell-focus.test.tsx`
Expected: FAIL — `data-selected` is `null` on `(0,1)` (PuzzleBoard doesn't pass `selected` yet).

- [ ] **Step 3: Pass `selected` to `<Cell>`**

In `frontend/src/ui/components/grid/PuzzleBoard.tsx`, change the `LetterSlot` `<Cell>` render (currently line 128) from:

```tsx
      <Cell state={state} solveDelay={solveDelay} tinted={owner !== undefined} />
```

to:

```tsx
      <Cell state={state} solveDelay={solveDelay} tinted={owner !== undefined} selected={highlight.focused || highlight.currentWord} />
```

(No other change: `selected` only renders the outline when `state === 'solved'` per Task 1, so non-validated `active`/`activeWord` cells are unaffected.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/puzzleboard-def-cell-focus.test.tsx`
Expected: PASS (new test + all existing def-cell-focus cases stay green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/components/grid/PuzzleBoard.tsx frontend/tests/puzzleboard-def-cell-focus.test.tsx
git commit -s -m "feat(frontend-grid): outline the selected word's cells even when validated"
```

---

### Task 3: Keep the clue rail + report reachable in the won state

**Files:**
- Modify: `frontend/src/ui/play/PlayScreen.tsx` (the `bottomBar` prop, the `won ? … : …` block currently at lines 486–640)

**Interfaces:**
- Consumes: existing `won`, `displayClue`, `displayOrdinal`, `orderedClues`, `stepClue`, `boardRef`, `surveyClient`, `reportSurface`, `puzzle`, `ReportClueSheet`, `ClueRail`, `Keyboard`, `Button`, `t` — all already in scope.
- Produces: no new exports. Behavior: when `won`, the `bottomBar` renders the clue rail (with the Flag report, without the assist trailing) **and** the results button, and omits the keyboard; when not `won`, behavior is unchanged (rail + assist trailing + keyboard).

**Why no unit test:** no test renders `PlayScreen` (it is provider-heavy — auth, stores, survey client, router). This task is a JSX-wiring change verified by typecheck + the existing suite staying green + driving the running app (Step 4). Do **not** fabricate a brittle full-`PlayScreen` harness for it.

- [ ] **Step 1: Restructure the `bottomBar` so the rail is shared and gated by `won`**

In `frontend/src/ui/play/PlayScreen.tsx`, replace the entire `bottomBar={…}` block — the outer `{won ? (<Button …>) : (<> … </>)}` currently spanning lines 487–639 — with the following. This keeps a single `ClueRail`, hides the assist trailing when won, hides the error pills when won, and swaps the trailing element between the results `Button` (won) and the `Keyboard` (playing):

```tsx
      bottomBar={
        <div className={bottomBar} ref={bottomRef}>
          {!won && ACTIVE_ASSIST_MODE === 'hint' && hint.errorMessage ? (
            <p className={hintError} role="alert">
              {hint.errorMessage}
            </p>
          ) : null}
          {!won && ACTIVE_ASSIST_MODE === 'verify' && verification.errorMessage ? (
            <p className={hintError} role="alert">
              {verification.errorMessage}
            </p>
          ) : null}
          {!won && validation.failMessage ? (
            <p className={failPill} role="status" aria-live="polite">
              {validation.failMessage}
            </p>
          ) : null}
          {displayClue ? (
            <ClueRail
              direction={displayClue.across ? 'horizontal' : 'vertical'}
              directionLabel={t(displayClue.across ? 'clueRail.direction.horizontal' : 'clueRail.direction.vertical')}
              clue={displayClue.text}
              index={displayOrdinal + 1}
              total={orderedClues.length}
              groupLabel={t('clueRail.aria.group')}
              counterLabel={t('clueRail.aria.counter', { index: displayOrdinal + 1, total: orderedClues.length })}
              prevLabel={t('clueRail.aria.prev')}
              nextLabel={t('clueRail.aria.next')}
              zoomInLabel={t('clueRail.aria.zoomIn')}
              zoomOutLabel={t('clueRail.aria.zoomOut')}
              onPrev={() => stepClue(-1)}
              onNext={() => stepClue(1)}
              onZoomIn={() => boardRef.current?.panZoom?.zoomIn()}
              onZoomOut={() => boardRef.current?.panZoom?.zoomOut()}
              report={
                surveyClient ? (
                  <ReportClueSheet
                    surveyClient={surveyClient}
                    surface={reportSurface}
                    clueText={displayClue.text}
                    puzzleId={puzzle.id}
                  />
                ) : undefined
              }
              trailing={
                won ? undefined : ACTIVE_ASSIST_MODE === 'verify' ? (
                  <span className={hintTrailing}>
                    <InfoPopover
                      info={assistGate ? assistGate.title : t('play.verify.info')}
                      onActivate={requestVerify}
                      disabled={
                        assistGate != null ||
                        verification.pending ||
                        (verification.secondsUntilNextVerify ?? 0) > 0
                      }
                    >
                      <button type="button" className={hintBtn} data-tour="assist">
                        <MagnifyingGlass aria-hidden="true" weight="bold" className={hintBulb} />
                        {t('play.verify.label')}
                      </button>
                    </InfoPopover>
                    <AssistCooldown
                      visible={verification.secondsUntilNextVerify !== null}
                      secondsRemaining={verification.secondsUntilNextVerify}
                      intervalSeconds={1800}
                      label={t('grid.verify.cooldown.label', {
                        time: formatMmSs(verification.secondsUntilNextVerify ?? 0),
                      })}
                      availableAnnouncement={t('grid.verify.cooldown.available')}
                    />
                  </span>
                ) : ACTIVE_ASSIST_MODE === 'hint' ? (
                  <span className={hintTrailing}>
                    <InfoPopover
                      info={assistGate ? assistGate.title : t('play.hint.info')}
                      onActivate={requestHint}
                      disabled={
                        assistGate != null ||
                        hint.pending ||
                        (hint.exhausted && (hint.secondsUntilNextHint ?? 0) > 0)
                      }
                    >
                      <button
                        type="button"
                        className={hintBtn}
                        data-tour="assist"
                        aria-label={t('play.hint.aria.remaining', { remaining: hint.hintsRemaining })}
                      >
                        <Lightbulb aria-hidden="true" weight="fill" className={hintBulb} />
                        {t('play.hint.label', { remaining: hint.hintsRemaining })}
                      </button>
                    </InfoPopover>
                    <AssistCooldown
                      visible={hint.hintsRemaining < puzzle.hintsAllowed && hint.secondsUntilNextHint !== null}
                      secondsRemaining={hint.secondsUntilNextHint}
                      intervalSeconds={600}
                      label={`+1 dans ${formatMmSs(hint.secondsUntilNextHint ?? 0)}`}
                      availableAnnouncement="Un indice est de nouveau disponible."
                      progressAnnouncement={`Régénération d’un indice en cours, ${hint.hintsRemaining} sur ${puzzle.hintsAllowed}.`}
                    />
                  </span>
                ) : null
              }
            />
          ) : null}
          {won ? (
            <Button variant="secondary" className={resultsBtn} onClick={() => { setWonLive(true); setWinDismissed(false); }}>
              <Trophy aria-hidden="true" weight="fill" />
              {t('play.results.cta')}
            </Button>
          ) : (
            <Keyboard onLetter={(l) => nav.enterLetter(l)} onBackspace={playBackspace} />
          )}
        </div>
      }
```

Notes for the implementer:
- This is a restructure of existing JSX, not new logic: the rail props, the two assist-trailing branches, the results `Button`, and the `Keyboard` are copied verbatim from the current code — only the wrapping changes (single rail; `won ? undefined :` around `trailing`; `!won &&` on the three error pills; `won ? Button : Keyboard` as the trailing element).
- `won ? undefined : ACTIVE_ASSIST_MODE === 'verify' ? … : …` — the nested ternary is intentional; when `won`, the assist branches are never evaluated (so `assistGate`/`verification`/`hint` reads are skipped post-win).
- Confirm the imports used here (`ClueRail`, `Button`, `Keyboard`, `ReportClueSheet`, `InfoPopover`, `AssistCooldown`, `Trophy`, `MagnifyingGlass`, `Lightbulb`, `t`, `formatMmSs`) are all already imported — they are, since this reuses the existing block.

- [ ] **Step 2: Typecheck and run the full suite**

Run: `cd frontend && pnpm typecheck && pnpm vitest run`
Expected: typecheck clean; all tests pass (this task changes no tested unit).

- [ ] **Step 3: Lint**

Run: `cd frontend && pnpm lint`
Expected: clean (no boundary/eslint violations).

- [ ] **Step 4: Verify in the running app (won state)**

Use the `run` / `verify` skill to drive the app:
1. Open a solo puzzle; solve or hint-reveal it to reach the won state (dismiss the win overlay to review the grid).
2. Confirm the `bottomBar` shows the **clue rail with the Flag button** and the **"Voir les résultats"** button, and that the **on-screen keyboard is absent**.
3. Tap a definition cell — its word gets the selection outline (Task 2) and its clue shows in the rail; open the Flag sheet and confirm a report submits (toast success).
4. Also verify mid-puzzle: validate/hint one word, tap its def cell → the locked word outlines and is reportable while other words remain playable.

Record what you observed (screenshot or a one-line note per check). Do not claim done without running this.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/play/PlayScreen.tsx
git commit -s -m "feat(frontend-play): keep the clue rail and report reachable after a puzzle is won"
```

---

### Task 4: Guard the co-op surface + final gates

**Files:**
- Read/verify: `frontend/src/ui/multiplayer/LiveCoopScreen.tsx` (uses the same `ReportClueSheet`)

- [ ] **Step 1: Confirm `LiveCoopScreen` is not regressed**

Run: `cd frontend && grep -n "ReportClueSheet\|won\|bottomBar\|ClueRail" src/ui/multiplayer/LiveCoopScreen.tsx`
Read the matched region. Confirm this plan changed nothing in `LiveCoopScreen` and that its report/end-state path is independent of the `PlayScreen` `bottomBar` edited in Task 3. If it shares a component that Task 3 changed, note it; otherwise no change is needed.
Expected: `LiveCoopScreen` mounts `ReportClueSheet` directly and is unaffected.

- [ ] **Step 2: Full frontend gates**

Run: `cd frontend && pnpm typecheck && pnpm vitest run && pnpm lint && pnpm a11y`
Expected: all green. (`pnpm a11y` exercises the axe baseline including the new selection outline; if `pnpm a11y` needs a running build per repo convention, follow `docs/local-development.md`.)

- [ ] **Step 3: Confirm diff is within the ADR-0001 §4 cap**

Run: `git diff main --stat`
Expected: well under 400 non-generated lines. If over (e.g. the won-state restructure counts higher than expected), split Task 1+2 (visual) into a separate PR from Task 3 (won-state), each its own workstream.

---

## Self-Review

**Spec coverage:**
- Change 1 (selected outline on validated cells) → Tasks 1 + 2. ✓
- Change 2 (report reachable when won) → Task 3. ✓
- "Core tap-to-select already works" → no task needed; asserted by the existing `puzzleboard-def-cell-focus.test.tsx` "fully-locked word lands on its first cell" case, extended in Task 2. ✓
- ADR-0111 "no client wordText" → enforced by Global Constraints + nothing added; Task 3's `ReportClueSheet` passes only `clueText`/`surface`/`puzzleId`. ✓
- Out-of-scope "read-only letter cells stay non-selectable" → Global Constraints forbid touching `handleClick:465`; no task changes it. ✓
- `LiveCoopScreen` not regressed → Task 4 Step 1. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `selected?: boolean` defined in Task 1 (`Cell.tsx`), consumed with the same name in Task 2 (`PuzzleBoard.tsx`). `data-selected="true"` asserted with the same string in both test tasks. `highlight.focused` / `highlight.currentWord` match the `CellHighlight` fields read in Task 2.
