import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import type { LetterCell, Puzzle } from '@/domain';
import type { PuzzleSolver, ValidationResult } from '@/application';
import { useGridNavigation } from '@/ui/components/grid/useGridNavigation';
import { usePuzzleValidation } from '@/ui/components/grid/usePuzzleValidation';

// Single across word "ABC": def at (0,0), letters (0,1),(0,2),(0,3).
const PUZZLE: Puzzle = {
  id: 'lock-test', title: 't', language: 'fr', width: 4, height: 1, hintsAllowed: 3, hintsRemaining: 3,
  cells: [
    { kind: 'definition', position: { row: 0, col: 0 }, clues: [{ text: 'word', arrow: 'right' }] },
    { kind: 'letter', position: { row: 0, col: 1 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 2 }, entry: '' },
    { kind: 'letter', position: { row: 0, col: 3 }, entry: '' },
  ],
};

const inputAt = (root: HTMLElement, row: number, col: number) =>
  root.querySelector<HTMLInputElement>(`[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`);
// Wrap in act so the handleFocus setFocused re-render commits into stateRef before the next keystroke reads it.
const click = (el: HTMLElement) => { act(() => { el.focus(); fireEvent.click(el); }); };
const typeChar = (el: HTMLInputElement, ch: string) => fireEvent.keyDown(el, { key: ch });

const letterCells = PUZZLE.cells.filter((c): c is LetterCell => c.kind === 'letter');

function renderCells(nav: ReturnType<typeof useGridNavigation>, validated: ReadonlySet<string>) {
  return letterCells.map((cell) => {
    const k = `${cell.position.row},${cell.position.col}`;
    return (
      <input
        key={k}
        ref={nav.registerCellRef}
        data-cell-kind="letter"
        data-row={cell.position.row}
        data-col={cell.position.col}
        readOnly={validated.has(k)}
        onKeyDown={nav.handleKeyDown}
        onInput={nav.handleInput}
        onFocus={nav.handleFocus}
        defaultValue=""
      />
    );
  });
}

// Mirrors PlayScreen's wiring: isInputLocked reads usePuzzleValidation's `pending` flag.
function ValidationHarness({
  solver,
  onCellChange,
}: {
  solver: PuzzleSolver;
  onCellChange?: () => void;
}) {
  const validation = usePuzzleValidation(PUZZLE, solver);
  const validatedRef = useRef(validation.validated);
  validatedRef.current = validation.validated;
  const nav = useGridNavigation(PUZZLE, {
    onCellChange: () => {
      onCellChange?.();
      validation.onGridChanged();
    },
    isCellValidated: (r, c) => validatedRef.current.has(`${r},${c}`),
    isInputLocked: () => validation.pending,
  });
  return (
    <div>
      {renderCells(nav, validation.validated)}
      <div
        data-testid="status"
        data-validated={validation.validated.size}
        data-pending={String(validation.pending)}
      />
    </div>
  );
}

// Standalone harness pinning the useGridNavigation guard contract independently of validation.
let externalLocked = false;
function LockHarness({ onCellChange }: { onCellChange?: (r: number, c: number, l: string | null) => void }) {
  const nav = useGridNavigation(PUZZLE, {
    onCellChange,
    isInputLocked: () => externalLocked,
  });
  return <div>{renderCells(nav, new Set())}</div>;
}

function makeDeferredSolver(): { solver: PuzzleSolver; resolve: (r: ValidationResult) => void } {
  let resolve!: (r: ValidationResult) => void;
  const solver: PuzzleSolver = {
    validate: vi.fn(() => new Promise<ValidationResult>((res) => { resolve = res; })),
    requestHint: vi.fn().mockRejectedValue(new Error('unused')),
    verify: vi.fn().mockRejectedValue(new Error('unused')),
  };
  return { solver, resolve: (r) => resolve(r) };
}

describe('grid input lock — race on the last letter', () => {
  beforeEach(() => { externalLocked = false; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('ignores a late keystroke after the grid validates and applies the winning verdict', async () => {
    const { solver, resolve } = makeDeferredSolver();
    const { container } = render(<ValidationHarness solver={solver} />);
    const c1 = inputAt(container, 0, 1)!;
    const c2 = inputAt(container, 0, 2)!;
    const c3 = inputAt(container, 0, 3)!;
    const status = container.querySelector('[data-testid="status"]')!;

    click(c1);
    typeChar(c1, 'a'); // advances to c2
    typeChar(c2, 'b'); // advances to c3
    await act(async () => {
      typeChar(c3, 'c'); // last cell filled → whole-grid validate fires
      await Promise.resolve();
    });

    expect(solver.validate).toHaveBeenCalledTimes(1);
    expect(status.getAttribute('data-pending')).toBe('true');
    expect(c3.value).toBe('C');

    // Extra input caught during the in-flight validation window — must be dropped.
    await act(async () => {
      typeChar(c3, 'z');
      await Promise.resolve();
    });
    expect(c3.value).toBe('C'); // the last valid letter, not the stray 'Z'
    expect(solver.validate).toHaveBeenCalledTimes(1); // no second POST, so the seq guard can't drop the win

    // The original winning verdict resolves and locks the grid.
    await act(async () => {
      resolve({ solved: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(status.getAttribute('data-validated')).toBe('3');
  });

  it('re-enables input once a non-solved verdict returns so the player can fix the grid', async () => {
    const { solver, resolve } = makeDeferredSolver();
    const { container } = render(<ValidationHarness solver={solver} />);
    const c1 = inputAt(container, 0, 1)!;
    const c2 = inputAt(container, 0, 2)!;
    const c3 = inputAt(container, 0, 3)!;

    click(c1);
    typeChar(c1, 'a');
    typeChar(c2, 'b');
    await act(async () => {
      typeChar(c3, 'x');
      await Promise.resolve();
    });
    await act(async () => {
      resolve({ solved: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Grid unlocked again — a correction lands.
    click(c3);
    typeChar(c3, 'c');
    expect(c3.value).toBe('C');
  });
});

// Mirrors PlayScreen's requestHint/requestVerify, both gated on validation.pending.
function AssistHarness({
  solver,
  onHintRequest,
  onVerifyRequest,
}: {
  solver: PuzzleSolver;
  onHintRequest: () => void;
  onVerifyRequest: () => void;
}) {
  const validation = usePuzzleValidation(PUZZLE, solver);
  const nav = useGridNavigation(PUZZLE, {
    onCellChange: () => validation.onGridChanged(),
    isInputLocked: () => validation.pending,
  });
  const requestHint = () => { if (!validation.pending) onHintRequest(); };
  const requestVerify = () => { if (!validation.pending) onVerifyRequest(); };
  return (
    <div>
      {renderCells(nav, validation.validated)}
      <button data-testid="hint-btn" type="button" onClick={requestHint}>hint</button>
      <button data-testid="verify-btn" type="button" onClick={requestVerify}>verify</button>
    </div>
  );
}

describe('assist-request gating — hint/verify skip while a whole-grid verdict is pending', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('drops hint and verify requests fired during the in-flight validation window', async () => {
    const { solver } = makeDeferredSolver();
    const onHintRequest = vi.fn();
    const onVerifyRequest = vi.fn();
    const { container } = render(
      <AssistHarness solver={solver} onHintRequest={onHintRequest} onVerifyRequest={onVerifyRequest} />,
    );
    const c1 = inputAt(container, 0, 1)!;
    const c2 = inputAt(container, 0, 2)!;
    const c3 = inputAt(container, 0, 3)!;

    click(c1);
    typeChar(c1, 'a');
    typeChar(c2, 'b');
    await act(async () => {
      typeChar(c3, 'c'); // last cell filled → whole-grid validate fires, pending=true
      await Promise.resolve();
    });
    expect(solver.validate).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('[data-testid="hint-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="verify-btn"]')!);
    expect(onHintRequest).not.toHaveBeenCalled();
    expect(onVerifyRequest).not.toHaveBeenCalled();
  });
});

describe('useGridNavigation — isInputLocked guard', () => {
  beforeEach(() => { externalLocked = false; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('blocks physical-keyboard letter entry while locked', () => {
    const onCellChange = vi.fn();
    const { container } = render(<LockHarness onCellChange={onCellChange} />);
    const c1 = inputAt(container, 0, 1)!;
    click(c1);
    typeChar(c1, 'a');
    expect(c1.value).toBe('A');
    click(c1);
    onCellChange.mockClear();
    externalLocked = true;
    typeChar(c1, 'b');
    expect(c1.value).toBe('A');
    expect(onCellChange).not.toHaveBeenCalled();
  });

  it('blocks Backspace while locked', () => {
    const onCellChange = vi.fn();
    const { container } = render(<LockHarness onCellChange={onCellChange} />);
    const c1 = inputAt(container, 0, 1)!;
    click(c1);
    typeChar(c1, 'a');
    click(c1);
    onCellChange.mockClear();
    externalLocked = true;
    fireEvent.keyDown(c1, { key: 'Backspace' });
    expect(c1.value).toBe('A');
    expect(onCellChange).not.toHaveBeenCalled();
  });

  it('reverts an IME insert that the browser already wrote while locked', () => {
    const onCellChange = vi.fn();
    const { container } = render(<LockHarness onCellChange={onCellChange} />);
    const c1 = inputAt(container, 0, 1)!;
    click(c1);
    typeChar(c1, 'a');
    click(c1);
    onCellChange.mockClear();
    externalLocked = true;
    // Android IME: the browser writes the raw glyph before onInput fires.
    c1.value = 'Ab';
    c1.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'b', bubbles: true }));
    expect(c1.value).toBe('A');
    expect(onCellChange).not.toHaveBeenCalled();
  });

  it('reverts a mobile deleteContentBackward while locked', () => {
    const onCellChange = vi.fn();
    const { container } = render(<LockHarness onCellChange={onCellChange} />);
    const c1 = inputAt(container, 0, 1)!;
    click(c1);
    typeChar(c1, 'a');
    click(c1);
    onCellChange.mockClear();
    externalLocked = true;
    // Mobile erase: the browser clears the DOM before onInput fires.
    c1.value = '';
    c1.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', data: null, bubbles: true }));
    expect(c1.value).toBe('A');
    expect(onCellChange).not.toHaveBeenCalled();
  });
});
