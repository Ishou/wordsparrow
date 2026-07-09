# Always-synced Home strip & /grilles calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Also required before touching `frontend/`:** invoke the `frontend` skill (Vite + React 19 + TanStack Router + Panda + Vitest + MSW conventions, the uncontrolled-input contract, and repo-specific gotchas).

**Goal:** Make Home's 7-day strip and the `/grilles` calendar reflect cross-device solo progress automatically — fresh on every authed entry, and live when any background merge lands — instead of only after opening a grid or pressing the `/compte` sync button.

**Architecture:** Two additive pieces on the existing ADR-0075 sync path. (1) Reactivity: `ProgressSyncService` gains a `subscribe`/`getRevision` observable, `notify()`s after each merge, and a `useProgressRevision` hook feeds that revision into the screens' derived-cell `useMemo` deps so they re-read `localStorage`. (2) Pull-on-entry: each screen fires a fire-and-forget `pullAndMergeAll()` on mount **only when authed** (gated at the call site via the auth status the screens already read). No change to existing sync behavior.

**Tech Stack:** TypeScript, React 19 (`useSyncExternalStore`, `useEffect`, `useMemo`), TanStack Router, Vitest + @testing-library/react.

## Global Constraints

- **TDD:** failing test first, then minimal implementation, then pass. Frequent commits.
- **No `console.log` / no `println`.** Structured logging only; here, swallow pull errors with `.catch(() => {})` (matches `play.tsx`).
- **Comments:** at most one line, on a non-obvious *why*. No multi-line comment blocks in new code.
- **PR cap:** 400 lines of diff excluding generated/blank. This whole plan is one workstream, one PR.
- **Commits:** conventional, bounded-context scope, DCO sign-off (`git commit -s`). Scope for these: `feat(frontend-application ...)` for the service, `feat(frontend-ui ...)` for the hook/screens. End every commit message body with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Governing ADR:** ADR-0075 (cross-device solo-progress sync). Additive only — do not change `pullAndMergeAll`/`pullAndMergeOne`/`reconcileOnAuth` merge/push behavior.
- **All commands run from `frontend/`.** Gates before PR: `pnpm test`, `pnpm typecheck`, `pnpm lint`. (No schema touched → `pnpm api:check` not required.)

---

## File structure

- `frontend/src/application/progress/ProgressSyncService.ts` — **modify**: add `subscribe`/`getRevision` to the interface; add `listeners`/`revision`/`notify()` to the factory; `notify()` after merges in `pullAndMergeAll` and `pullAndMergeOne`.
- `frontend/src/ui/lib/useProgressRevision.ts` — **create**: `useSyncExternalStore` wrapper returning the service's revision (0 when no service / during prerender).
- `frontend/src/ui/home/HomeScreen.tsx` — **modify**: add `progressSyncService?` prop; subscribe via the hook; add revision to `weekCells` deps; fire `pullAndMergeAll()` on mount when authed.
- `frontend/src/ui/routes/index.tsx` — **modify**: pass `progressSyncService` from route context into `HomeScreen`.
- `frontend/src/ui/v2/GrillesArchiveScreen.tsx` — **modify**: add `progressSyncService?` prop; subscribe via the hook; add revision to `infos` deps; fire `pullAndMergeAll()` on mount when authed.
- `frontend/src/ui/routes/grilles.tsx` — **modify**: pass `progressSyncService` from route context into `GrillesArchiveScreen`.
- `frontend/tests/progress-sync-service.test.ts` — **modify**: add `subscribe`/`getRevision`/`notify` tests.
- `frontend/tests/compte-sync-button.test.tsx` — **modify**: extend the `fakeSyncService` literal with `subscribe`/`getRevision`.
- `frontend/tests/use-progress-revision.test.tsx` — **create**: hook re-render test.
- `frontend/tests/home-progress-sync.test.tsx` — **create**: Home pull-on-entry + reactive re-read tests.
- `frontend/tests/v2-grilles.test.tsx` — **modify**: grilles pull-on-entry + reactive re-read tests.

---

### Task 1: `ProgressSyncService` gains a merge-completion observable

**Files:**
- Modify: `frontend/src/application/progress/ProgressSyncService.ts`
- Modify (fix existing fake): `frontend/tests/compte-sync-button.test.tsx:38-48`
- Test: `frontend/tests/progress-sync-service.test.ts`

**Interfaces:**
- Produces:
  - `ProgressSyncService.subscribe(listener: () => void): () => void` — registers `listener`; returns an unsubscribe function.
  - `ProgressSyncService.getRevision(): number` — monotonic counter, starts at `0`, `+1` on each completed merge (`pullAndMergeAll`, `pullAndMergeOne`).
- Consumes: existing `ProgressSyncClient`, `SoloProgressBlobStore`, `mergeProgress` (unchanged).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/progress-sync-service.test.ts` (reuses the file's existing `fakeClient`, `memBlobStore`, `payload`, `seedKey`, `SESSION`, `PUZZLE`, `T1` helpers):

```ts
describe('ProgressSyncService — merge-completion observable', () => {
  it('starts at revision 0 and notifies subscribers after pullAndMergeAll', async () => {
    const remoteEntry: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }) as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const service = createProgressSyncService({
      client: fakeClient({ pullAll: [remoteEntry] }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    const seen: number[] = [];
    service.subscribe(() => seen.push(service.getRevision()));
    expect(service.getRevision()).toBe(0);

    await service.pullAndMergeAll();

    expect(seen).toEqual([1]);
    expect(service.getRevision()).toBe(1);
  });

  it('notifies after pullAndMergeOne', async () => {
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }) as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const service = createProgressSyncService({
      client: fakeClient({ pull: () => remote }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    const fired = vi.fn();
    service.subscribe(fired);

    await service.pullAndMergeOne(PUZZLE);

    expect(fired).toHaveBeenCalledTimes(1);
    expect(service.getRevision()).toBe(1);
  });

  it('stops notifying after unsubscribe', async () => {
    const service = createProgressSyncService({
      client: fakeClient({ pullAll: [] }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    const fired = vi.fn();
    const unsubscribe = service.subscribe(fired);
    unsubscribe();

    await service.pullAndMergeAll();

    expect(fired).not.toHaveBeenCalled();
  });

  it('does not notify when pullAndMergeOne is a disabled no-op', async () => {
    const service = createProgressSyncService({
      client: fakeClient({ pull: () => null }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    const fired = vi.fn();
    service.subscribe(fired);

    await service.pullAndMergeOne(PUZZLE); // disabled → early return

    expect(fired).not.toHaveBeenCalled();
    expect(service.getRevision()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm test progress-sync-service`
Expected: FAIL — `service.subscribe is not a function` / `service.getRevision is not a function`.

- [ ] **Step 3: Add `subscribe`/`getRevision` to the interface**

In `frontend/src/application/progress/ProgressSyncService.ts`, inside `export interface ProgressSyncService { ... }`, add after the `schedulePush` line:

```ts
  // Fires after each merge into local (pullAndMergeAll/One) so mount-gated views can re-read; returns an unsubscribe.
  subscribe(listener: () => void): () => void;
  // Monotonic merge counter — the useSyncExternalStore snapshot.
  getRevision(): number;
```

- [ ] **Step 4: Add the notifier state to the factory**

In `createProgressSyncService`, next to `let enabled = false;`, add:

```ts
  const listeners = new Set<() => void>();
  let revision = 0;
  function notify(): void {
    revision += 1;
    for (const listener of listeners) listener();
  }
```

- [ ] **Step 5: `notify()` after the merges**

In the standalone `async function pullAndMergeAll()`, add `notify();` immediately **after** the `for (const remote of remoteEntries) { ... }` merge loop closes (the local-only push-collection loop does not write local, so this is the point where local reflects all merges):

```ts
    // ... end of the `for (const remote of remoteEntries)` loop
    }
    notify();
    // Local-only puzzles the account never saw: push them up so the union holds.
    for (const puzzleId of blobStore.listPuzzleIds(sessionId)) {
```

In the returned object's `pullAndMergeOne`, add `notify();` immediately **after** `blobStore.replacePayload(sessionId, puzzleId, merged);`:

```ts
      blobStore.replacePayload(sessionId, puzzleId, merged);
      notify();
      if (!payloadsEqual(merged, remotePayload)) {
```

- [ ] **Step 6: Expose `subscribe`/`getRevision` on the returned object**

In the returned object literal (next to `dispose`), add:

```ts
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getRevision(): number {
      return revision;
    },
```

- [ ] **Step 7: Fix the existing `fakeSyncService` literal**

In `frontend/tests/compte-sync-button.test.tsx`, the `fakeSyncService` object literal (around lines 38-48) must satisfy the widened interface. Add the two methods:

```ts
function fakeSyncService(pullAndMergeAll: () => Promise<void>): ProgressSyncService {
  return {
    setEnabled: () => {},
    pullAndMergeAll,
    pullAndMergeOne: async () => {},
    reconcileOnAuth: async () => {},
    resetReconciled: () => {},
    schedulePush: () => {},
    dispose: () => {},
    subscribe: () => () => {},
    getRevision: () => 0,
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && pnpm test progress-sync-service compte-sync-button`
Expected: PASS (new observable tests + unchanged compte tests).

- [ ] **Step 9: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
cd /Users/isho/IdeaProjects/bliss/.claude/worktrees/sync-home-grilles
git add frontend/src/application/progress/ProgressSyncService.ts frontend/tests/progress-sync-service.test.ts frontend/tests/compte-sync-button.test.tsx
git commit -s -m "feat(frontend-application): progress-sync merge-completion observable

subscribe/getRevision + notify() after each pullAndMerge, so mount-gated
views can reactively re-read local progress (ADR-0075).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `useProgressRevision` hook

**Files:**
- Create: `frontend/src/ui/lib/useProgressRevision.ts`
- Test: `frontend/tests/use-progress-revision.test.tsx`

**Interfaces:**
- Consumes: `ProgressSyncService.subscribe` / `getRevision` (Task 1).
- Produces: `useProgressRevision(service: ProgressSyncService | undefined): number` — re-renders the caller on every merge; returns `0` when `service` is `undefined` and for the prerender/server snapshot.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/use-progress-revision.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProgressSyncService } from '@/application/progress';
import { useProgressRevision } from '@/ui/lib/useProgressRevision';

// Minimal fake with a real subscribe/getRevision and a manual merge trigger.
function fakeService(): ProgressSyncService & { fireMerge: () => void } {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    setEnabled: () => {},
    pullAndMergeAll: async () => {},
    pullAndMergeOne: async () => {},
    reconcileOnAuth: async () => {},
    resetReconciled: () => {},
    schedulePush: () => {},
    dispose: () => {},
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getRevision: () => revision,
    fireMerge: () => {
      revision += 1;
      for (const l of listeners) l();
    },
  };
}

function Probe({ service }: { service?: ProgressSyncService }) {
  const rev = useProgressRevision(service);
  return <output>rev={rev}</output>;
}

describe('useProgressRevision', () => {
  it('returns 0 with no service', () => {
    render(<Probe service={undefined} />);
    expect(screen.getByText('rev=0')).toBeInTheDocument();
  });

  it('re-renders with the new revision when the service notifies', () => {
    const service = fakeService();
    render(<Probe service={service} />);
    expect(screen.getByText('rev=0')).toBeInTheDocument();
    act(() => service.fireMerge());
    expect(screen.getByText('rev=1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && pnpm test use-progress-revision`
Expected: FAIL — cannot resolve `@/ui/lib/useProgressRevision`.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/ui/lib/useProgressRevision.ts`:

```ts
import { useCallback, useSyncExternalStore } from 'react';
import type { ProgressSyncService } from '@/application/progress';

// Re-renders on every progress merge (ADR-0075) so mount-gated derived views re-read local storage; 0 when unwired or prerendering.
export function useProgressRevision(service: ProgressSyncService | undefined): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => service?.subscribe(onStoreChange) ?? (() => {}),
    [service],
  );
  return useSyncExternalStore(
    subscribe,
    () => service?.getRevision() ?? 0,
    () => 0,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && pnpm test use-progress-revision`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/isho/IdeaProjects/bliss/.claude/worktrees/sync-home-grilles
git add frontend/src/ui/lib/useProgressRevision.ts frontend/tests/use-progress-revision.test.tsx
git commit -s -m "feat(frontend-ui): useProgressRevision hook

useSyncExternalStore over ProgressSyncService.subscribe so views re-read
local progress after a background merge (ADR-0075).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire Home strip — reactive re-read + pull-on-entry

**Files:**
- Modify: `frontend/src/ui/home/HomeScreen.tsx`
- Modify: `frontend/src/ui/routes/index.tsx`
- Test: `frontend/tests/home-progress-sync.test.tsx` (create)

**Interfaces:**
- Consumes: `useProgressRevision` (Task 2); `ProgressSyncService.pullAndMergeAll` (existing); `useOptionalAuth()` → `auth?.state.status` (existing in this file).
- Produces: `HomeScreen` accepts a new optional prop `progressSyncService?: ProgressSyncService`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/home-progress-sync.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth/AuthClient';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { ProgressSyncService } from '@/application/progress';
import type { SoloEntriesStore, SoloLockedCell } from '@/application/solo/SoloEntriesStore';
import { HomeScreen } from '@/ui/home/HomeScreen';
import { AuthProvider } from '@/ui/components/auth';

const TODAY = new Date().toISOString().slice(0, 10);
const summaryToday: DailySummary = {
  id: 'today-1',
  date: TODAY,
  gridNumber: 200,
  difficulty: null,
  totalLetterCells: 4,
};
const repo: PuzzleRepository = {
  fetchById: () => Promise.resolve(null as never),
  fetchDaily: () => Promise.resolve(null),
  listDailySummaries: () => Promise.resolve({ items: [summaryToday], hasMore: false }),
};

// Mutable store: `locked` flips from 0 to full to simulate a merge writing local storage.
function mutableStore(): SoloEntriesStore & { locked: number } {
  const store = {
    locked: 0,
    load: () => [],
    save: () => {},
    loadLockedCells: (): ReadonlyArray<SoloLockedCell> =>
      Array.from({ length: store.locked }, (_, i) => ({ row: 0, column: i })),
    lockCell: () => {},
    loadHintsUsed: () => 0,
    recordHintUsed: () => {},
    loadElapsed: () => 0,
    saveElapsed: () => {},
    clearForPuzzle: () => {},
  };
  return store;
}

function observableService(): ProgressSyncService & { fireMerge: () => void } {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    setEnabled: () => {},
    pullAndMergeAll: vi.fn(async () => {}),
    pullAndMergeOne: async () => {},
    reconcileOnAuth: async () => {},
    resetReconciled: () => {},
    schedulePush: () => {},
    dispose: () => {},
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getRevision: () => revision,
    fireMerge: () => {
      revision += 1;
      for (const l of listeners) l();
    },
  };
}

function authClientOf(authed: boolean): AuthClient {
  return {
    whoami: () => Promise.resolve(authed ? { userId: 'u-1', displayName: 'Lapin 1' } : null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (p, r) => `https://auth.test/${p}?return=${r}`,
  } as unknown as AuthClient;
}

function renderHome(opts: {
  authed: boolean;
  store: SoloEntriesStore;
  service?: ProgressSyncService;
}) {
  const authClient = authClientOf(opts.authed);
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
        <HomeScreen
          puzzleRepository={repo}
          soloEntriesStore={opts.store}
          progressSyncService={opts.service}
        />
      </AuthProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

// The day-dot button renders the day-of-month as its only text; that's unambiguous among page buttons.
const DAY_NUM = String(new Date(`${TODAY}T00:00:00Z`).getUTCDate());
const todayCell = () => screen.getAllByRole('button').find((b) => b.textContent === DAY_NUM)!;

describe('Home — cross-device progress sync', () => {
  it('fires pullAndMergeAll on mount when authed', async () => {
    const service = observableService();
    renderHome({ authed: true, store: mutableStore(), service });
    await waitFor(() => expect(service.pullAndMergeAll).toHaveBeenCalledTimes(1));
  });

  it('does not pull when anon', async () => {
    const service = observableService();
    renderHome({ authed: false, store: mutableStore(), service });
    // Wait until the strip has rendered (summaries loaded + auth resolved to anon) so a stray pull would have fired.
    await waitFor(() => expect(todayCell()).toBeTruthy());
    expect(service.pullAndMergeAll).not.toHaveBeenCalled();
  });

  it('re-reads the strip when a merge notifies', async () => {
    const store = mutableStore();
    const service = observableService();
    renderHome({ authed: true, store, service });
    // today's dot: 0 locked → untouched; aria has no "résolue".
    await waitFor(() => expect(todayCell()).toBeTruthy());
    expect(todayCell().getAttribute('aria-label')).not.toMatch(/résolue/i);

    // Simulate a merge that fully solved today's grid on another device.
    act(() => {
      store.locked = summaryToday.totalLetterCells;
      service.fireMerge();
    });

    await waitFor(() => expect(todayCell().getAttribute('aria-label')).toMatch(/résolue/i));
  });
});
```

> Note: the exact aria substrings come from the i18n catalog — `home.cell.aria.solved` renders "résolue" today. If the catalog text differs, match the current `t('home.cell.aria.solved')` value; the assertion intent is "the solved marker appears after the merge".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm test home-progress-sync`
Expected: FAIL — `HomeScreen` has no `progressSyncService` prop; no pull fires; the strip does not update on `fireMerge`.

- [ ] **Step 3: Add the prop + import the hook**

In `frontend/src/ui/home/HomeScreen.tsx`:

Add the import near the other `@/ui` imports:

```ts
import { useProgressRevision } from '@/ui/lib/useProgressRevision';
import type { ProgressSyncService } from '@/application/progress';
```

Extend the props destructure and type (the `export function HomeScreen({ ... }: { ... })` head):

```ts
export function HomeScreen({
  puzzleRepository,
  soloEntriesStore,
  wordsRepository,
  lobbyClient,
  getSession,
  progressSyncService,
}: {
  readonly puzzleRepository: PuzzleRepository;
  readonly soloEntriesStore: SoloEntriesStore;
  readonly wordsRepository?: WordsRepository;
  readonly lobbyClient?: LobbyClient;
  readonly getSession?: () => HomeSession;
  readonly progressSyncService?: ProgressSyncService;
}) {
```

- [ ] **Step 4: Subscribe to merges and gate the strip memo on the revision**

After `const auth = useOptionalAuth();` (existing, ~line 161), add:

```ts
  const progressRevision = useProgressRevision(progressSyncService);
```

Add `progressRevision` to the `weekCells` `useMemo` dependency array:

```ts
  }, [week, history, soloEntriesStore, progressRevision]);
```

- [ ] **Step 5: Fire the pull on mount when authed**

Add this effect (place it after the `history` effect, ~line 248):

```ts
  // Pull cross-device progress on entry so the strip is fresh; authed-only keeps anon/prerender network-free (ADR-0075).
  useEffect(() => {
    if (auth?.state.status !== 'authed') return;
    void progressSyncService?.pullAndMergeAll().catch(() => {});
  }, [auth?.state.status, progressSyncService]);
```

- [ ] **Step 6: Pass the service from the route**

In `frontend/src/ui/routes/index.tsx`, add `progressSyncService` to the context destructure and pass it to `HomeScreen`:

```ts
  const { puzzleRepository, soloEntriesStore, wordsRepository, lobbyClient, getSession, progressSyncService } =
    Route.useRouteContext();
  return (
    <HomeScreen
      puzzleRepository={puzzleRepository}
      soloEntriesStore={soloEntriesStore}
      wordsRepository={wordsRepository}
      lobbyClient={lobbyClient}
      getSession={getSession}
      progressSyncService={progressSyncService}
    />
  );
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && pnpm test home-progress-sync`
Expected: PASS.

- [ ] **Step 8: Guard against regressions in existing Home tests + typecheck**

Run: `cd frontend && pnpm test home && pnpm typecheck`
Expected: PASS (existing home tests render `HomeScreen` without `progressSyncService`; the prop is optional and the mount pull no-ops when anon / unwired).

- [ ] **Step 9: Commit**

```bash
cd /Users/isho/IdeaProjects/bliss/.claude/worktrees/sync-home-grilles
git add frontend/src/ui/home/HomeScreen.tsx frontend/src/ui/routes/index.tsx frontend/tests/home-progress-sync.test.tsx
git commit -s -m "feat(frontend-ui): Home 7-day strip syncs cross-device progress

Pull-on-entry when authed + reactive re-read via useProgressRevision, so
the strip reflects other devices without opening a grid (ADR-0075).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire `/grilles` calendar — reactive re-read + pull-on-entry

**Files:**
- Modify: `frontend/src/ui/v2/GrillesArchiveScreen.tsx`
- Modify: `frontend/src/ui/routes/grilles.tsx`
- Test: `frontend/tests/v2-grilles.test.tsx`

**Interfaces:**
- Consumes: `useProgressRevision` (Task 2); `ProgressSyncService.pullAndMergeAll` (existing); `useAuth()` → `status` (existing in this file, `authStatus`).
- Produces: `GrillesArchiveScreen` accepts a new optional prop `progressSyncService?: ProgressSyncService`.

- [ ] **Step 1: Write the failing tests**

Extend `frontend/tests/v2-grilles.test.tsx`. First widen the harness so a service + authed session can be injected. Add an `observableService` helper near the top of the file (after the `soloStore` definition):

```ts
function observableService(): import('@/application/progress').ProgressSyncService & { fireMerge: () => void } {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    setEnabled: () => {},
    pullAndMergeAll: vi.fn(async () => {}),
    pullAndMergeOne: async () => {},
    reconcileOnAuth: async () => {},
    resetReconciled: () => {},
    schedulePush: () => {},
    dispose: () => {},
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getRevision: () => revision,
    fireMerge: () => {
      revision += 1;
      for (const l of listeners) l();
    },
  };
}
```

Add `service` to `HarnessOptions` and thread it into the router context in `renderGrilles`:

```ts
interface HarnessOptions {
  readonly repo?: PuzzleRepository;
  readonly capabilities?: readonly string[] | null;
  readonly lobbyClient?: LobbyClient;
  readonly withMultiplayer?: boolean;
  readonly initialEntry?: string;
  readonly service?: import('@/application/progress').ProgressSyncService;
}
```

In the `context: { ... }` object inside `renderGrilles`, add:

```ts
      progressSyncService: opts.service,
```

Then append this describe block:

```ts
describe('v2 grilles — cross-device progress sync', () => {
  it('fires pullAndMergeAll on mount when authed', async () => {
    const service = observableService();
    renderGrilles({ capabilities: [], service }); // capabilities array → whoami resolves a user → authed
    await waitFor(() =>
      expect((service.pullAndMergeAll as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1),
    );
  });

  it('does not pull when anon', async () => {
    const service = observableService();
    renderGrilles({ capabilities: null, service }); // whoami → null → anon
    // Wait for the calendar (summaries loaded) so auth has resolved to anon and a stray pull would have fired.
    await screen.findByRole('heading', { name: monthLabelFr(monthOf(TODAY)) });
    expect(service.pullAndMergeAll as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('re-derives the "à finir" list when a merge notifies', async () => {
    const service = observableService();
    // The Reprendre row lives on the a-finir tab; today starts at 8/14 (progress). After a merge fully locks it, the row disappears.
    renderGrilles({ capabilities: [], service, initialEntry: '/grilles?onglet=a-finir' });
    await findTodayCell();

    act(() => {
      LOCKED.today = 14; // full → status flips from 'progress' to 'done'
      service.fireMerge();
    });

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: `Reprendre — ${longDateFr(TODAY)} — 57 %` })).toBeNull(),
    );
    LOCKED.today = 8; // restore shared fixture for other tests
  });
});
```

> `LOCKED`, `soloStore`, `findTodayCell`, `longDateFr`, `TODAY` are already defined at the top of the file; `monthLabelFr`/`monthOf` are already imported (line 13). Ensure `act` and `waitFor` are in the `@testing-library/react` import (the file already imports `fireEvent, render, screen, waitFor`; add `act`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm test v2-grilles`
Expected: FAIL — no `progressSyncService` prop / no pull fires / calendar does not re-derive on `fireMerge`.

- [ ] **Step 3: Add the prop + import the hook**

In `frontend/src/ui/v2/GrillesArchiveScreen.tsx`, add imports:

```ts
import { useProgressRevision } from '@/ui/lib/useProgressRevision';
import type { ProgressSyncService } from '@/application/progress';
```

Extend the props destructure + type:

```ts
export function GrillesArchiveScreen({
  puzzleRepository,
  soloEntriesStore,
  onglet,
  onOngletChange,
  lobbyClient,
  getSession,
  authClient,
  progressSyncService,
}: {
  readonly puzzleRepository: PuzzleRepository;
  readonly soloEntriesStore: SoloEntriesStore;
  readonly onglet: GrillesOnglet;
  readonly onOngletChange: (onglet: GrillesOnglet) => void;
  readonly lobbyClient?: LobbyClient;
  readonly getSession?: () => GrillesSession;
  readonly authClient?: AuthClient;
  readonly progressSyncService?: ProgressSyncService;
}) {
```

- [ ] **Step 4: Subscribe to merges and gate the `infos` memo on the revision**

After `const { status: authStatus } = useAuth();` (existing, ~line 99), add:

```ts
  const progressRevision = useProgressRevision(progressSyncService);
```

Add `progressRevision` to the `infos` `useMemo` dependency array:

```ts
    [summaries, soloEntriesStore, todayIso, canSubscribe, progressRevision],
```

- [ ] **Step 5: Fire the pull on mount when authed**

Add this effect after the summaries effect (~line 193):

```ts
  // Pull cross-device progress on entry so the calendar is fresh; authed-only keeps anon/prerender network-free (ADR-0075).
  useEffect(() => {
    if (authStatus !== 'authed') return;
    void progressSyncService?.pullAndMergeAll().catch(() => {});
  }, [authStatus, progressSyncService]);
```

- [ ] **Step 6: Pass the service from the route**

In `frontend/src/ui/routes/grilles.tsx`, add `progressSyncService` to the context destructure and pass it to `GrillesArchiveScreen`:

```ts
  const { puzzleRepository, soloEntriesStore, lobbyClient, getSession, authClient, progressSyncService } =
    Route.useRouteContext();
```

and in the JSX:

```tsx
      authClient={authClient}
      progressSyncService={progressSyncService}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && pnpm test v2-grilles`
Expected: PASS (new sync tests + unchanged calendar tests).

- [ ] **Step 8: Full gates**

Run: `cd frontend && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. (Watch the a11y assertions in `v2-grilles` — the new tests must not break `expectAxeClean`.)

- [ ] **Step 9: Commit**

```bash
cd /Users/isho/IdeaProjects/bliss/.claude/worktrees/sync-home-grilles
git add frontend/src/ui/v2/GrillesArchiveScreen.tsx frontend/src/ui/routes/grilles.tsx frontend/tests/v2-grilles.test.tsx
git commit -s -m "feat(frontend-ui): /grilles calendar syncs cross-device progress

Pull-on-entry when authed + reactive re-read via useProgressRevision, so
the calendar reflects other devices without the /compte button (ADR-0075).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (whole feature)

- [ ] `cd frontend && pnpm test` — all green.
- [ ] `cd frontend && pnpm typecheck` — no errors.
- [ ] `cd frontend && pnpm lint` — no errors.
- [ ] Diff under 400 lines excluding generated/blank: `git diff --stat origin/main`.
- [ ] Manual/`/verify`: signed in on two sessions (or two browsers), solve today's grid in session A; in session B, load `/` and `/grilles` fresh → the strip/calendar reflect the solve without opening a grid or pressing the `/compte` button. While `/grilles` stays open in B, a subsequent solve in A appears on next entry (mount pull) and any in-flight reconcile merge updates it live.

## Notes for the implementer

- **Do not** add `if (!enabled) return;` inside `pullAndMergeAll` — it would break existing service tests and let `reconcileOnAuth` mark a device reconciled without syncing. Gating lives at the screen call sites (auth status), as in Tasks 3 & 4.
- The mount-pull effect depends on the auth status, so on cold-start it re-fires when `authStatus` flips `loading → authed`; Piece 1 (the revision hook) is what makes that completed pull visible on the already-mounted screen.
- Keep the two mount effects fire-and-forget with `.catch(() => {})` — a failed pull must never surface an error to these public screens (mirrors `play.tsx`).
