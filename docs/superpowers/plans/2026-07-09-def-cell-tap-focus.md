# Def-cell tap-to-focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player tap a definition cell in the mots-fléchés grid to focus its answer word, with a repeat tap on a dual-definition cell toggling between its two clues.

**Architecture:** A new `handleDefinitionClick(position)` on the existing `useGridNavigation` hook resolves the tapped def cell to its clue(s) via a new `cluesByDefCell` index in `buildLookup`, then sets direction and focuses the word's first editable-and-empty cell (reusing the hook's existing `focusCell`, validation predicate, and pan gate). `DefinitionCellView` (currently inert) gets an `onClick` wired through `Grid.tsx`. No store, no schema, no new dependency — all changes are in `frontend/src/ui/components/grid/`.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react (jsdom), Panda CSS. Tests render `<Grid>` and fire clicks (established pattern in `tests/grid-navigation-home-end.test.tsx`), plus one `renderHook` unit test for the pan gate.

## Global Constraints

- All new comments obey CLAUDE.md: single-line, non-obvious *why* only; no multi-line comment blocks; no references to PRs/tasks.
- No `console.log` / `println`; no string concatenation in any log message (none expected here).
- Values live in the DOM per ADR-0002 §4 — read cell fill state from the live `<input>` (via the hook's `refs`), never introduce a parallel React-state store.
- Accessibility (ADR-0050): do **not** add `tabindex` or `role="button"` to definition cells. The `onClick` is a pointer-only enhancement over already-keyboard-operable word focus.
- Frontend commands run from `frontend/`. Diff stays well under the 400-line cap.
- Branch: `feat/def-cell-tap-focus` (already created off fresh `main`). Commits are conventional + signed off (`git commit -s`), scope `feat(frontend-grid): ...`.

---

### Task 1: Def-cell tap focuses its word (single-def path)

Adds the def-position → clue index, the `handleDefinitionClick` handler (no dual-def toggle yet — always the first clue), and the `DefinitionCellView` / `Grid` wiring. Landing lands on the first editable-and-empty cell, skipping validated/locked and already-typed cells, with the pan gate applied.

**Files:**
- Modify: `frontend/src/ui/components/grid/useGridNavigation.ts` (add `cluesByDefCell` to `ClueLookup` + `buildLookup`; add `handleDefinitionClick` to the interface, hook body, and return)
- Modify: `frontend/src/ui/components/grid/Cell.tsx` (`DefinitionCellView`: add `onDefinitionClick` prop + `onClick`/`onMouseDown` on both branches)
- Modify: `frontend/src/ui/components/grid/Grid.tsx` (pass `onDefinitionClick={nav.handleDefinitionClick}` in the `definition` case)
- Test: `frontend/tests/grid-def-cell-focus.test.tsx` (new)

**Interfaces:**
- Consumes: from `useGridNavigation.ts` — `Clue` type, module helper `key(p: Position): string`, refs `refs` (`Map<string, HTMLInputElement>`), `focusCell(p: Position)`, `stateRef.current.direction`, `isCellValidatedRef`, `isPanningRef`, `lookup.clueAt`.
- Produces:
  - `ClueLookup.cluesByDefCell(r: number, c: number): readonly Clue[]` — the clues whose definition cell is at `(r,c)`, in tuple order.
  - `GridNavigation.handleDefinitionClick(position: Position): void`.
  - `DefinitionCellView` prop `onDefinitionClick: (position: Position) => void`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/grid-def-cell-focus.test.tsx`:

```tsx
import { render, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Cell, Position, Puzzle } from '@/domain';
import { Grid } from '@/ui/components/grid';
import { useGridNavigation } from '@/ui/components/grid/useGridNavigation';

const L = (row: number, col: number, entry = ''): Cell =>
  ({ kind: 'letter', position: { row, col }, entry });

// 5×4 grid. Def(0,0)→ owns across word (0,1)(0,2)(0,3)(0,4).
// Dual def at (2,0): right owns (2,1)(2,2)(2,3)(2,4); down owns (3,0) only
// (grid is 4 rows tall). Row 1 and the rest are plain letters.
const basePuzzle = (over: Partial<Cell>[] = []): Puzzle => {
  const cells: Cell[] = [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'across', arrow: 'right' }] },
    L(0, 1), L(0, 2), L(0, 3), L(0, 4),
    L(1, 0), L(1, 1), L(1, 2), L(1, 3), L(1, 4),
    { kind: 'definition', position: { row: 2, col: 0 }, clues: [{ text: 'dual-h', arrow: 'right' }, { text: 'dual-v', arrow: 'down' }] },
    L(2, 1), L(2, 2), L(2, 3), L(2, 4),
    L(3, 0), L(3, 1), L(3, 2), L(3, 3), L(3, 4),
  ];
  return { id: 't', title: 't', language: 'fr', width: 5, height: 4, hintsAllowed: 3, hintsRemaining: 3, cells };
};

// Apply a partial entry to a letter cell in the base puzzle.
const withEntry = (row: number, col: number, entry: string): Puzzle => {
  const p = basePuzzle();
  return {
    ...p,
    cells: p.cells.map((c) =>
      c.kind === 'letter' && c.position.row === row && c.position.col === col ? { ...c, entry } : c,
    ),
  };
};

const inputAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLInputElement>(`input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
const defAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLElement>(`[data-cell-kind="definition"][data-row="${row}"][data-col="${col}"]`)!;

describe('Def-cell tap focuses its word', () => {
  it('tapping a single-def cell focuses the first cell of its word', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} />);
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 1));
  });

  it('landing skips an already-typed cell to the first empty one', () => {
    const { container } = render(<Grid puzzle={withEntry(0, 1, 'X')} />);
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 2));
  });

  it('landing skips a validated (locked) cell', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} validatedPositions={new Set(['0,1'])} />);
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 2));
  });

  it('does nothing while a pan gesture is in progress', () => {
    const { result } = renderHook(() =>
      useGridNavigation(basePuzzle(), { isPanning: () => true }),
    );
    act(() => result.current.handleDefinitionClick({ row: 0, col: 0 } as Position));
    expect(result.current.currentClue).toBeNull();
  });

  it('handler focuses the def word when not panning (hook unit)', () => {
    const { result } = renderHook(() => useGridNavigation(basePuzzle()));
    act(() => result.current.handleDefinitionClick({ row: 0, col: 0 } as Position));
    expect(result.current.currentClue?.clue.text).toBe('across');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- grid-def-cell-focus`
Expected: FAIL — `result.current.handleDefinitionClick is not a function` (and the DOM-focus assertions fail because def cells have no `onClick`).

- [ ] **Step 3: Add `cluesByDefCell` to the lookup**

In `frontend/src/ui/components/grid/useGridNavigation.ts`, add the method to the `ClueLookup` interface (after `clueAt`, before `orderedClues`):

```ts
  clueAt: (r: number, c: number, d: Direction) => Clue | undefined;
  // Clues whose DEFINITION cell sits at (r,c), in tuple order — the
  // index a def-cell tap resolves against (byCell is keyed on letter
  // cells only).
  cluesByDefCell: (r: number, c: number) => readonly Clue[];
```

In `buildLookup`, declare the map next to `byCell` (after line `const byCell = new Map<string, Clue[]>();`):

```ts
  const byDef = new Map<string, Clue[]>();
```

Inside the `for (const subClue of def.clues)` loop, right after `allClues.push(clue);`, also index by def position:

```ts
      allClues.push(clue);
      const dk = key(def.position);
      const dlist = byDef.get(dk) ?? [];
      dlist.push(clue);
      byDef.set(dk, dlist);
```

And in the returned object (after `clueAt: ...`), expose it:

```ts
    clueAt: (r, c, d) => (byCell.get(key({ row: r, col: c })) ?? []).find((q) => q.direction === d),
    cluesByDefCell: (r, c) => byDef.get(key({ row: r, col: c })) ?? [],
    orderedClues,
```

- [ ] **Step 4: Add `handleDefinitionClick` to the interface and hook**

In the `GridNavigation` interface (after `handleClick`'s declaration), add:

```ts
  // Tap on a definition cell → focus its answer word. On a dual-def
  // cell, a tap whose focused word is already one of the cell's clues
  // advances to the other clue (single-tap toggle). Pan-gated like
  // handleClick.
  readonly handleDefinitionClick: (position: Position) => void;
```

In the hook body, add the handler just after `handleClick`'s `useCallback` (before `handleFocus`):

```ts
  const handleDefinitionClick = useCallback(
    (defPosition: Position) => {
      // Tail-of-pan synthesised clicks aren't slot selections — same gate as handleClick.
      if (isPanningRef.current?.() === true) return;
      const clues = lookup.cluesByDefCell(defPosition.row, defPosition.col);
      if (clues.length === 0) return;
      const target = clues[0];
      // Land on the first editable-and-empty cell (skip locked + typed),
      // else the first editable cell, else the word's first cell.
      const editable = target.cells.filter(
        (c) => !(isCellValidatedRef.current?.(c.position.row, c.position.col) ?? false),
      );
      const firstEmpty = editable.find(
        (c) => (refs.current.get(key(c.position))?.value ?? '') === '',
      );
      const landing = (firstEmpty ?? editable[0] ?? target.cells[0]).position;
      if (target.direction !== stateRef.current.direction) setDirection(target.direction);
      focusCell(landing);
    },
    [focusCell, lookup],
  );
```

In the returned object (after `handleClick,`), add:

```ts
    handleClick,
    handleDefinitionClick,
```

- [ ] **Step 5: Wire `onClick` into `DefinitionCellView`**

In `frontend/src/ui/components/grid/Cell.tsx`, extend the `DefinitionCellView` prop type and both return branches. Change the component signature:

```ts
export const DefinitionCellView = memo(function DefinitionCellView({
  cell, currentArrow, onDefinitionClick,
}: { cell: DefinitionCell; currentArrow: ArrowDirection | null; onDefinitionClick: (position: Position) => void }) {
```

`Position` is not yet imported in `Cell.tsx`. Add it to the existing `@/domain` type import (lines 3-9):

```ts
import type {
  ArrowDirection,
  BlockCell,
  DefinitionCell,
  DefinitionClue,
  LetterCell,
  Position,
} from '@/domain';
```

On the **single-clue** branch `<div role="gridcell" ...>` (the one with `data-clue-count="1"`), add the two handlers:

```ts
      <div
        role="gridcell"
        className={`${cellBase} ${defCell}${currentClass ? ` ${currentClass}` : ''}`}
        data-row={cell.position.row}
        data-col={cell.position.col}
        data-cell-kind="definition"
        data-clue-count="1"
        data-current-clue={isCurrent ? 'true' : 'false'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onDefinitionClick(cell.position)}
      >
```

On the **two-clue** branch `<div role="gridcell" ...>` (the one with `data-clue-count="2"`), add the same two handlers:

```ts
    <div
      role="gridcell"
      className={`${cellBase} ${defCell} ${defStackDivider}`}
      data-row={cell.position.row}
      data-col={cell.position.col}
      data-cell-kind="definition"
      data-clue-count="2"
      data-current-clue={currentArrow !== null ? 'true' : 'false'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onDefinitionClick(cell.position)}
    >
```

(`onMouseDown` preventDefault stops the browser blurring the active letter input before our click focuses the new one — mirrors the letter cell.)

- [ ] **Step 6: Pass the handler from `Grid.tsx`**

In `frontend/src/ui/components/grid/Grid.tsx`, in the `case 'definition':` block, add the prop:

```tsx
                      case 'definition': {
                        const highlight = nav.highlightFor(cell.position);
                        return (
                          <DefinitionCellView
                            key={key}
                            cell={cell}
                            currentArrow={highlight.currentArrow}
                            onDefinitionClick={nav.handleDefinitionClick}
                          />
                        );
                      }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && pnpm test -- grid-def-cell-focus`
Expected: PASS (all 5 tests).

- [ ] **Step 8: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: no errors. (If `eslint-plugin-boundaries` or the arch rules complain, the change stays within `ui/`, so it should be clean.)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/ui/components/grid/useGridNavigation.ts frontend/src/ui/components/grid/Cell.tsx frontend/src/ui/components/grid/Grid.tsx frontend/tests/grid-def-cell-focus.test.tsx
git commit -s -m "feat(frontend-grid): tap a definition cell to focus its word

Adds handleDefinitionClick to useGridNavigation, a cluesByDefCell index,
and an onClick on the (previously inert) DefinitionCellView. Landing skips
validated/locked and already-typed cells; pan-gated like letter clicks."
```

---

### Task 2: Dual-def single-tap toggle

Extends `handleDefinitionClick` so that tapping a dual-definition cell whose word is already focused advances to the cell's *other* clue, and toggles back on the next tap.

**Files:**
- Modify: `frontend/src/ui/components/grid/useGridNavigation.ts` (`handleDefinitionClick` clue-selection)
- Test: `frontend/tests/grid-def-cell-focus.test.tsx` (add a `describe` block)

**Interfaces:**
- Consumes: `ClueLookup.cluesByDefCell`, `lookup.clueAt`, `stateRef.current` (from Task 1). Clue objects returned by `cluesByDefCell` are the *same references* held by `byCell`/`clueAt` (both push the one `clue` const in `buildLookup`), so identity comparison selects the active clue.
- Produces: no new exported surface — same `handleDefinitionClick` signature.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/grid-def-cell-focus.test.tsx` (the helpers `basePuzzle`, `inputAt`, `defAt` are already defined at file scope):

```tsx
describe('Dual-def cell single-tap toggle', () => {
  it('first tap focuses clue #1 (across); repeat tap toggles to clue #2 (down); third tap toggles back', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} />);
    const dual = () => defAt(container, 2, 0);

    // clue #1 = across (right) → owns (2,1); land there.
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(container, 2, 1));

    // repeat tap → clue #2 = down → owns (3,0); land there.
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(container, 3, 0));

    // third tap → back to clue #1 (2,1).
    fireEvent.click(dual());
    expect(document.activeElement).toBe(inputAt(container, 2, 1));
  });

  it('tapping a dual-def cell after focusing an unrelated word starts at clue #1', () => {
    const { container } = render(<Grid puzzle={basePuzzle()} />);
    // Focus the top across word first (unrelated to the dual cell at (2,0)).
    fireEvent.click(defAt(container, 0, 0));
    expect(document.activeElement).toBe(inputAt(container, 0, 1));
    // First tap on the dual cell → clue #1 (across), not the down clue.
    fireEvent.click(defAt(container, 2, 0));
    expect(document.activeElement).toBe(inputAt(container, 2, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- grid-def-cell-focus`
Expected: the new "toggle" test FAILS — the repeat tap still lands on `(2,1)` (always clue #1) instead of `(3,0)`. The other suites still pass.

- [ ] **Step 3: Implement the toggle**

In `frontend/src/ui/components/grid/useGridNavigation.ts`, replace the `const target = clues[0];` line inside `handleDefinitionClick` with the active-clue toggle so the handler reads:

```ts
  const handleDefinitionClick = useCallback(
    (defPosition: Position) => {
      // Tail-of-pan synthesised clicks aren't slot selections — same gate as handleClick.
      if (isPanningRef.current?.() === true) return;
      const clues = lookup.cluesByDefCell(defPosition.row, defPosition.col);
      if (clues.length === 0) return;
      // Toggle: if the focused word is already one of this cell's clues,
      // advance to the next; otherwise start at the first clue.
      const { focused: f, direction: dir } = stateRef.current;
      const activeClue = f ? lookup.clueAt(f.row, f.col, dir) : undefined;
      const activeIdx = activeClue ? clues.findIndex((c) => c === activeClue) : -1;
      const target = clues[activeIdx >= 0 ? (activeIdx + 1) % clues.length : 0];
      // Land on the first editable-and-empty cell (skip locked + typed),
      // else the first editable cell, else the word's first cell.
      const editable = target.cells.filter(
        (c) => !(isCellValidatedRef.current?.(c.position.row, c.position.col) ?? false),
      );
      const firstEmpty = editable.find(
        (c) => (refs.current.get(key(c.position))?.value ?? '') === '',
      );
      const landing = (firstEmpty ?? editable[0] ?? target.cells[0]).position;
      if (target.direction !== dir) setDirection(target.direction);
      focusCell(landing);
    },
    [focusCell, lookup],
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm test -- grid-def-cell-focus`
Expected: PASS (all suites, including both toggle tests).

- [ ] **Step 5: Typecheck and full grid test sweep**

Run: `cd frontend && pnpm typecheck && pnpm test -- grid`
Expected: no type errors; all `grid*` tests green (confirms the `buildLookup` and `Grid` changes didn't regress navigation, input, or presence tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/components/grid/useGridNavigation.ts frontend/tests/grid-def-cell-focus.test.tsx
git commit -s -m "feat(frontend-grid): dual-def cell single-tap toggles between its two clues"
```

---

## Verification (after both tasks)

- [ ] Run the frontend gates that CI runs: `cd frontend && pnpm typecheck && pnpm lint && pnpm test -- grid`.
- [ ] Manually drive the feature per the `verify` skill: launch the app, open a puzzle, tap a single-def cell (word focuses, keyboard opens on mobile), tap a dual-def cell twice (word switches). Confirm a pan that starts on a def cell does not steal focus.
- [ ] Confirm diff size: `git diff main --stat` stays well under 400 lines.

## Post-review correction (2026-07-10)

This plan targeted `Grid.tsx` / `Cell.tsx` (`DefinitionCellView`) as the render
layer. That was wrong: the live `/play` and coop surfaces render
`PuzzleBoard` + the design-system `DefCell` — `Grid`/`Cell` appear only in the
design-system gallery. The shared hook change (`handleDefinitionClick`,
`cluesByDefCell`) was correct and unchanged; the wiring was moved to
`DefCell` (`onClick`) + `PuzzleBoard`'s definition branch, and the tests were
re-homed onto a `PuzzleBoard`/`DefCell` render harness
(`tests/puzzleboard-def-cell-focus.test.tsx`). The §6a review caught the
mis-wiring via importer analysis; a `/verify`-style drive of the real flow
would have caught it earlier.

## Notes / rationale carried from the spec

- "First empty cell" is read from the live `<input>` value (via the hook's `refs`), so it is robust to server-rehydrated entries on resume — unlike `cellValuesRef` (session-typed only), which the existing smart-start uses. Validated/locked cells are excluded first, matching `useAdvanceOnValidation.findNextEditable` semantics.
- Clue identity comparison (`c === activeClue`) is sound because `buildLookup` pushes the *same* `Clue` object into both `byCell` (read by `clueAt`) and `byDef` (read by `cluesByDefCell`).
- Dual-def cell in coop where one word is locked: the toggle still visits it (read-only focus just highlights) — deliberately predictable, no special-casing.
