# Grid Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play two soft, synthesized reward cues on the grid — one when a word validates, one when the puzzle is solved — on by default and muteable from a Réglages toggle.

**Architecture:** Hexagonal, mirroring the ADR-0088 theme-preference pattern. A `SoundStore` port (preference, localStorage adapter) and a `SoundPlayer` port (Web Audio adapter) are composed in `main.tsx` and injected through TanStack Router context (ADR-0002 §7). A pure `useGridSounds` hook watches `PlayScreen`'s validated-count and won flag and calls the player, gated by the existing `userActedRef` so reopening a solved grid is silent. Réglages gets an Ark UI `Switch` wired to the store.

**Tech Stack:** React 19, TypeScript, TanStack Router, Panda CSS, `@ark-ui/react/switch`, `@phosphor-icons/react`, Web Audio API, Vitest + Testing Library.

## Global Constraints

- No new dependency — Ark UI (`@ark-ui/react ^5.37.2`) and the Web Audio API are already in scope.
- No schema change, no ADR (reuses ADR-0088 store pattern + ADR-0002 §7 router-context injection).
- Layer boundaries (`eslint-plugin-boundaries`): `domain` → nothing; `application` = ports only; `infrastructure` implements ports (may import `application` types); `ui` imports `application` types + reads router context, never `infrastructure`.
- French copy uses **tutoiement**.
- Accessibility is a requirement (WCAG AA, ADR-0050): the toggle is keyboard-operable with an accessible name; the Réglages screen stays axe-clean.
- No `console.log`. Comments: at most one line, only for non-obvious *why*.
- Preference default is **enabled (sounds on)**. localStorage key: `bliss.sound` (matches the `bliss.theme` convention; supersedes the spec's illustrative `ws:sound`), stored as `'on'` / `'off'`.
- Sounds fire only on positive events (word-validated, puzzle-solved), never on errors or keystrokes.
- Run frontend commands from `frontend/`. Verify with `pnpm test`, `pnpm typecheck`.

---

## File Structure

- Create `frontend/src/application/session/SoundStore.ts` — preference port (interface).
- Create `frontend/src/application/session/SoundPlayer.ts` — cue-player port (interface).
- Create `frontend/src/infrastructure/session/localStorageSound.ts` — localStorage adapter (free functions).
- Create `frontend/src/infrastructure/session/webAudioSoundPlayer.ts` — Web Audio adapter (factory).
- Create `frontend/src/ui/play/useGridSounds.ts` — trigger hook (pure logic).
- Modify `frontend/src/ui/routes/__root.tsx` — add `soundStore?` + `soundPlayer?` to `AppRouterContext`.
- Modify `frontend/src/ui/play/PlayScreen.tsx` — accept optional `soundPlayer`, call `useGridSounds`.
- Modify `frontend/src/ui/routes/play.tsx` — bridge `soundPlayer` from context to `PlayScreen`.
- Modify `frontend/src/ui/v2/ReglagesScreen.tsx` — add the "Son" toggle group.
- Modify `frontend/src/main.tsx` — instantiate the adapters, add to `baseContext`.
- Create `frontend/tests/localStorageSound.test.ts`, `frontend/tests/webAudioSoundPlayer.test.ts`, `frontend/tests/useGridSounds.test.tsx`.
- Modify `frontend/tests/v2-reglages.test.tsx` — cover the new toggle.

---

## Task 1: SoundStore port + localStorage adapter

**Files:**
- Create: `frontend/src/application/session/SoundStore.ts`
- Create: `frontend/src/infrastructure/session/localStorageSound.ts`
- Modify: `frontend/src/ui/routes/__root.tsx` (add `soundStore?` field, ~after line 55)
- Test: `frontend/tests/localStorageSound.test.ts`

**Interfaces:**
- Produces:
  - `interface SoundStore { load(): boolean; set(enabled: boolean): void }` at `@/application/session/SoundStore`.
  - `loadSoundEnabled(): boolean` and `saveSoundEnabled(enabled: boolean): void` at `@/infrastructure/session/localStorageSound`.
  - New optional router-context field `readonly soundStore?: SoundStore`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/localStorageSound.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSoundEnabled, saveSoundEnabled } from '@/infrastructure/session/localStorageSound';

describe('localStorageSound', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to enabled when nothing is stored', () => {
    expect(loadSoundEnabled()).toBe(true);
  });

  it('round-trips a disabled preference', () => {
    saveSoundEnabled(false);
    expect(loadSoundEnabled()).toBe(false);
  });

  it('round-trips a re-enabled preference', () => {
    saveSoundEnabled(false);
    saveSoundEnabled(true);
    expect(loadSoundEnabled()).toBe(true);
  });

  it('treats any non-"off" stored value as enabled', () => {
    localStorage.setItem('bliss.sound', 'garbage');
    expect(loadSoundEnabled()).toBe(true);
  });

  it('degrades to enabled when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSoundEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/localStorageSound.test.ts`
Expected: FAIL — cannot resolve `@/infrastructure/session/localStorageSound`.

- [ ] **Step 3: Create the port interface**

`frontend/src/application/session/SoundStore.ts`:

```ts
// Sound-effects preference port; adapter in @/infrastructure/session, consumed via router context (ADR-0002 §7).

export interface SoundStore {
  /** Current persisted preference (default `true` — sounds on). */
  load(): boolean;
  /** Persist the preference. */
  set(enabled: boolean): void;
}
```

- [ ] **Step 4: Write the localStorage adapter**

`frontend/src/infrastructure/session/localStorageSound.ts`:

```ts
// Grid sound-effects preference. Storage failures degrade to the default (on), never throw.

const KEY = 'bliss.sound';

export function loadSoundEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // best-effort persistence
  }
}
```

- [ ] **Step 5: Add the router-context field**

In `frontend/src/ui/routes/__root.tsx`, add the type import near the other `@/application/session` imports (by line 14):

```ts
import type { SoundStore } from '@/application/session/SoundStore';
```

And inside `interface AppRouterContext`, directly after the `themeStore?` field (line 55):

```ts
  // Grid sound-effects preference port; optional so route-level Vitest fixtures can omit it.
  readonly soundStore?: SoundStore;
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd frontend && pnpm vitest run tests/localStorageSound.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/application/session/SoundStore.ts frontend/src/infrastructure/session/localStorageSound.ts frontend/src/ui/routes/__root.tsx frontend/tests/localStorageSound.test.ts
git commit -s -m "feat(frontend): sound preference port + localStorage adapter"
```

---

## Task 2: SoundPlayer port + Web Audio adapter

**Files:**
- Create: `frontend/src/application/session/SoundPlayer.ts`
- Create: `frontend/src/infrastructure/session/webAudioSoundPlayer.ts`
- Modify: `frontend/src/ui/routes/__root.tsx` (add `soundPlayer?` field)
- Test: `frontend/tests/webAudioSoundPlayer.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `interface SoundPlayer { playWordValidated(): void; playPuzzleSolved(): void }` at `@/application/session/SoundPlayer`.
  - `createWebAudioSoundPlayer(isEnabled: () => boolean): SoundPlayer` at `@/infrastructure/session/webAudioSoundPlayer`.
  - New optional router-context field `readonly soundPlayer?: SoundPlayer`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/webAudioSoundPlayer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebAudioSoundPlayer } from '@/infrastructure/session/webAudioSoundPlayer';

class FakeParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class FakeOsc {
  frequency = new FakeParam();
  type = '';
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
}
class FakeCtx {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = vi.fn(() => new FakeOsc());
  createGain = vi.fn(() => new FakeGain());
  resume = vi.fn();
}

const original = globalThis.AudioContext;

afterEach(() => {
  // @ts-expect-error test cleanup
  globalThis.AudioContext = original;
  vi.restoreAllMocks();
});

function installFakeCtx(): FakeCtx {
  const ctx = new FakeCtx();
  // @ts-expect-error inject a fake AudioContext constructor
  globalThis.AudioContext = vi.fn(() => ctx);
  return ctx;
}

describe('webAudioSoundPlayer', () => {
  it('plays nothing while muted', () => {
    const ctx = installFakeCtx();
    const player = createWebAudioSoundPlayer(() => false);
    player.playWordValidated();
    player.playPuzzleSolved();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('emits a two-note chime for a validated word', () => {
    const ctx = installFakeCtx();
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('emits a three-note arpeggio for a solved puzzle', () => {
    const ctx = installFakeCtx();
    const player = createWebAudioSoundPlayer(() => true);
    player.playPuzzleSolved();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('reuses a single AudioContext across plays', () => {
    installFakeCtx();
    const player = createWebAudioSoundPlayer(() => true);
    player.playWordValidated();
    player.playPuzzleSolved();
    expect(globalThis.AudioContext).toHaveBeenCalledTimes(1);
  });

  it('does not throw when AudioContext is unavailable', () => {
    // @ts-expect-error simulate an environment without Web Audio
    globalThis.AudioContext = undefined;
    const player = createWebAudioSoundPlayer(() => true);
    expect(() => player.playWordValidated()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/webAudioSoundPlayer.test.ts`
Expected: FAIL — cannot resolve `@/infrastructure/session/webAudioSoundPlayer`.

- [ ] **Step 3: Create the port interface**

`frontend/src/application/session/SoundPlayer.ts`:

```ts
// Grid sound-effects player port; Web Audio adapter in @/infrastructure/session, injected via router context (ADR-0002 §7).

export interface SoundPlayer {
  /** Soft two-note chime when a word validates. No-op when muted or unsupported. */
  playWordValidated(): void;
  /** Gentle three-note arpeggio when the puzzle is solved. No-op when muted or unsupported. */
  playPuzzleSolved(): void;
}
```

- [ ] **Step 4: Write the Web Audio adapter**

`frontend/src/infrastructure/session/webAudioSoundPlayer.ts`:

```ts
import type { SoundPlayer } from '@/application/session/SoundPlayer';

interface Note {
  readonly freq: number;
  readonly start: number;
  readonly dur: number;
}

// D5 → A5 (a perfect fifth up): a small, consonant "click into place".
const WORD_NOTES: readonly Note[] = [
  { freq: 587.33, start: 0, dur: 0.12 },
  { freq: 880.0, start: 0.06, dur: 0.14 },
];

// D5 → F#5 → A5 (an ascending major triad): a warm "done" without fanfare.
const WIN_NOTES: readonly Note[] = [
  { freq: 587.33, start: 0, dur: 0.18 },
  { freq: 739.99, start: 0.12, dur: 0.18 },
  { freq: 880.0, start: 0.24, dur: 0.3 },
];

const PEAK_GAIN = 0.15;

type AudioContextCtor = new () => AudioContext;

export function createWebAudioSoundPlayer(isEnabled: () => boolean): SoundPlayer {
  let ctx: AudioContext | null = null;

  function context(): AudioContext | null {
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  }

  function play(notes: readonly Note[]): void {
    if (!isEnabled()) return;
    try {
      const ac = context();
      if (!ac) return;
      // The gesture that produced this cue also unblocks a suspended context.
      if (ac.state === 'suspended') void ac.resume();
      const now = ac.currentTime;
      for (const n of notes) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      }
    } catch {
      // Audio is decorative; never let a synthesis failure surface.
    }
  }

  return {
    playWordValidated: () => play(WORD_NOTES),
    playPuzzleSolved: () => play(WIN_NOTES),
  };
}
```

- [ ] **Step 5: Add the router-context field**

In `frontend/src/ui/routes/__root.tsx`, add the type import near the Task 1 `SoundStore` import:

```ts
import type { SoundPlayer } from '@/application/session/SoundPlayer';
```

And inside `interface AppRouterContext`, directly after the `soundStore?` field added in Task 1:

```ts
  // Grid sound-effects player port; optional so route-level Vitest fixtures can omit it.
  readonly soundPlayer?: SoundPlayer;
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd frontend && pnpm vitest run tests/webAudioSoundPlayer.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/application/session/SoundPlayer.ts frontend/src/infrastructure/session/webAudioSoundPlayer.ts frontend/src/ui/routes/__root.tsx frontend/tests/webAudioSoundPlayer.test.ts
git commit -s -m "feat(frontend): Web Audio sound-player port + adapter"
```

---

## Task 3: useGridSounds trigger hook

**Files:**
- Create: `frontend/src/ui/play/useGridSounds.ts`
- Test: `frontend/tests/useGridSounds.test.tsx`

**Interfaces:**
- Consumes: `SoundPlayer` from `@/application/session/SoundPlayer` (Task 2).
- Produces: `useGridSounds(args: UseGridSoundsArgs): void` where
  ```ts
  interface UseGridSoundsArgs {
    readonly validatedCount: number;
    readonly won: boolean;
    readonly userActedRef: { readonly current: boolean };
    readonly soundPlayer?: SoundPlayer;
  }
  ```

- [ ] **Step 1: Write the failing test**

`frontend/tests/useGridSounds.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGridSounds } from '@/ui/play/useGridSounds';

function makePlayer() {
  return { playWordValidated: vi.fn(), playPuzzleSolved: vi.fn() };
}

describe('useGridSounds', () => {
  it('stays silent when validated count grows before any user action', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: false };
    const { rerender } = renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 0, won: false, userActedRef, soundPlayer },
    });
    rerender({ validatedCount: 6, won: false, userActedRef, soundPlayer });
    expect(soundPlayer.playWordValidated).not.toHaveBeenCalled();
  });

  it('chimes once when a word validates after a user action', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: true };
    const { rerender } = renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 5, won: false, userActedRef, soundPlayer },
    });
    rerender({ validatedCount: 10, won: false, userActedRef, soundPlayer });
    expect(soundPlayer.playWordValidated).toHaveBeenCalledTimes(1);
  });

  it('plays the win cue (not the word chime) on the winning transition', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: true };
    const { rerender } = renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 15, won: false, userActedRef, soundPlayer },
    });
    rerender({ validatedCount: 20, won: true, userActedRef, soundPlayer });
    expect(soundPlayer.playPuzzleSolved).toHaveBeenCalledTimes(1);
    expect(soundPlayer.playWordValidated).not.toHaveBeenCalled();
  });

  it('does not celebrate a grid that mounts already solved', () => {
    const soundPlayer = makePlayer();
    const userActedRef = { current: false };
    renderHook((props) => useGridSounds(props), {
      initialProps: { validatedCount: 20, won: true, userActedRef, soundPlayer },
    });
    expect(soundPlayer.playPuzzleSolved).not.toHaveBeenCalled();
  });

  it('never throws when no player is provided', () => {
    const userActedRef = { current: true };
    expect(() =>
      renderHook((props) => useGridSounds(props), {
        initialProps: { validatedCount: 0, won: false, userActedRef, soundPlayer: undefined },
      }).rerender({ validatedCount: 5, won: false, userActedRef, soundPlayer: undefined }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/useGridSounds.test.tsx`
Expected: FAIL — cannot resolve `@/ui/play/useGridSounds`.

- [ ] **Step 3: Write the hook**

`frontend/src/ui/play/useGridSounds.ts`:

```ts
import { useEffect, useRef } from 'react';
import type { SoundPlayer } from '@/application/session/SoundPlayer';

export interface UseGridSoundsArgs {
  readonly validatedCount: number;
  readonly won: boolean;
  // Reads the same interaction gate PlayScreen uses to suppress the mount-time win celebration.
  readonly userActedRef: { readonly current: boolean };
  readonly soundPlayer?: SoundPlayer;
}

export function useGridSounds({ validatedCount, won, userActedRef, soundPlayer }: UseGridSoundsArgs): void {
  const prevCount = useRef(validatedCount);
  const prevWon = useRef(won);
  useEffect(() => {
    const grew = validatedCount > prevCount.current;
    const justWon = won && !prevWon.current;
    prevCount.current = validatedCount;
    prevWon.current = won;
    if (!soundPlayer || !userActedRef.current) return;
    if (justWon) soundPlayer.playPuzzleSolved();
    else if (grew && !won) soundPlayer.playWordValidated();
  }, [validatedCount, won, soundPlayer, userActedRef]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/useGridSounds.test.tsx`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/play/useGridSounds.ts frontend/tests/useGridSounds.test.tsx
git commit -s -m "feat(frontend): useGridSounds trigger hook"
```

---

## Task 4: Wire sounds into PlayScreen + play route

**Files:**
- Modify: `frontend/src/ui/play/PlayScreen.tsx` (props ~line 152-158; hook call after `won`/`advance` at ~line 296-299)
- Modify: `frontend/src/ui/routes/play.tsx` (context read line 65; `PlayScreen` render line 67)

**Interfaces:**
- Consumes: `useGridSounds` (Task 3), `SoundPlayer` (Task 2), the existing `validatedPositions` set, `won` boolean, and `userActedRef` in `PlayScreen`.
- Produces: `PlayScreenProps` gains `readonly soundPlayer?: SoundPlayer`.

**Note on verification:** the trigger *logic* is fully unit-tested in Task 3. This task is thin prop-and-hook wiring; it is verified by typecheck, build, and the existing suite staying green, with behavioural confirmation deferred to the end-to-end browser verify step (per the repo's right-size-verification norm — a wide jsdom PlayScreen render that drives real grid input would mis-model the timing this doesn't have).

- [ ] **Step 1: Add the import in PlayScreen**

In `frontend/src/ui/play/PlayScreen.tsx`, add near the other `@/application` type imports at the top of the file:

```ts
import type { SoundPlayer } from '@/application/session/SoundPlayer';
import { useGridSounds } from './useGridSounds';
```

- [ ] **Step 2: Extend PlayScreenProps and the signature**

Change `PlayScreenProps` (currently lines 152-156) to:

```ts
export interface PlayScreenProps {
  readonly puzzle: Puzzle;
  readonly puzzleSolver: PuzzleSolver;
  readonly soloEntriesStore: SoloEntriesStore;
  readonly soundPlayer?: SoundPlayer;
}
```

Change the destructuring on line 158 to:

```ts
export function PlayScreen({ puzzle, puzzleSolver, soloEntriesStore, soundPlayer }: PlayScreenProps) {
```

- [ ] **Step 3: Call the hook**

In `PlayScreen`, immediately after the `advance` line (currently line 299):

```ts
  useGridSounds({ validatedCount: validatedPositions.size, won, userActedRef, soundPlayer });
```

- [ ] **Step 4: Bridge the context in the play route**

In `frontend/src/ui/routes/play.tsx`, change line 65 to also read `soundPlayer`:

```ts
  const { puzzleSolver, soloEntriesStore, soundPlayer } = Route.useRouteContext();
```

And the render on line 67 to forward it:

```ts
  return <PlayScreen puzzle={puzzle} puzzleSolver={puzzleSolver} soloEntriesStore={soloEntriesStore} soundPlayer={soundPlayer} />;
```

- [ ] **Step 5: Typecheck, build, run the suite**

Run: `cd frontend && pnpm typecheck && pnpm vitest run`
Expected: typecheck clean; all existing tests still pass (the play-route tests build context literals that omit `soundPlayer`, which is optional).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/play/PlayScreen.tsx frontend/src/ui/routes/play.tsx
git commit -s -m "feat(frontend): fire grid sounds from PlayScreen"
```

---

## Task 5: Réglages "Son" toggle

**Files:**
- Modify: `frontend/src/ui/v2/ReglagesScreen.tsx` (imports; new `SoundGroup` component mirroring `ThemeGroup`; render after `ThemeGroup`)
- Test: `frontend/tests/v2-reglages.test.tsx`

**Interfaces:**
- Consumes: `SoundStore` (Task 1) via router context (`useRouteContext({ from: '__root__' })`).
- Produces: a role=`switch` control named "Sons" that persists through `soundStore.set`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/tests/v2-reglages.test.tsx`. First extend the `renderReglages` helper to accept and inject a `soundStore` (add a third parameter and place it in `context`):

```tsx
import type { SoundStore } from '@/application/session/SoundStore';
```

Change the helper signature/context (around lines 30 and 63):

```tsx
function renderReglages(authClient: AuthClient, themeStore?: ThemeStore, soundStore?: SoundStore) {
```
```tsx
      themeStore,
      soundStore,
```

Then add these test cases inside the `describe` block:

```tsx
  it('renders the sound toggle when a soundStore is wired and persists a change', async () => {
    const soundStore: SoundStore = { load: vi.fn().mockReturnValue(true), set: vi.fn() };
    renderReglages(stubAuth(), undefined, soundStore);
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });
    const toggle = screen.getByRole('switch', { name: 'Sons' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.click();
    await waitFor(() => expect(soundStore.set).toHaveBeenCalledWith(false));
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('omits the sound toggle when no soundStore is in context', async () => {
    renderReglages(stubAuth());
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });
    expect(screen.queryByRole('switch', { name: 'Sons' })).toBeNull();
  });

  it('is axe-clean with the sound toggle present (ADR-0050)', async () => {
    const soundStore: SoundStore = { load: () => true, set: () => {} };
    const { container } = renderReglages(stubAuth(), undefined, soundStore);
    await screen.findByRole('switch', { name: 'Sons' });
    await expectAxeClean(container);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm vitest run tests/v2-reglages.test.tsx`
Expected: FAIL — no element with role `switch` / name "Sons".

- [ ] **Step 3: Add imports to ReglagesScreen**

In `frontend/src/ui/v2/ReglagesScreen.tsx`, extend the phosphor import (line 3) to include `SpeakerHigh`, and add the Ark Switch + `SoundStore` type imports:

```ts
import { Switch } from '@ark-ui/react/switch';
import type { SoundStore } from '@/application/session/SoundStore';
```

Add `SpeakerHigh` to the existing `@phosphor-icons/react` import list.

- [ ] **Step 4: Add the SoundGroup component + styles**

In `ReglagesScreen.tsx`, after the `ThemeGroup` component (after line 101), add the styles and component. This mirrors `ThemeGroup`; it reuses the file's existing `groupLabel`. The `Switch.Root` is the whole tappable row (≥52px), so the accessible name comes from `Switch.Label`:

```tsx
const soundCard = css({ bg: 'ws.card', borderRadius: '18px', padding: '4px', boxShadow: '0 1px 2px rgba(33,75,64,0.05)' });
const soundRow = css({ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '52px', padding: '12px 14px', cursor: 'pointer' });
const soundTile = css({ flex: 'none', width: '34px', height: '34px', borderRadius: '10px', bg: 'ws.jade', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ws.jadeInk' });
const soundBody = css({ display: 'flex', flexDirection: 'column', minWidth: 0 });
const soundLabel = css({ fontSize: '14.5px', fontWeight: 'bold', color: 'ws.jadeInk' });
const soundSub = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85, marginTop: '1px' });
const switchControl = css({
  marginLeft: 'auto',
  flex: 'none',
  width: '44px',
  height: '26px',
  borderRadius: '999px',
  padding: '3px',
  bg: 'ws.sable',
  transition: 'background 160ms ease',
  '&[data-state=checked]': { bg: 'ws.jade' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const switchThumb = css({
  display: 'block',
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  bg: 'white',
  boxShadow: '0 1px 2px rgba(33,75,64,0.3)',
  transition: 'transform 160ms ease',
  '&[data-state=checked]': { transform: 'translateX(18px)' },
});

function SoundGroup({ soundStore }: { readonly soundStore: SoundStore }) {
  const [on, setOn] = useState<boolean>(() => soundStore.load());
  return (
    <section aria-label="Son">
      <div className={groupLabel}>Son</div>
      <div className={soundCard}>
        <Switch.Root
          checked={on}
          onCheckedChange={(details) => {
            soundStore.set(details.checked);
            setOn(details.checked);
          }}
          className={soundRow}
        >
          <span className={soundTile}>
            <SpeakerHigh size={18} weight="bold" aria-hidden="true" />
          </span>
          <span className={soundBody}>
            <Switch.Label className={soundLabel}>Sons</Switch.Label>
            <span className={soundSub}>Effets sonores de la grille</span>
          </span>
          <Switch.Control className={switchControl}>
            <Switch.Thumb className={switchThumb} />
          </Switch.Control>
          <Switch.HiddenInput />
        </Switch.Root>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Read soundStore and render the group**

Change the `useRouteContext` destructure (line 160) to also pull `soundStore`:

```tsx
  const { themeStore, soundStore } = useRouteContext({ from: '__root__' });
```

And render `SoundGroup` right after the `ThemeGroup` line (line 168):

```tsx
        {soundStore ? <SoundGroup soundStore={soundStore} /> : null}
```

- [ ] **Step 6: Run tests, typecheck, a11y**

Run: `cd frontend && pnpm vitest run tests/v2-reglages.test.tsx && pnpm typecheck`
Expected: PASS (including the 3 new cases + the axe check).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui/v2/ReglagesScreen.tsx frontend/tests/v2-reglages.test.tsx
git commit -s -m "feat(frontend): add grid-sound toggle to Réglages"
```

---

## Task 6: Compose the adapters in main.tsx

**Files:**
- Modify: `frontend/src/main.tsx` (imports line 1-2 region; `themeStore` block ~line 247-255; `baseContext` line 308)

**Interfaces:**
- Consumes: `loadSoundEnabled` / `saveSoundEnabled` (Task 1), `createWebAudioSoundPlayer` (Task 2), `SoundStore` (Task 1), `SoundPlayer` (Task 2).
- Produces: real `soundStore` + `soundPlayer` in the router context consumed by Réglages (Task 5) and the play route (Task 4).

- [ ] **Step 1: Add imports**

In `frontend/src/main.tsx`, near the existing `localStorageTheme` import (line 1) and `ThemeStore` import (line 2):

```ts
import { loadSoundEnabled, saveSoundEnabled } from '@/infrastructure/session/localStorageSound';
import { createWebAudioSoundPlayer } from '@/infrastructure/session/webAudioSoundPlayer';
import type { SoundStore } from '@/application/session/SoundStore';
import type { SoundPlayer } from '@/application/session/SoundPlayer';
```

- [ ] **Step 2: Instantiate the store + player**

Directly after the `themeStore` block (after line 255):

```ts
    // Grid sound effects (on by default). Same port indirection as the theme
    // preference — Réglages consumes the store; the play route consumes the
    // player, which self-gates on the store so the mute check lives in one place.
    const soundStore: SoundStore = { load: loadSoundEnabled, set: saveSoundEnabled };
    const soundPlayer: SoundPlayer = createWebAudioSoundPlayer(loadSoundEnabled);
```

- [ ] **Step 3: Add both to baseContext**

Change the `baseContext` assignment (line 308) to include them:

```ts
    const baseContext = { authClient, getPseudonym, surveyClient, surveyAnonStore: surveyAnonRatedStore, analytics, progressSyncService, billingClient, themeStore, soundStore, soundPlayer };
```

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && pnpm typecheck && pnpm build`
Expected: typecheck clean; build succeeds.

- [ ] **Step 5: Full test run**

Run: `cd frontend && pnpm vitest run`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.tsx
git commit -s -m "feat(frontend): wire grid sound store + player into the composition root"
```

---

## Final verification (end-to-end, browser)

After Task 6, drive the real app to confirm behaviour the unit tests can't (Web Audio + the mount-gate under real timing):

- [ ] Run `pnpm dev:preview` (MSW-backed grid), open `/play`, type a correct word → hear the two-note chime; complete the grid → hear the three-note win cue.
- [ ] Open `/reglages`, toggle **Sons** off, return to `/play`, validate a word → silence. Reload the app → the toggle is still off (persisted).
- [ ] Reopen an already-solved grid with sound on → no win cue on load (the `userActedRef` gate).
- [ ] `cd frontend && pnpm a11y` if the Réglages route is in the a11y baseline.

---

## Self-Review

**Spec coverage:**
- Two synthesized cues (word-validated, puzzle-solved) → Task 2 (`WORD_NOTES`/`WIN_NOTES`), Task 3 (triggers), Task 4 (wiring). ✓
- Web Audio synthesis, no asset files → Task 2. ✓
- On by default → Task 1 (`load` returns true unless `'off'`), Task 6 default. ✓
- Muteable via Réglages toggle → Task 5. ✓
- Self-gating player, single mute check → Task 2 (`isEnabled` getter) + Task 6 (wired to `loadSoundEnabled`). ✓
- Mount-time silence via `userActedRef` → Task 3 (gate) + tests. ✓
- Router-context injection mirroring ThemeStore → Tasks 1, 2, 6. ✓
- No new dependency / schema / ADR → Global Constraints. ✓
- tutoiement + a11y (axe, keyboard switch) → Task 5. ✓
- Out-of-scope items (volume, per-sound toggles, keystroke/error sounds, asset files, backend persistence) → not present. ✓

**Placeholder scan:** none — every code and test step is complete.

**Type consistency:** `SoundStore.load(): boolean` / `set(enabled)`; `SoundPlayer.playWordValidated()` / `playPuzzleSolved()`; `createWebAudioSoundPlayer(isEnabled: () => boolean)`; `useGridSounds({ validatedCount, won, userActedRef, soundPlayer })`; `PlayScreenProps.soundPlayer?`; context fields `soundStore?` / `soundPlayer?` — names match across Tasks 1-6. ✓
