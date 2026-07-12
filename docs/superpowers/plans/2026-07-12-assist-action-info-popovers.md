# Assist-action info popups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give players an on-demand, discoverable explanation of the assist action (Vérifier / Hint) via a hover-and-longpress info popup, and stop the `/aide` page + onboarding Tour from carrying stale, drifting feature descriptions.

**Architecture:** A reusable `InfoPopover` primitive wraps the existing assist button and shows a short description on hover/focus (fine pointer) or long-press (touch, via a new `useLongPress` hook that also suppresses the tap so the action doesn't fire). Static, feature-agnostic help copy on `/aide` and in the Tour is genericised so it can't drift, and the Tour's assist step is re-anchored to a stable `data-tour="assist"` hook instead of the now-wrong "Indice (" aria-label selector.

**Tech Stack:** React 19 + TypeScript, Ark UI (`@ark-ui/react` ^5.37) Tooltip, Panda CSS (`styled-system/css`), Vitest + Testing Library, i18n via the repo's `t()` catalog.

## Global Constraints

- Frontend only, `frontend/` bounded context, `ui/` layer. No schema, no backend.
- **No new dependency** — Ark UI Tooltip is already used (`src/ui/components/sondage/StyleTooltip.tsx`). No ADR required.
- All user-facing strings go through the i18n catalog `src/ui/i18n/messages.fr.ts`; call sites use `t('key')`. `MessageKey` is a compile-time union — a typo'd key fails `tsc`. **Do not rename or delete existing keys** (only change their values); renames break call sites elsewhere.
- Dev-mode `t()` throws on any unresolved `{{placeholder}}` — the new strings use no interpolation, keep it that way.
- No `console.log`. Comments: at most one line, only for a non-obvious *why*.
- Accessibility is a requirement (ADR-0050, WCAG AA): the popup is dismissible (Esc / tap-outside) and persistent; the button keeps its existing accessible name.
- Commands run from `frontend/`. Verification gate: `pnpm typecheck && pnpm test && pnpm lint`.
- PR: one workstream, `feat(frontend-grid):` scope, under the 400-line diff cap.

## File structure

- `src/ui/components/primitives/useLongPress.ts` — **new.** Pointer long-press detection + tap-suppression flag. Pure hook, no JSX. Owns the only genuinely new logic.
- `src/ui/components/primitives/InfoPopover.tsx` — **new.** Ark Tooltip wrapper around an existing trigger button; branches hover-vs-longpress on `useTouchPrimary()`.
- `src/ui/play/PlayScreen.tsx` — **modify.** Wrap the Vérifier and Hint buttons in `InfoPopover`; add `data-tour="assist"` to each.
- `src/ui/components/tour/soloTourSteps.ts` — **modify.** Replace the broken `HINT_BUTTON_SELECTOR` with a stable `ASSIST_BUTTON_SELECTOR = '[data-tour="assist"]'`; rename the exported selector key.
- `src/ui/i18n/messages.fr.ts` — **modify.** Add `play.verify.info` + `play.hint.info` (specific, in-context). Genericise `v2.aide.validation.*`, `tour.hints.body`, `tour.validation.title`, `tour.validation.body`.
- `tests/primitives/use-long-press.test.tsx` — **new.**
- `tests/primitives/info-popover.test.tsx` — **new.**

`src/ui/v2/AideScreen.tsx` needs **no** code change — it already renders `t('v2.aide.validation.heading')` / `.body`; only the string values change.

---

### Task 1: `useLongPress` hook

**Files:**
- Create: `src/ui/components/primitives/useLongPress.ts`
- Test: `tests/primitives/use-long-press.test.tsx`

**Interfaces:**
- Consumes: nothing (pure React).
- Produces:
  - `useLongPress(options: UseLongPressOptions): UseLongPressResult`
  - `UseLongPressOptions = { onLongPress: () => void; enabled: boolean; delayMs?: number; moveThresholdPx?: number }`
  - `UseLongPressResult = { handlers: LongPressHandlers; consumeSuppression: () => boolean }`
  - `LongPressHandlers = { onPointerDown; onPointerMove; onPointerUp; onPointerCancel; onPointerLeave }` (React pointer-event handlers)
  - `consumeSuppression()` returns `true` exactly once after a long-press fired, then resets to `false`.

- [ ] **Step 1: Write the failing test**

Create `tests/primitives/use-long-press.test.tsx`:

```tsx
import type { PointerEvent as ReactPointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLongPress } from '@/ui/components/primitives/useLongPress';

const evt = (x = 0, y = 0) => ({ clientX: x, clientY: y }) as ReactPointerEvent;

describe('useLongPress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onLongPress after the delay and suppresses the next click once', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: true, delayMs: 500 }),
    );
    act(() => result.current.handlers.onPointerDown(evt()));
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(result.current.consumeSuppression()).toBe(true);
    expect(result.current.consumeSuppression()).toBe(false);
  });

  it('does not fire on a short press and does not suppress the click', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: true, delayMs: 500 }),
    );
    act(() => result.current.handlers.onPointerDown(evt()));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.handlers.onPointerUp());
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumeSuppression()).toBe(false);
  });

  it('cancels when the pointer moves beyond the threshold', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: true, delayMs: 500, moveThresholdPx: 10 }),
    );
    act(() => result.current.handlers.onPointerDown(evt(0, 0)));
    act(() => result.current.handlers.onPointerMove(evt(20, 0)));
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('is inert when disabled', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, enabled: false, delayMs: 500 }),
    );
    act(() => result.current.handlers.onPointerDown(evt()));
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- use-long-press`
Expected: FAIL — `useLongPress` is not exported / module not found.

- [ ] **Step 3: Write the hook**

Create `src/ui/components/primitives/useLongPress.ts`:

```ts
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useRef } from 'react';

export interface UseLongPressOptions {
  readonly onLongPress: () => void;
  readonly enabled: boolean;
  readonly delayMs?: number;
  readonly moveThresholdPx?: number;
}

export interface LongPressHandlers {
  readonly onPointerDown: (e: ReactPointerEvent) => void;
  readonly onPointerMove: (e: ReactPointerEvent) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
  readonly onPointerLeave: () => void;
}

export interface UseLongPressResult {
  readonly handlers: LongPressHandlers;
  readonly consumeSuppression: () => boolean;
}

export function useLongPress({
  onLongPress,
  enabled,
  delayMs = 500,
  moveThresholdPx = 10,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const suppressRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      suppressRef.current = false; // each gesture starts clean
      originRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        suppressRef.current = true;
        onLongPress();
        clear();
      }, delayMs);
    },
    [enabled, delayMs, onLongPress, clear],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (dx * dx + dy * dy > moveThresholdPx * moveThresholdPx) clear();
    },
    [moveThresholdPx, clear],
  );

  const consumeSuppression = useCallback(() => {
    const suppressed = suppressRef.current;
    suppressRef.current = false;
    return suppressed;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
    },
    consumeSuppression,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- use-long-press`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/primitives/useLongPress.ts tests/primitives/use-long-press.test.tsx
git commit -s -m "feat(frontend-grid): add useLongPress hook with tap-suppression"
```

---

### Task 2: `InfoPopover` primitive

**Files:**
- Create: `src/ui/components/primitives/InfoPopover.tsx`
- Test: `tests/primitives/info-popover.test.tsx`

**Interfaces:**
- Consumes: `useLongPress` (Task 1); `useTouchPrimary` from `@/ui/components/keyboard/useTouchPrimary`; Ark `Tooltip`, `Portal`.
- Produces:
  - `InfoPopover(props: InfoPopoverProps): JSX.Element`
  - `InfoPopoverProps = { info: string; onActivate: () => void; children: ReactElement; longPressMs?: number }`
  - Contract: `children` is a single element that owns the visual/disabled/aria state but **must not** set its own `onClick` — `InfoPopover` supplies the click handler and calls `onActivate()` unless a long-press just fired.

- [ ] **Step 1: Write the failing test**

Create `tests/primitives/info-popover.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoPopover } from '@/ui/components/primitives/InfoPopover';

describe('InfoPopover', () => {
  it('runs onActivate when the trigger is clicked (fine pointer)', () => {
    const onActivate = vi.fn();
    render(
      <InfoPopover info="Explication" onActivate={onActivate}>
        <button type="button">Vérifier</button>
      </InfoPopover>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('reveals the info text on focus', async () => {
    render(
      <InfoPopover info="Vérifie tes lettres" onActivate={() => {}}>
        <button type="button">Vérifier</button>
      </InfoPopover>,
    );
    const trigger = screen.getByRole('button', { name: 'Vérifier' });
    act(() => {
      trigger.focus();
      fireEvent.pointerMove(trigger);
    });
    await waitFor(() =>
      expect(screen.getByText('Vérifie tes lettres')).toBeInTheDocument(),
    );
  });

  it('describes the trigger via aria-describedby once open', async () => {
    render(
      <InfoPopover info="Vérifie tes lettres" onActivate={() => {}}>
        <button type="button">Vérifier</button>
      </InfoPopover>,
    );
    const trigger = screen.getByRole('button', { name: 'Vérifier' });
    act(() => {
      trigger.focus();
      fireEvent.pointerMove(trigger);
    });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-describedby'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- info-popover`
Expected: FAIL — `InfoPopover` not found.

- [ ] **Step 3: Write the component**

Create `src/ui/components/primitives/InfoPopover.tsx`:

```tsx
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Tooltip } from '@ark-ui/react/tooltip';
import { Portal } from '@ark-ui/react/portal';
import { css } from 'styled-system/css';
import { useTouchPrimary } from '@/ui/components/keyboard/useTouchPrimary';
import { useLongPress } from './useLongPress';

const contentStyles = css({
  maxWidth: '260px',
  bg: 'neutral.900',
  color: 'neutral.50',
  borderRadius: 'md',
  padding: 'md',
  fontSize: 'sm',
  lineHeight: 1.5,
  boxShadow: 'floating',
  zIndex: 60,
  '&[hidden]': { display: 'none' },
});

const arrowStyles = css({
  '--arrow-size': '8px',
  '--arrow-background': 'token(colors.neutral.900)',
});

export interface InfoPopoverProps {
  readonly info: string;
  readonly onActivate: () => void;
  readonly children: ReactElement;
  readonly longPressMs?: number;
}

export function InfoPopover({ info, onActivate, children, longPressMs = 500 }: InfoPopoverProps) {
  const touch = useTouchPrimary();
  const [open, setOpen] = useState(false);
  const longPress = useLongPress({
    onLongPress: () => setOpen(true),
    enabled: touch,
    delayMs: longPressMs,
  });

  const handleClick = () => {
    if (longPress.consumeSuppression()) return;
    onActivate();
  };

  // Touch: drive open only from long-press; honor Ark's close requests but
  // ignore its interaction-driven opens so a plain tap runs the action.
  const rootProps = touch
    ? {
        open,
        onOpenChange: (details: { open: boolean }) => {
          if (!details.open) setOpen(false);
        },
      }
    : { openDelay: 400, closeDelay: 100 };

  return (
    <Tooltip.Root {...rootProps}>
      <Tooltip.Trigger asChild onClick={handleClick} {...(touch ? longPress.handlers : {})}>
        {children}
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content className={contentStyles}>
            <Tooltip.Arrow className={arrowStyles}>
              <Tooltip.ArrowTip />
            </Tooltip.Arrow>
            {info}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- info-popover`
Expected: PASS (3 tests).

**Fallback if the click test fails** (Ark did not forward `onClick` through `asChild`): inject the handler onto the child instead of onto `Tooltip.Trigger`. Add `import { cloneElement } from 'react';`, build `const trigger = cloneElement(children, { onClick: handleClick, ...(touch ? longPress.handlers : {}) });`, and render `<Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>`. Re-run.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/primitives/InfoPopover.tsx tests/primitives/info-popover.test.tsx
git commit -s -m "feat(frontend-grid): add InfoPopover primitive (hover + longpress)"
```

---

### Task 3: Wire InfoPopover into the assist buttons + info copy + tour hook

**Files:**
- Modify: `src/ui/play/PlayScreen.tsx:562-607` (the `trailing` slot)
- Modify: `src/ui/i18n/messages.fr.ts` (add two keys after `play.verify.label`)

**Interfaces:**
- Consumes: `InfoPopover` (Task 2); existing `requestVerify`, `requestHint`, `verification`, `hint`, `assistGate`, `t`.
- Produces: assist buttons carry `data-tour="assist"` (consumed by Task 4's tour selector).

- [ ] **Step 1: Add the info strings**

In `src/ui/i18n/messages.fr.ts`, immediately after the `'play.verify.label': 'Vérifier',` line, add:

```ts
  'play.verify.info':
    'Vérifie les lettres que tu as saisies : les bonnes se verrouillent, les autres sont signalées. Disponible toutes les 30 minutes.',
  'play.hint.info':
    'Révèle une lettre de la case active. Un nouvel indice toutes les 10 minutes.',
```

- [ ] **Step 2: Import InfoPopover in PlayScreen**

In `src/ui/play/PlayScreen.tsx`, add near the other primitive imports:

```ts
import { InfoPopover } from '@/ui/components/primitives/InfoPopover';
```

- [ ] **Step 3: Wrap the Vérifier button**

Replace the Vérifier `<button>…</button>` block (currently `PlayScreen.tsx:565-574`) with:

```tsx
<InfoPopover info={t('play.verify.info')} onActivate={requestVerify}>
  <button
    type="button"
    className={hintBtn}
    data-tour="assist"
    disabled={verification.pending || (verification.secondsUntilNextVerify ?? 0) > 0}
    {...(assistGate ?? {})}
  >
    <MagnifyingGlass aria-hidden="true" weight="bold" className={hintBulb} />
    {t('play.verify.label')}
  </button>
</InfoPopover>
```

(Note: the `onClick={requestVerify}` prop is removed from the button — `InfoPopover`'s `onActivate` now owns it.)

- [ ] **Step 4: Wrap the Hint button**

Replace the Hint `<button>…</button>` block (currently `PlayScreen.tsx:587-596`) with:

```tsx
<InfoPopover info={t('play.hint.info')} onActivate={requestHint}>
  <button
    type="button"
    className={hintBtn}
    data-tour="assist"
    disabled={hint.pending || (hint.exhausted && (hint.secondsUntilNextHint ?? 0) > 0)}
    aria-label={t('play.hint.aria.remaining', { remaining: hint.hintsRemaining })}
  >
    <Lightbulb aria-hidden="true" weight="fill" className={hintBulb} />
    {t('play.hint.label', { remaining: hint.hintsRemaining })}
  </button>
</InfoPopover>
```

(Note: `onClick={requestHint}` removed from the button.)

- [ ] **Step 5: Verify typecheck + existing tests**

Run: `pnpm typecheck`
Expected: PASS (new `play.verify.info` / `play.hint.info` keys resolve; `InfoPopover` types line up).

Run: `pnpm test`
Expected: PASS — no existing test asserts an `onClick` on these buttons; behavior is preserved through `onActivate`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/play/PlayScreen.tsx src/ui/i18n/messages.fr.ts
git commit -s -m "feat(frontend-grid): explain the assist action with an InfoPopover"
```

---

### Task 4: Genericise stale help copy + re-anchor the tour assist step

**Files:**
- Modify: `src/ui/components/tour/soloTourSteps.ts:20,78,123`
- Modify: `src/ui/i18n/messages.fr.ts` (change values of `v2.aide.validation.heading`, `v2.aide.validation.body`, `tour.hints.body`, `tour.validation.title`, `tour.validation.body`)

**Interfaces:**
- Consumes: the `data-tour="assist"` attribute from Task 3.
- Produces: nothing downstream.

- [ ] **Step 1: Re-anchor the tour assist step**

In `src/ui/components/tour/soloTourSteps.ts`:

Replace line 20:

```ts
const HINT_BUTTON_SELECTOR = '[aria-label^="Indice ("]';
```

with:

```ts
const ASSIST_BUTTON_SELECTOR = '[data-tour="assist"]';
```

In the `hints` step (line 78), replace `target: () => queryFirst(HINT_BUTTON_SELECTOR),` with:

```ts
      target: () => queryFirst(ASSIST_BUTTON_SELECTOR),
```

In the `TOUR_TARGET_SELECTORS` export (around line 123), replace `hintButton: HINT_BUTTON_SELECTOR,` with:

```ts
  assistButton: ASSIST_BUTTON_SELECTOR,
```

- [ ] **Step 2: Genericise the copy**

In `src/ui/i18n/messages.fr.ts`, change these five **values** (keep the keys):

```ts
  'v2.aide.validation.heading': "Coup de pouce",
  'v2.aide.validation.body': "Si tu bloques sur un mot, un bouton d’aide dans le bandeau te donne un coup de main. Il se recharge après chaque utilisation, alors garde-le pour les moments où tu en as vraiment besoin.",
```

```ts
  'tour.hints.body':
    "Bloqué·e sur un mot ? Le bouton d’aide dans le bandeau te donne un coup de main. Il se recharge après chaque utilisation.",
```

```ts
  'tour.validation.title': 'Aperçu de la grille',
  'tour.validation.body':
    "L’aperçu de la grille suit ton avancée et met en évidence les cases déjà remplies.",
```

- [ ] **Step 3: Verify typecheck + tour + tooltip tests**

Run: `pnpm typecheck`
Expected: PASS — `TOUR_TARGET_SELECTORS` is only re-exported (`src/ui/components/tour/index.ts`), no `.hintButton` consumer exists, so the key rename is safe.

Run: `pnpm test -- use-solo-tour sondage-style-tooltip`
Expected: PASS — the tour hook test asserts open/seen behavior, not step targets; no test reads the removed strings verbatim.

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/tour/soloTourSteps.ts src/ui/i18n/messages.fr.ts
git commit -s -m "fix(frontend-grid): genericise assist help copy and re-anchor tour step"
```

---

### Task 5: Full-suite verification + manual drive

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all PASS. If `eslint-plugin-boundaries` flags `primitives` importing `components/keyboard/useTouchPrimary`, note it — both are `ui`-layer components and the import mirrors existing cross-component usage; adjust the import path only if the rule genuinely forbids it.

- [ ] **Step 2: Accessibility check**

Run: `pnpm a11y`
Expected: PASS (no new axe violations on the play route).

- [ ] **Step 3: Manual drive (use the `verify` skill or `pnpm dev`)**

Confirm on the solo play screen:
1. Desktop: hovering **Vérifier** shows the description after ~400 ms; Esc / mouse-leave dismisses; clicking still runs verification.
2. Touch emulation (DevTools coarse pointer): long-pressing **Vérifier** shows the description and does **not** run verification; a normal tap runs verification with no popup; tap-outside dismisses.
3. `/aide` "Coup de pouce" section reads generically (no "vérifiée d'un coup", no "révèle le mot entier").
4. Onboarding tour (`?tour=1`) assist step spotlights the real Vérifier button, not empty space.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/assist-action-info-popovers
```

Open the PR with body naming the workstream (assist-action info popups + honest help copy), bounded context `frontend` / layer `ui`, no schema shipped, and the manual-drive results.

---

## Self-Review

**Spec coverage:**
- InfoPopover primitive over Ark Tooltip → Task 2. ✓
- Hover (desktop) + longpress (touch) with click-suppression → Task 1 (`useLongPress`) + Task 2 (branch on `useTouchPrimary`). ✓
- Vérifier + Hint both wrapped → Task 3. ✓
- Static description copy in i18n → Task 3. ✓
- `aria-describedby` / WCAG 1.4.13 dismissible-persistent → Task 2 (Ark wiring + `onOpenChange`), asserted in Task 2 Step 1. ✓
- Generic, non-drifting `/aide` + Tour copy (user override of the earlier "verify-specific" wording) → Task 4. ✓
- Tour assist step re-anchored (the broken `Indice (` selector) → Task 4 + `data-tour` hook in Task 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `consumeSuppression` / `handlers` / `onActivate` / `info` names are identical across Tasks 1–3. `ASSIST_BUTTON_SELECTOR` / `assistButton` consistent within Task 4. `data-tour="assist"` string identical in Task 3 (both buttons) and Task 4's selector. ✓

## Notes / known limitations (out of scope, do not implement)

- **Disabled-button popover:** while the assist button is disabled (during cooldown), a native `disabled` button suppresses hover/pointer events, so the popover won't open in that window — the `AssistCooldown` ring already communicates the live state there. Converting to an `aria-disabled` pattern to keep the popover reachable during cooldown is a deliberate follow-up, not part of this cut.
- The in-context popover copy (`play.verify.info`) is intentionally specific (it lives on the button and can't drift); only the static `/aide` + Tour surfaces are genericised.
