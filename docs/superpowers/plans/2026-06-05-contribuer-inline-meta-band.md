# /contribuer Inline Metadata Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/contribuer` metadata band's duplicated read-only-summary + edit-section pattern with a single compact grid where each field edits in place (field-by-field, one editor open at a time).

**Architecture:** One representation — a 2-column grid. Nature, Catégories, Sens, Mots-clés render as read-only triggers that swap to an inline editor on click (via a new `InlineEditableRow` wrapper that owns focus return + Escape/Enter/blur). Style stays read-only; Difficulté stays an always-live dot picker. `MetadataBand` owns a local `openField: FieldKey | null`; the band's tri-state commit model and re-seed-on-item-change are unchanged. The global Ajuster toggle, `expanded` hook state, the divider, and the `A` shortcut are removed. Metadata fields no longer reject the lemma (Sens/Mots-clés are metadata, not clues — ADR-0061's no-repeat rule is a clue constraint).

**Tech Stack:** React 19, TanStack Router, Panda CSS, Vitest + Testing Library (jsdom). Frontend shell cwd is `frontend/`. Branch `feat/contribuer-inline-meta-band` (worktree already set up).

**Scope notes for the executor:**
- **Submit-shape is out of scope.** `src/ui/routes/contribuer.lazy.tsx:188` still strips a `targetSense` that repeats the lemma before POST. The spec marks submit-shape unchanged, so leave that line and its route test (`contribuer-route.test.tsx:505`) intact — only update *how that test opens the Sens field*. (This is a deliberate tension: the UI stops warning but the route still silently strips. Flagged to the maintainer; do not expand scope to "fix" it here.)
- **PR packaging:** this is one cohesive UI rewrite that exceeds the 400-line cap. Either ship as a single PR invoking the standing cap-override with justification ("splitting ships a broken intermediate band"), or as two stacked PRs: PR1 = Tasks 1–2 (ban removal, old layout intact, independently shippable), PR2 = Tasks 3–7 (layout rewrite). Decide at execution time.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/ui/components/sondage/SenseInput.tsx` | single-value combobox for Sens | drop `bannedTerm`/`repeatsLemma`/aria-invalid/alert; add `autoFocus` (focus + caret-to-end on mount) |
| `src/ui/components/sondage/GlossChipInput.tsx` | chip input for Mots-clés | drop `bannedTerm` rejection; keep trim/maxLength/maxItems/dedupe; add `autoFocus` |
| `src/ui/components/sondage/InlineEditableRow.tsx` | **NEW** — value cell that toggles display button ⇄ editor | create |
| `src/ui/components/sondage/MetadataBand.tsx` | the band | full rewrite around the single grid + `openField` |
| `src/ui/components/sondage/useMetadataBand.ts` | tri-state band model | remove `expanded`/`toggleExpanded` |
| `src/ui/components/sondage/RatingCard.tsx` | mounts the band; card-level shortcuts | drop `toggleExpanded` + retire `A` shortcut |
| `src/ui/components/sondage/index.ts` | barrel | export `InlineEditableRow` |
| `tests/sondage-inline-editable-row.test.tsx` | **NEW** unit test for the wrapper | create |
| `tests/sondage-rating-card-meta.test.tsx` | band behavior via RatingCard | rewrite helpers to per-field open; delete repetition test |
| `tests/sondage-gloss-chip-input.test.tsx` | GlossChipInput unit | remove `bannedTerm` harness + rejection test |
| `tests/contribuer-route.test.tsx` | route integration | update the one `band-adjust` click to open the Sens field |

Each task below leaves the tree compiling and the suite green (commit between tasks).

---

### Task 1: SenseInput — drop the lemma ban, add inline-edit autofocus

**Files:**
- Modify: `src/ui/components/sondage/SenseInput.tsx`
- Modify: `src/ui/components/sondage/MetadataBand.tsx` (remove the one `bannedTerm={item.mot}` pass-site so typecheck stays green)
- Test: `tests/sondage-rating-card-meta.test.tsx` (delete the now-false repetition test; add a lemma-accepted test)

Rationale: Sens is metadata (the target sense), not the clue. The ADR-0061 no-repeat-the-lemma rule is a *clue* constraint and must not gate metadata. Removing the ban also unblocks the inline editor (no aria-invalid, no alert, no focus-trap).

- [ ] **Step 1: Write the failing test** — in `tests/sondage-rating-card-meta.test.tsx`, replace the existing test block titled `'the lemma cannot be entered as a sense (ADR-0061 repetition rule)'` (lines ~186–195) with:

```tsx
  it('accepts the lemma as a sense — metadata is not the clue, no repetition warning', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await expandBand(container);
    const sense = screen.getByRole('combobox', { name: 'Sens visé par cette définition' }) as HTMLInputElement;
    await act(async () => { fireEvent.change(sense, { target: { value: 'le chat' } }); });
    expect(sense.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await clickGood(container);
    expect(lastMeta(onVerdict).targetSense).toBe('le chat');
  });
```

(Leave the `expandBand` helper as-is for now; Task 4 rewrites it. This test uses the still-present global Ajuster.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run tests/sondage-rating-card-meta.test.tsx -t "accepts the lemma as a sense"`
Expected: FAIL — current SenseInput sets `aria-invalid="true"` and renders the `role="alert"` hint, so the two negative assertions fail.

- [ ] **Step 3: Remove the ban from SenseInput**

In `src/ui/components/sondage/SenseInput.tsx`:

Change the header comment (line 1) to:
```tsx
// ADR-0050: single-value combobox + listbox. Sens is metadata, not a clue — no lemma constraint.
```

Delete the `hintStyles` const (lines ~69–73).

In `SenseInputProps`, delete the `bannedTerm` doc comment + field (lines ~85–86):
```tsx
  // ADR-0061: a sense gloss must not repeat the lemma — the row already carries it.
  readonly bannedTerm?: string;
```
…and add an `autoFocus` field in their place:
```tsx
  // When opened inline, the field self-focuses with the caret at the end of existing content.
  readonly autoFocus?: boolean;
```

In the destructured params, replace `bannedTerm,` with `autoFocus = false,`.

Add the import of `useEffect` and `useRef` (currently `import { useId, useMemo, useState } from 'react';`):
```tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react';
```

Inside the component, add an input ref and the autofocus effect (just after the `const [open, setOpen] = useState(false);` line):
```tsx
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    if (el === null) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [autoFocus]);
```

Delete the `repeatsLemma` const (lines ~115–118).

On the `<input>`, add `ref={inputRef}` and delete the `aria-invalid={repeatsLemma || undefined}` line.

Delete the trailing alert block (lines ~205–207):
```tsx
      {repeatsLemma ? (
        <p className={hintStyles} role="alert">Le sens ne doit pas répéter le mot.</p>
      ) : null}
```

- [ ] **Step 4: Remove the pass-site in MetadataBand**

In `src/ui/components/sondage/MetadataBand.tsx`, on the `<SenseInput>` element, delete the line `bannedTerm={item.mot}` (the SenseInput one, ~line 632). Leave the GlossChipInput `bannedTerm` for Task 2.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test --run tests/sondage-rating-card-meta.test.tsx -t "accepts the lemma as a sense"`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/ui/components/sondage/SenseInput.tsx src/ui/components/sondage/MetadataBand.tsx tests/sondage-rating-card-meta.test.tsx
git commit -m "fix(frontend-survey): stop treating the lemma as banned in the Sens metadata field"
```

---

### Task 2: GlossChipInput — drop the lemma ban

**Files:**
- Modify: `src/ui/components/sondage/GlossChipInput.tsx`
- Modify: `src/ui/components/sondage/MetadataBand.tsx` (remove the GlossChipInput `bannedTerm` pass-site)
- Test: `tests/sondage-gloss-chip-input.test.tsx`

Rationale: same as Task 1 — Mots-clés are associated concepts (metadata), not the clue. The current ban *silently drops* a keyword that contains the lemma; metadata should accept it. Keep the trivial constraints (trim, maxLength, maxItems, dedupe).

- [ ] **Step 1: Write the failing test** — in `tests/sondage-gloss-chip-input.test.tsx`, replace the test `'rejects a gloss that contains the bannedTerm (ADR-0061 lemma-repetition rule)'` (lines ~129–139) with:

```tsx
  it('accepts a keyword that contains the lemma — metadata, not a clue', async () => {
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Sens cibles' }) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'chat animal félin' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(onChange).toHaveBeenCalledWith(['chat animal félin']);
    expect(screen.getByText('chat animal félin')).toBeInTheDocument();
  });
```

Also remove `bannedTerm` from the `ControlledHarness`: delete `readonly bannedTerm?: string;` (line 12), remove `bannedTerm` from the destructure (line 14), and delete `bannedTerm={bannedTerm}` (line 26).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run tests/sondage-gloss-chip-input.test.tsx -t "accepts a keyword that contains the lemma"`
Expected: FAIL — current `commit()` rejects the value (the `bannedTerm` branch returns early) so `onChange` is never called. (Note: the harness no longer passes `bannedTerm`, so this fails only because the prop default path still bans — it does not, so actually verify: with no `bannedTerm` the current code already accepts. If the test PASSES at this step, that is fine — proceed; the point of the edit is removing the dead prop. The red signal is guaranteed by the type error in Step 1's harness if `bannedTerm` were left in.)

> Executor note: the ban only triggers when `bannedTerm` is truthy. Removing it from the harness means the behavior test passes immediately. The meaningful change here is deleting the now-unreachable banned-term branch and the prop. Treat Step 2 as "confirm green after harness edit"; the prop deletion below is a dead-code removal verified by typecheck.

- [ ] **Step 3: Remove the ban from GlossChipInput**

In `src/ui/components/sondage/GlossChipInput.tsx`:

Change the header comment (line 1) to:
```tsx
// ADR-0050: combobox + listbox semantics, polite live region. Mots-clés are metadata — no lemma ban.
```

In `GlossChipInputProps`, delete the `bannedTerm` doc comment + field (lines ~128–129):
```tsx
  // ADR-0061 binding rule: a gloss must not repeat the lemma — the trained model already sees it in the row.
  readonly bannedTerm?: string;
```
…and add `autoFocus`:
```tsx
  // When opened inline, the field self-focuses on mount.
  readonly autoFocus?: boolean;
```

In the destructured params, replace `bannedTerm,` with `autoFocus = false,`.

In `commit()`, delete the ban branch (lines ~173–176):
```tsx
    if (bannedTerm && normalizeForMatch(trimmed).includes(normalizeForMatch(bannedTerm))) {
      setTyped('');
      return;
    }
```

Add an autofocus effect after the existing `const inputRef = useRef<HTMLInputElement | null>(null);` line:
```tsx
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
```
…and add `useEffect` to the React import:
```tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 4: Remove the pass-site in MetadataBand**

In `src/ui/components/sondage/MetadataBand.tsx`, on the `<GlossChipInput>` element, delete the line `bannedTerm={item.mot}` (~line 651).

- [ ] **Step 5: Run tests to verify green**

Run: `pnpm test --run tests/sondage-gloss-chip-input.test.tsx`
Expected: PASS (all GlossChipInput tests, including the new accept test).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/ui/components/sondage/GlossChipInput.tsx src/ui/components/sondage/MetadataBand.tsx tests/sondage-gloss-chip-input.test.tsx
git commit -m "fix(frontend-survey): accept lemma-containing keywords in the Mots-clés metadata field"
```

---

### Task 3: InlineEditableRow — the reusable display ⇄ editor wrapper

**Files:**
- Create: `src/ui/components/sondage/InlineEditableRow.tsx`
- Modify: `src/ui/components/sondage/index.ts` (export it)
- Test: `tests/sondage-inline-editable-row.test.tsx` (new)

Responsibility: render a single grid value-cell as either a read-only trigger `button` (with a hover/focus-revealed ✎, persistent on touch) or an inline editor. Centralizes the three behaviors every editable field shares: Escape → `onCancel`, Enter / focus-leaves-region → `onCommit`, and focus return to the trigger on close. Difficulté and Style do not use it (they never toggle).

Contract:
- `isOpen=false` → renders `<button data-testid={testId} aria-label={triggerAriaLabel}>` containing `renderDisplay()` + a ✎ glyph. Click calls `onOpen`.
- `isOpen=true` → renders a `<div>` wrapper containing `renderEditor()`. `Escape` (not already handled by the editor) calls `onCancel`; `Enter` (not already handled) calls `onCommit`; blur whose `relatedTarget` is outside the wrapper calls `onCommit`.
- On the open→closed transition, focus returns to the trigger button.

- [ ] **Step 1: Write the failing test**

Create `tests/sondage-inline-editable-row.test.tsx`:

```tsx
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineEditableRow } from '@/ui/components/sondage';

function Harness(props: {
  readonly onCommit?: () => void;
  readonly onCancel?: () => void;
  readonly empty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <InlineEditableRow
      label="Sens"
      isOpen={open}
      onOpen={() => setOpen(true)}
      onCommit={() => { props.onCommit?.(); setOpen(false); }}
      onCancel={() => { props.onCancel?.(); setOpen(false); }}
      triggerAriaLabel="Modifier le sens"
      empty={props.empty}
      testId="row-trigger"
      renderDisplay={() => <span>valeur</span>}
      renderEditor={() => <input aria-label="éditeur du sens" defaultValue="x" />}
    />
  );
}

describe('InlineEditableRow', () => {
  it('shows a read-only trigger at rest and swaps to the editor on click', async () => {
    render(<Harness />);
    const trigger = screen.getByTestId('row-trigger');
    expect(trigger).toHaveAttribute('aria-label', 'Modifier le sens');
    expect(screen.queryByLabelText('éditeur du sens')).toBeNull();
    await act(async () => { fireEvent.click(trigger); });
    expect(screen.getByLabelText('éditeur du sens')).toBeInTheDocument();
    expect(screen.queryByTestId('row-trigger')).toBeNull();
  });

  it('Escape inside the editor cancels and returns focus to the trigger', async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    await act(async () => { fireEvent.click(screen.getByTestId('row-trigger')); });
    const editor = screen.getByLabelText('éditeur du sens');
    await act(async () => { fireEvent.keyDown(editor, { key: 'Escape' }); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('row-trigger')).toHaveFocus();
  });

  it('Enter inside the editor (unhandled) commits', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await act(async () => { fireEvent.click(screen.getByTestId('row-trigger')); });
    const editor = screen.getByLabelText('éditeur du sens');
    await act(async () => { fireEvent.keyDown(editor, { key: 'Enter' }); });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('renders the empty trigger styling when empty', () => {
    render(<Harness empty />);
    expect(screen.getByTestId('row-trigger')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run tests/sondage-inline-editable-row.test.tsx`
Expected: FAIL — `InlineEditableRow` is not exported / does not exist.

- [ ] **Step 3: Create the component**

Create `src/ui/components/sondage/InlineEditableRow.tsx`:

```tsx
// Grid value-cell that toggles between a read-only trigger button and an inline editor.
// Centralizes focus return + Escape/Enter/blur so each field stays declarative.

import { useEffect, useRef, type ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

const triggerStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '100%',
  textAlign: 'start',
  background: 'none',
  border: '1px solid transparent',
  borderRadius: 'sm',
  paddingInline: '6px',
  paddingBlock: '3px',
  marginInline: '-6px',
  fontFamily: 'body',
  fontSize: 'sm',
  color: 'fg',
  cursor: 'pointer',
  minHeight: '28px',
  transition: 'background-color 120ms ease-out, border-color 120ms ease-out',
  _hover: { bg: 'surface', borderColor: 'metaSuggestedLine' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '1px',
  },
  '& .row-pencil': { opacity: 0, transition: 'opacity 120ms ease-out' },
  '&:hover .row-pencil, &:focus-visible .row-pencil': { opacity: 0.7 },
  // Touch / no-hover: keep the ✎ faintly visible so editability is discoverable.
  '@media (hover: none)': { '& .row-pencil': { opacity: 0.5 } },
});

const emptyTriggerStyles = css({
  borderStyle: 'dashed',
  borderColor: 'metaSuggestedLine',
  borderRadius: '999px',
  bg: 'surface',
  color: 'metaSuggestedText',
  fontWeight: 'semibold',
});

const pencilStyles = css({ fontSize: 'xs', flexShrink: 0 });

const editorCellStyles = css({ display: 'block', minWidth: 0 });

export interface InlineEditableRowProps {
  readonly label: string;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
  readonly triggerAriaLabel: string;
  readonly empty?: boolean;
  readonly testId?: string;
  readonly renderDisplay: () => ReactNode;
  readonly renderEditor: () => ReactNode;
}

export function InlineEditableRow({
  label,
  isOpen,
  onOpen,
  onCommit,
  onCancel,
  triggerAriaLabel,
  empty = false,
  testId,
  renderDisplay,
  renderEditor,
}: InlineEditableRowProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !isOpen) triggerRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  if (isOpen) {
    return (
      <div
        className={editorCellStyles}
        data-editor-region={label}
        onKeyDown={(e) => {
          if (e.defaultPrevented) return;
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter') {
            onCommit();
          }
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit();
        }}
      >
        {renderEditor()}
      </div>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      className={empty ? cx(triggerStyles, emptyTriggerStyles) : triggerStyles}
      data-testid={testId}
      aria-label={triggerAriaLabel}
      onClick={onOpen}
    >
      {renderDisplay()}
      <span className={cx('row-pencil', pencilStyles)} aria-hidden="true">✎</span>
    </button>
  );
}
```

- [ ] **Step 4: Export it from the barrel**

In `src/ui/components/sondage/index.ts`, add after the `MetadataBand` export line:
```tsx
export { InlineEditableRow, type InlineEditableRowProps } from './InlineEditableRow';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test --run tests/sondage-inline-editable-row.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/ui/components/sondage/InlineEditableRow.tsx src/ui/components/sondage/index.ts tests/sondage-inline-editable-row.test.tsx
git commit -m "feat(frontend-survey): add InlineEditableRow wrapper for in-place field editing"
```

---

### Task 4: MetadataBand — rewrite around the single grid + `openField`

**Files:**
- Rewrite: `src/ui/components/sondage/MetadataBand.tsx`
- Rewrite: `tests/sondage-rating-card-meta.test.tsx` (per-field open helpers; carry the lemma-accepted test from Task 1)
- Modify: `tests/contribuer-route.test.tsx` (the one `band-adjust` click → open the Sens field)

This is the pivot task. The new test file is the spec for the new band; write it first (red — no per-field triggers exist), then rewrite the component (green). After this task, `MetadataBand` no longer references `band.expanded` / `band.toggleExpanded` (the hook still provides them until Task 6, so the tree compiles).

- [ ] **Step 1: Rewrite the meta test file**

Replace the entire contents of `tests/sondage-rating-card-meta.test.tsx` with:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LemmaMeta, SurveyClient, SurveyItem } from '@/application/survey';
import { clearLemmaMetaCache, RatingCard } from '@/ui/components/sondage';

const sampleItem: SurveyItem = {
  itemId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  mot: 'CHAT',
  definition: 'Animal domestique à moustaches',
  pos: 'nom_commun',
  categorie: 'faune_flore',
  style: 'definition_directe',
  forceClaimed: 2,
  longueur: 4,
  tier: 'mid',
  isCalibration: false,
};

function stubClient(meta: LemmaMeta): SurveyClient {
  return {
    getNextItem: vi.fn(),
    submitRating: vi.fn(),
    getNextPair: vi.fn(),
    submitPairRating: vi.fn(),
    undoAction: vi.fn(),
    getProgress: vi.fn(),
    getContributions: vi.fn(),
    patchPreferences: vi.fn(),
    getCurrentCampaign: vi.fn(),
    getLemmaMeta: vi.fn().mockResolvedValue(meta),
  };
}

function lastMeta(fn: ReturnType<typeof vi.fn>) {
  const call = fn.mock.calls[fn.mock.calls.length - 1];
  return call[2];
}

async function clickEl(el: Element | null): Promise<void> {
  await act(async () => { fireEvent.click(el as HTMLButtonElement); });
}

type FieldKey = 'nature' | 'categories' | 'sens' | 'motscles';

// Each editable field is opened by clicking its read-only trigger; no global Ajuster anymore.
async function openField(container: HTMLElement, field: FieldKey): Promise<void> {
  await clickEl(container.querySelector(`[data-testid="band-edit-${field}"]`));
}
async function openCategoryPicker(): Promise<void> {
  await clickEl(screen.getByRole('button', { name: /Toutes les catégories/ }));
}
async function clickCategory(container: HTMLElement, cat: string): Promise<void> {
  await clickEl(container.querySelector(`[data-categorie="${cat}"]`));
}
async function clickGood(container: HTMLElement): Promise<void> {
  await clickEl(container.querySelector('[data-verdict="GOOD"]'));
}

describe('RatingCard meta inputs', () => {
  beforeEach(() => { clearLemmaMetaCache(); });

  it('toggling a category adds it; verdict carries the new selection', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['faune_flore', 'objet']);
  });

  it('cannot drop below the seed (min 1) but can remove an added category', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await clickCategory(container, 'faune_flore');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickCategory(container, 'objet');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['faune_flore']);
  });

  it('caps category selection at 6', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    for (const c of ['objet', 'corps', 'culture', 'histoire', 'jeu']) {
      await clickCategory(container, c);
    }
    await clickCategory(container, 'sport');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toHaveLength(6);
  });

  it('checking "autre" clears every other category', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickCategory(container, 'autre');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['autre']);
  });

  it('checking another category clears a previously selected "autre"', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'autre');
    await clickCategory(container, 'objet');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['objet']);
  });

  it('announces all cleared when "autre" replaces other selections', async () => {
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    await clickCategory(container, 'autre');
    const liveRegion = container.querySelector('[data-testid="band-categories"] [role="status"]')!;
    expect(liveRegion.textContent).toContain('retirées');
  });

  it('announces "autre" removed when a non-exclusive category is selected', async () => {
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'autre');
    await clickCategory(container, 'objet');
    const liveRegion = container.querySelector('[data-testid="band-categories"] [role="status"]')!;
    expect(liveRegion.textContent).toContain('Autre');
    expect(liveRegion.textContent).toContain('retirée');
  });

  it('autre is still clickable when 6 categories are already selected', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    for (const c of ['objet', 'corps', 'culture', 'histoire', 'jeu']) {
      await clickCategory(container, c);
    }
    const autreOption = container.querySelector<HTMLButtonElement>('[data-categorie="autre"]')!;
    expect(autreOption.disabled).toBe(false);
    await clickCategory(container, 'autre');
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['autre']);
  });

  it('typing a single sense threads it into the verdict meta', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'sens');
    const sense = screen.getByRole('combobox', { name: 'Sens visé par cette définition' }) as HTMLInputElement;
    await act(async () => { fireEvent.change(sense, { target: { value: 'animal félin' } }); });
    await clickGood(container);
    expect(lastMeta(onVerdict).targetSense).toBe('animal félin');
    expect(lastMeta(onVerdict).isMultisense).toBe(false);
  });

  it('accepts the lemma as a sense — metadata is not the clue, no repetition warning', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'sens');
    const sense = screen.getByRole('combobox', { name: 'Sens visé par cette définition' }) as HTMLInputElement;
    await act(async () => { fireEvent.change(sense, { target: { value: 'le chat' } }); });
    expect(sense.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await clickGood(container);
    expect(lastMeta(onVerdict).targetSense).toBe('le chat');
  });

  it('adds and removes sub-tags; verdict carries them', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'motscles');
    const subInput = screen.getByRole('combobox', { name: 'Mots-clés' }) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(subInput, { target: { value: 'félin' } });
      fireEvent.keyDown(subInput, { key: 'Enter' });
    });
    await act(async () => {
      fireEvent.change(subInput, { target: { value: 'domestique' } });
      fireEvent.keyDown(subInput, { key: 'Enter' });
    });
    await clickGood(container);
    expect(lastMeta(onVerdict).subTags).toEqual(['félin', 'domestique']);
  });

  it('sub-tags start empty per item (no prior prefill)', async () => {
    const client = stubClient({ priorSenses: [], priorSubTags: ['ancien-tag'] });
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable surveyClient={client} />,
    );
    await waitFor(() => expect(client.getLemmaMeta).toHaveBeenCalled());
    await clickGood(container);
    expect(lastMeta(onVerdict).subTags).toEqual([]);
  });

  it('autocompletes sub-tags and senses from lemma-meta priors', async () => {
    const client = stubClient({ priorSenses: ['conversation digitale'], priorSubTags: ['capitale'] });
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={async () => {}} onCorriger={async () => {}} enrichable surveyClient={client} />,
    );
    await waitFor(() => expect(client.getLemmaMeta).toHaveBeenCalled());
    await openField(container, 'sens');
    const sense = screen.getByRole('combobox', { name: 'Sens visé par cette définition' }) as HTMLInputElement;
    await act(async () => {
      fireEvent.focus(sense);
      fireEvent.change(sense, { target: { value: 'conv' } });
    });
    expect(screen.getByRole('listbox', { name: 'Sens visé par cette définition' }).textContent).toContain('conversation digitale');
  });

  it('resets meta to the item prior when the item changes', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'categories');
    await openCategoryPicker();
    await clickCategory(container, 'objet');
    const next: SurveyItem = { ...sampleItem, itemId: 'next-id', mot: 'BANQUE', categorie: 'societe' };
    rerender(<RatingCard item={next} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />);
    await clickGood(container);
    expect(lastMeta(onVerdict).targetCategories).toEqual(['societe']);
  });

  it('Réinitialiser restores the nature grammaticale to the item prior', async () => {
    const onVerdict = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RatingCard item={sampleItem} onVerdict={onVerdict} onCorriger={async () => {}} enrichable />,
    );
    await openField(container, 'nature');
    const select = container.querySelector('[data-testid="band-pos-select"]') as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: 'verbe_infinitif' } }); });
    // Picking auto-closes the editor; the trigger now shows the new label.
    expect(container.querySelector('[data-testid="band-edit-nature"]')!.textContent).toContain('Verbe (infinitif)');
    await clickEl(container.querySelector('[data-testid="band-reset"]'));
    expect(container.querySelector('[data-testid="band-edit-nature"]')!.textContent).toContain('Nom commun');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test --run tests/sondage-rating-card-meta.test.tsx`
Expected: FAIL — `[data-testid="band-edit-*"]` triggers don't exist yet (the old band has no per-field triggers), so `openField` clicks `null` and every query fails.

- [ ] **Step 3: Rewrite MetadataBand**

Replace the entire contents of `src/ui/components/sondage/MetadataBand.tsx` with:

```tsx
// Inline-editable metadata band: one compact grid; each field edits in place (ADR-0061, auth-only).

import { useEffect, useId, useRef, useState } from 'react';
import { css, cx } from 'styled-system/css';
import type { SurveyCategorie, SurveyItem, SurveyPos } from '@/application/survey';
import { CATEGORIE_OPTIONS, POS_OPTIONS, categorieLabel, posLabel } from './labels';
import { InlineEditableRow } from './InlineEditableRow';
import { SenseInput } from './SenseInput';
import { GlossChipInput } from './GlossChipInput';
import { PerceivedDifficultyPicker } from './PerceivedDifficultyPicker';
import { StyleTooltip } from './StyleTooltip';
import type { MetadataBand as Band } from './useMetadataBand';

type FieldKey = 'nature' | 'categories' | 'sens' | 'motscles';

const bandStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  borderRadius: 'md',
  border: '1px solid token(colors.metaSuggestedLine)',
  bg: 'metaSuggestedBg',
  padding: 'md',
  transition: 'background-color 160ms ease-out, border-color 160ms ease-out',
  '&[data-state="modified"]': { bg: 'metaModifiedBg', borderColor: 'metaModifiedLine' },
  '&[data-state="saved"]': { bg: 'metaSavedBg', borderColor: 'metaSavedLine' },
});

const headerRowStyles = css({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'sm' });

const markerCircleStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  borderRadius: '999px',
  border: '1px solid token(colors.metaSuggestedLine)',
  bg: 'surface',
  color: 'metaSuggestedText',
  fontSize: 'sm',
  lineHeight: 1,
  flexShrink: 0,
});

const overlineStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'fg',
});

const overlineNoteStyles = css({
  fontSize: 'xs',
  color: 'fgMuted',
  fontWeight: 'normal',
  textTransform: 'none',
  letterSpacing: 0,
});

const badgeStyles = css({
  marginInlineStart: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  paddingInline: 'sm',
  paddingBlock: '3px',
  borderRadius: '999px',
  fontSize: 'xs',
  fontWeight: 'semibold',
  bg: 'surface',
  border: '1px solid token(colors.metaSuggestedLine)',
  color: 'metaSuggestedText',
  '&[data-state="modified"]': { borderColor: 'metaModifiedLine', color: 'metaModifiedText' },
  '&[data-state="saved"]': { borderColor: 'metaSavedLine', color: 'metaSavedText' },
});

const CONTENT_INDENT = 'calc(26px + token(spacing.sm))';

const bodyStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  paddingInlineStart: CONTENT_INDENT,
});

const gridStyles = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  rowGap: '6px',
  columnGap: 'sm',
  alignItems: 'start',
  margin: 0,
});

const keyStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'metaSuggestedText',
  paddingBlock: '5px',
});

const valStyles = css({ fontSize: 'sm', color: 'fg', minWidth: 0, paddingBlock: '5px' });

const difficultyRowStyles = css({ gridColumn: '1 / -1', marginBlockStart: '2px' });

const posSelectStyles = css({
  appearance: 'none',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: 'semibold',
  color: 'fg',
  bg: 'surface',
  border: '1px solid token(colors.border)',
  borderRadius: 'sm',
  paddingInline: 'sm',
  paddingBlock: '6px',
  paddingInlineEnd: '26px',
  cursor: 'pointer',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, token(colors.fgMuted) 50%), linear-gradient(135deg, token(colors.fgMuted) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 14px) 53%, calc(100% - 9px) 53%',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
});

const actionsRowStyles = css({ display: 'flex', alignItems: 'center', gap: 'sm', marginBlockStart: '2px' });

const primaryButtonStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'sm',
  paddingInline: 'md',
  paddingBlock: 'sm',
  borderRadius: '6px',
  fontFamily: 'body',
  fontSize: 'body',
  fontWeight: 'bold',
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  transition: 'background-color 120ms ease-out, opacity 120ms ease-out',
  _hover: { bg: 'primary.400' },
  _disabled: { opacity: 0.55, cursor: 'default' },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
});

const kbdStyles = css({
  fontFamily: 'mono',
  fontSize: 'xs',
  fontWeight: 'normal',
  paddingInline: '5px',
  paddingBlock: '1px',
  borderRadius: 'sm',
  bg: 'rgba(255,255,255,0.25)',
  color: 'inherit',
});

const resetButtonStyles = css({
  marginInlineStart: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  paddingInline: 'sm',
  paddingBlock: 'sm',
  borderRadius: '6px',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: 'semibold',
  bg: 'transparent',
  color: 'fgMuted',
  border: 'none',
  cursor: 'pointer',
  _hover: { color: 'error' },
  _disabled: { opacity: 0.4, cursor: 'default', _hover: { color: 'fgMuted' } },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px', borderRadius: 'sm' },
});

const chipRowStyles = css({ display: 'flex', flexWrap: 'wrap', gap: 'xs', margin: 0 });

const suggestedChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  paddingInline: 'sm',
  paddingBlock: '6px',
  borderRadius: '999px',
  fontSize: 'sm',
  fontWeight: 'semibold',
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  _hover: { bg: 'primary.400' },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
});

const addedChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  paddingInline: 'sm',
  paddingBlock: '6px',
  borderRadius: '999px',
  fontSize: 'sm',
  fontWeight: 'semibold',
  bg: 'surface',
  color: 'accent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  _hover: { bg: 'primary.100' },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
});

const optionChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  paddingInline: 'sm',
  paddingBlock: '6px',
  borderRadius: '999px',
  fontSize: 'sm',
  fontWeight: 'medium',
  bg: 'surface',
  color: 'fg',
  border: '1px solid token(colors.border)',
  cursor: 'pointer',
  _hover: { borderColor: 'accent', color: 'accent' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
});

const expanderStyles = css({
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 'xs',
  fontWeight: 'semibold',
  color: 'accent',
  cursor: 'pointer',
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px', borderRadius: 'sm' },
});

const categoriesEditorStyles = css({ display: 'flex', flexDirection: 'column', gap: '6px' });

const tagListStyles = css({ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', alignItems: 'baseline' });

const liveRegionStyles = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

const MAX_CATEGORIES = 6;
const EXCLUSIVE_CATEGORIE: SurveyCategorie = 'autre';

export interface MetadataBandProps {
  readonly band: Band;
  readonly item: SurveyItem;
  readonly pos: SurveyPos;
  readonly onPosChange: (next: SurveyPos) => void;
  readonly posDisabled?: boolean;
  readonly senseSuggestions: ReadonlyArray<string>;
  readonly subTagSuggestions: ReadonlyArray<string>;
}

function badgeText(state: Band['state']): string {
  if (state === 'saved') return '✓ Enregistré';
  if (state === 'modified') return '✦ Modifié · à enregistrer';
  return '✦ Pré-rempli · à vérifier';
}

function primaryLabel(state: Band['state']): string {
  if (state === 'saved') return 'Enregistré';
  if (state === 'modified') return 'Enregistrer';
  return 'Confirmer';
}

export function MetadataBand({
  band,
  item,
  pos,
  onPosChange,
  posDisabled = false,
  senseSuggestions,
  subTagSuggestions,
}: MetadataBandProps) {
  const posSelectId = useId();
  const [openField, setOpenField] = useState<FieldKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const snapshotRef = useRef<{
    pos: SurveyPos;
    categories: ReadonlyArray<SurveyCategorie>;
    sense: string;
    subTags: ReadonlyArray<string>;
  } | null>(null);

  // A stale editor from the previous card must not linger after re-seed.
  useEffect(() => { setOpenField(null); setPickerOpen(false); }, [item.itemId]);

  const selected = band.values.targetCategories;
  const selectedSet = new Set(selected);
  const unselected = CATEGORIE_OPTIONS.filter((c) => !selectedSet.has(c as SurveyCategorie));

  function open(field: FieldKey): void {
    snapshotRef.current = {
      pos,
      categories: band.values.targetCategories,
      sense: band.values.targetSense,
      subTags: band.values.subTags,
    };
    setOpenField(field);
  }
  function commitField(): void { setOpenField(null); }
  function cancelField(): void {
    const snap = snapshotRef.current;
    if (snap) {
      if (openField === 'nature') onPosChange(snap.pos);
      else if (openField === 'categories') band.setCategories(snap.categories);
      else if (openField === 'sens') band.setSense(snap.sense);
      else if (openField === 'motscles') band.setSubTags(snap.subTags);
    }
    setOpenField(null);
  }

  function toggleCategory(cat: SurveyCategorie): void {
    if (selectedSet.has(cat)) {
      if (selected.length <= 1) return;
      band.setCategories(selected.filter((c) => c !== cat));
      setAnnounce(`${categorieLabel(cat)} retirée`);
      return;
    }
    if (cat === EXCLUSIVE_CATEGORIE) {
      const hadOthers = selected.length > 0;
      band.setCategories([cat]);
      setAnnounce(
        hadOthers
          ? `${categorieLabel(cat)} sélectionnée, autres catégories retirées`
          : `${categorieLabel(cat)} ajoutée`,
      );
      return;
    }
    const hadExclusive = selected.includes(EXCLUSIVE_CATEGORIE);
    const base = hadExclusive ? selected.filter((c) => c !== EXCLUSIVE_CATEGORIE) : selected;
    if (base.length >= MAX_CATEGORIES) return;
    band.setCategories([...base, cat]);
    setAnnounce(
      hadExclusive
        ? `${categorieLabel(cat)} ajoutée, ${categorieLabel(EXCLUSIVE_CATEGORIE)} retirée`
        : `${categorieLabel(cat)} ajoutée`,
    );
  }

  const categoriesSummary = selected.map((c) => categorieLabel(c)).join(', ');
  const sense = band.values.targetSense.trim();
  const subTags = band.values.subTags;

  return (
    <section className={bandStyles} data-state={band.state} data-testid="metadata-band">
      <div className={headerRowStyles}>
        <span className={markerCircleStyles} aria-hidden="true">✦</span>
        <span className={overlineStyles}>
          Métadonnées{' '}
          <span className={overlineNoteStyles}>· optionnel, aide l’entraînement</span>
        </span>
        <span className={badgeStyles} data-state={band.state} data-testid="band-status-badge">
          {badgeText(band.state)}
        </span>
      </div>

      <div className={bodyStyles}>
        <dl className={gridStyles}>
          <dt className={keyStyles}>Nature</dt>
          <dd className={valStyles}>
            <InlineEditableRow
              label="Nature grammaticale"
              isOpen={openField === 'nature'}
              onOpen={() => open('nature')}
              onCommit={commitField}
              onCancel={cancelField}
              triggerAriaLabel={`Modifier la nature grammaticale — ${posLabel(pos)}`}
              testId="band-edit-nature"
              renderDisplay={() => posLabel(pos)}
              renderEditor={() => (
                <select
                  id={posSelectId}
                  className={posSelectStyles}
                  data-testid="band-pos-select"
                  value={pos}
                  disabled={posDisabled}
                  autoFocus
                  onChange={(e) => { onPosChange(e.target.value as SurveyPos); commitField(); }}
                >
                  {POS_OPTIONS.map((p) => (
                    <option key={p} value={p}>{posLabel(p)}</option>
                  ))}
                </select>
              )}
            />
          </dd>

          <dt className={keyStyles}>Style</dt>
          <dd className={valStyles}>
            <StyleTooltip style={item.style} definition={item.definition} mot={item.mot} labelHidden />
          </dd>

          <dt className={keyStyles}>Catégories</dt>
          <dd className={valStyles}>
            <InlineEditableRow
              label="Catégories"
              isOpen={openField === 'categories'}
              onOpen={() => open('categories')}
              onCommit={commitField}
              onCancel={cancelField}
              triggerAriaLabel={`Modifier les catégories — ${categoriesSummary}`}
              testId="band-edit-categories"
              renderDisplay={() => categoriesSummary}
              renderEditor={() => (
                <div className={categoriesEditorStyles} data-testid="band-categories">
                  <p className={chipRowStyles}>
                    {selected.map((cat) => {
                      const prefilled = cat === item.categorie;
                      return (
                        <button
                          key={cat}
                          type="button"
                          className={prefilled ? suggestedChipStyles : addedChipStyles}
                          data-categorie={cat}
                          data-prefilled={prefilled}
                          aria-label={`Retirer ${categorieLabel(cat)}${prefilled ? ' (pré-remplie)' : ' (ajoutée)'}`}
                          onClick={() => toggleCategory(cat)}
                        >
                          <span aria-hidden="true">{prefilled ? '✦' : '✓'}</span> {categorieLabel(cat)}
                        </button>
                      );
                    })}
                  </p>
                  <button
                    type="button"
                    className={expanderStyles}
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen((o) => !o)}
                  >
                    {pickerOpen ? '– Réduire les catégories ▴' : '+ Toutes les catégories ▾'}
                  </button>
                  {pickerOpen ? (
                    <p className={chipRowStyles}>
                      {unselected.map((opt) => {
                        const cat = opt as SurveyCategorie;
                        return (
                          <button
                            key={cat}
                            type="button"
                            className={optionChipStyles}
                            data-categorie={cat}
                            disabled={cat !== EXCLUSIVE_CATEGORIE && selected.length >= MAX_CATEGORIES}
                            aria-label={`Ajouter ${categorieLabel(cat)}`}
                            onClick={() => toggleCategory(cat)}
                          >
                            {categorieLabel(cat)}
                          </button>
                        );
                      })}
                    </p>
                  ) : null}
                  <span role="status" aria-live="polite" aria-atomic="true" className={liveRegionStyles}>
                    {announce}
                  </span>
                </div>
              )}
            />
          </dd>

          <dt className={keyStyles}>Sens</dt>
          <dd className={valStyles}>
            <InlineEditableRow
              label="Sens visé par cette définition"
              isOpen={openField === 'sens'}
              onOpen={() => open('sens')}
              onCommit={commitField}
              onCancel={cancelField}
              triggerAriaLabel={sense ? `Modifier le sens — ${sense}` : 'Ajouter le sens — vide'}
              empty={sense === ''}
              testId="band-edit-sens"
              renderDisplay={() => (sense ? sense : '+ préciser le sens…')}
              renderEditor={() => (
                <SenseInput
                  value={band.values.targetSense}
                  onChange={band.setSense}
                  suggestions={senseSuggestions}
                  label="Sens visé par cette définition"
                  labelHidden
                  placeholder="ex. saison entre l’été et l’hiver…"
                  autoFocus
                />
              )}
            />
          </dd>

          <dt className={keyStyles}>Mots-clés</dt>
          <dd className={valStyles}>
            <InlineEditableRow
              label="Mots-clés"
              isOpen={openField === 'motscles'}
              onOpen={() => open('motscles')}
              onCommit={commitField}
              onCancel={cancelField}
              triggerAriaLabel={subTags.length > 0 ? `Modifier les mots-clés — ${subTags.join(', ')}` : 'Ajouter des mots-clés — vide'}
              empty={subTags.length === 0}
              testId="band-edit-motscles"
              renderDisplay={() => (subTags.length > 0 ? <span className={tagListStyles}>{subTags.join(', ')}</span> : '+ ajouter…')}
              renderEditor={() => (
                <GlossChipInput
                  value={[...subTags]}
                  onChange={band.setSubTags}
                  suggestions={subTagSuggestions}
                  ariaLabel="Mots-clés"
                  placeholder="+ ajouter…"
                  maxItems={12}
                  maxLength={40}
                  autoFocus
                />
              )}
            />
          </dd>

          <div className={difficultyRowStyles}>
            <PerceivedDifficultyPicker
              value={band.values.perceivedDifficulty}
              onChange={band.setPerceivedDifficulty}
              announced={item.forceClaimed}
            />
          </div>
        </dl>

        <div className={actionsRowStyles}>
          <button
            type="button"
            className={primaryButtonStyles}
            data-testid="band-primary"
            disabled={band.state === 'saved'}
            onClick={band.primaryAction}
          >
            {primaryLabel(band.state)}
            <kbd className={kbdStyles}>Espace</kbd>
          </button>
          <button
            type="button"
            className={resetButtonStyles}
            data-testid="band-reset"
            disabled={band.state === 'pristine' && pos === item.pos}
            onClick={() => { setOpenField(null); band.reset(); onPosChange(item.pos); }}
          >
            <span aria-hidden="true">↺</span> Réinitialiser
          </button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Fix the one route-test that opened the band via Ajuster**

In `tests/contribuer-route.test.tsx`, in the test `'auth verdict strips targetSense that repeats the lemma before submission (ADR-0061 §2)'`, replace the `band-adjust` click (line ~518):
```tsx
      document.querySelector<HTMLButtonElement>('[data-testid="band-adjust"]')!.click();
```
with a click on the Sens field trigger:
```tsx
      document.querySelector<HTMLButtonElement>('[data-testid="band-edit-sens"]')!.click();
```
(Submit-shape is unchanged: the route still strips the lemma-repeating sense, so the rest of this test and its assertions stay as-is.)

- [ ] **Step 5: Run the affected tests**

Run: `pnpm test --run tests/sondage-rating-card-meta.test.tsx tests/contribuer-route.test.tsx`
Expected: PASS — all meta tests and the route test green.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/ui/components/sondage/MetadataBand.tsx tests/sondage-rating-card-meta.test.tsx tests/contribuer-route.test.tsx
git commit -m "feat(frontend-survey): inline field-by-field editing for the /contribuer metadata band"
```

---
### Task 5: RatingCard — retire the `A` shortcut and `toggleExpanded`

**Files:**
- Modify: `frontend/src/ui/components/sondage/RatingCard.tsx:332,354-358,371`

The band no longer exposes `toggleExpanded` (Task 6 removes it from the hook). The
`A`-to-expand keyboard shortcut is retired (not reassigned). The Space-to-confirm
handler already ignores events from inputs/selects/comboboxes/listboxes (existing guard
at lines ~339-340), so typing a space inside an open Sens / Mots-clés editor already does
not trigger confirm — no new guard is needed.

- [ ] **Step 1: Remove `toggleExpanded` from the band destructure**

At line ~332, change:
```tsx
  const { toggleExpanded, primaryAction, difficulteForSubmit } = band;
```
to:
```tsx
  const { primaryAction, difficulteForSubmit } = band;
```

- [ ] **Step 2: Delete the `A`-shortcut block**

Remove these lines (~354-358):
```tsx
      if (key === 'a' && enrichable) {
        event.preventDefault();
        toggleExpanded();
        return;
      }
```

- [ ] **Step 3: Remove `toggleExpanded` from the handler deps**

In the `useCallback` deps array at line ~371, drop `toggleExpanded`. If `enrichable` is no
longer referenced anywhere else in the callback after Step 2, leave it — it is still used
by the Space guard. Verify by reading the surrounding lines; only remove `toggleExpanded`.

- [ ] **Step 4: Typecheck to prove nothing else referenced `toggleExpanded`**

Run: `pnpm typecheck`
Expected: PASS — no "Property 'toggleExpanded' does not exist" and no unused-var error.

- [ ] **Step 5: Run the card test suite**

Run: `pnpm test --run tests/sondage-rating-card-meta.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/sondage/RatingCard.tsx
git commit -m "refactor(frontend-survey): retire the band Ajuster A-shortcut and toggleExpanded"
```

---

### Task 6: useMetadataBand — remove `expanded` / `toggleExpanded`

**Files:**
- Modify: `frontend/src/ui/components/sondage/useMetadataBand.ts:20,30,66,74,103,116,127,134,142`
- Test: `frontend/tests/sondage-use-metadata-band.test.ts` (verify only — no change expected)

The global expand state is gone. Strip `expanded` and `toggleExpanded` from the hook's
public interface and implementation. Everything else (values, tri-state, re-seed on
item change, `reset`, `primaryAction`) is unchanged.

- [ ] **Step 1: Remove from the returned interface**

In the `UseMetadataBand` (or equivalently named) interface, delete:
```tsx
  readonly expanded: boolean;
```
and
```tsx
  readonly toggleExpanded: () => void;
```

- [ ] **Step 2: Remove the state, the reset-effect line, and the callback**

Delete the `expanded` state declaration:
```tsx
  const [expanded, setExpanded] = useState(false);
```
In the re-seed effect, delete the line that resets it:
```tsx
    setExpanded(false);
```
Delete the `toggleExpanded` definition:
```tsx
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
```

- [ ] **Step 3: Remove from the return object and any deps arrays**

In the returned object, delete the `expanded` and `toggleExpanded` entries. If any
`useMemo`/`useCallback` deps array listed `expanded` or `toggleExpanded`, remove those
entries too. After this, `useState` may be the only remaining import use — leave the
import line as-is if `useState` is still used elsewhere in the file; if `useState` is now
entirely unused, drop it from the React import.

- [ ] **Step 4: Verify the existing hook test still passes unchanged**

The hook test (`tests/sondage-use-metadata-band.test.ts`) does not reference
`expanded`/`toggleExpanded`, so it needs no edit.

Run: `pnpm test --run tests/sondage-use-metadata-band.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite (the integration point of all prior tasks)**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm test`
Expected: PASS — entire suite green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/sondage/useMetadataBand.ts
git commit -m "refactor(frontend-survey): drop expanded/toggleExpanded from useMetadataBand"
```

---

### Task 7: Full validation + manual browser check

**Files:** none (verification only)

- [ ] **Step 1: Run the four CI gates locally**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: all four exit 0. `lint` must be clean (no boundary violations, no unused vars
from the removals). `build` must succeed.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`
Expected: Vite serves on the printed port (typically 5173).

- [ ] **Step 3: Manually exercise the inline band on authed `/contribuer`**

Sign in as an authed contributor (the band is auth-only, ADR-0061). On a rating card,
verify each acceptance behavior from the spec:

1. The band shows ONE compact grid — no read-only `<dl>` summary AND no divider AND no
   second editable section. No "Ajuster" / "Réduire" button anywhere.
2. **Nature:** click the value → a `<select>` appears, focused; pick a value → it
   auto-closes and the badge flips to "Modifié".
3. **Style:** read-only tooltip text, no ✎, never toggles.
4. **Catégories:** click → in-place chip picker with "toutes les catégories"; add/remove a
   category; opening another field closes this one.
5. **Sens:** empty state shows a dashed `+ préciser le sens…` pill; click → text input
   focused with caret at end; type a value INCLUDING the lemma itself (e.g. "CHAT") →
   **no error, no red border, no alert** (validation removed); Enter or blur keeps it.
6. **Mots-clés:** empty shows `+ ajouter…` pill; click → chip input; add a tag that equals
   the lemma → **accepted, no rejection**; dedupe + max still enforced.
7. **Difficulté:** always-live dot picker (no open/close); announced shown muted until a
   perceived dot is chosen.
8. **One open at a time:** opening field B commits and closes field A.
9. **Keyboard:** Tab walks the value buttons; Space confirms the card **only when focus is
   not in a text editor** — typing a space in Sens does not confirm.
10. **Escape** in an open editor reverts the in-flight edit to the value-at-open and closes,
    returning focus to the trigger button.
11. **Réinitialiser** closes any open editor and restores the baseline.
12. Changing to the next survey item re-seeds the band and closes any open editor.

If anything in steps 1-12 fails, fix it before declaring done. If the environment cannot
serve an authed session locally, say so explicitly rather than claiming the manual check
passed.

- [ ] **Step 4: Stop the dev server**

Ctrl-C the `pnpm dev` process.

---

## Self-review (completed during authoring)

- **Spec coverage:** removal of duplicated section (Tasks 3-4), per-field behavior table
  (Task 4 grid), cross-cutting rules 1-9 (InlineEditableRow in Task 3 + grid wiring in
  Task 4 + RatingCard Space guard already present in Task 5), validation change (Tasks 1-2
  remove both `bannedTerm` paths and the sens-repetition test), state ownership
  (`openField` local to MetadataBand in Task 4; `expanded`/`toggleExpanded` removed in
  Task 6), file structure (every file named in the spec's "File structure" has a task).
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; every run step
  names the command and expected result.
- **Type consistency:** `FieldKey` union and the `band-edit-${field}` testids are defined
  in Task 4 and consumed by the route-test fix (Task 4 Step 4) and the manual checks;
  `InlineEditableRowProps` prop names (`isOpen`/`onOpen`/`onCommit`/`onCancel`/
  `triggerAriaLabel`/`empty`/`testId`/`renderDisplay`/`renderEditor`) are identical
  between Task 3 (definition) and Task 4 (call sites); `autoFocus` prop added in Tasks 1-2
  is consumed by Task 4's Sens/Mots-clés editors.

## Known tension to flag at handoff (not a scope expansion)

The UI stops warning on a sense/keyword that repeats the lemma (intended — these are
metadata, not the clue). But the route-level submit strip at
`frontend/src/ui/routes/contribuer.lazy.tsx:188` still silently drops a `targetSense` that
equals the lemma. Spec marks submit-shape **out of scope**, so this plan keeps it. Surface
this to the maintainer: a contributor could type a valid metadata sense that equals the
lemma, see no warning, and have it silently stripped on submit. Decide separately whether
to relax the route strip in a follow-up.
