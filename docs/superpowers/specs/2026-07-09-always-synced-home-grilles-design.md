# Always-synced Home 7-day strip & /grilles calendar — design

- **Date:** 2026-07-09
- **Bounded context:** `frontend/` (`application/progress` + `ui`)
- **Governing ADR:** ADR-0075 (cross-device solo-progress sync). This
  change is additive to that service; no contract or schema change.

## Problem

Home's 7-day strip (`HomeScreen.weekCells`) and the `/grilles` calendar
(`GrillesArchiveScreen.infos`) derive each day's solved/started state by
reading solo progress from `localStorage`, inside `useMemo`s whose
dependency arrays only change on mount / first data-load.

Cross-device progress reaches `localStorage` only through the
`ProgressSyncService` merge side-channel, which today runs on exactly
three triggers:

1. `reconcileOnAuth` — a one-time full `pullAndMergeAll` per account per
   device, fired on sign-in by `useProgressSync`.
2. `pullAndMergeOne(puzzleId)` — in the `/play` route loader, when a grid
   is opened.
3. The manual `/compte` button — an explicit `pullAndMergeAll`.

Two independent gaps make Home and `/grilles` stale:

- **No re-pull on entry.** After the once-per-device reconcile, neither
  screen ever pulls again. Progress made on another device while this
  device idles never arrives unless the user opens a grid or presses the
  `/compte` button.
- **No reactive re-read.** Even when a merge *does* write `localStorage`,
  it writes directly via `SoloProgressBlobStore.replacePayload`, bypassing
  the in-memory `SoloEntriesStore` the screens hold. There is no
  `subscribe`/event anywhere in the path, so a mounted screen never
  recomputes. (Confirmed: `ProgressSyncService` returns bare
  `Promise<void>`; `SoloEntriesStore` exposes no change notification;
  `weekCells`/`infos` memos depend only on `history`/`summaries` + stable
  singletons.)

## Decision

Two coordinated pieces. Both are required — each alone leaves a real gap.

### Piece 1 — Reactive re-read (the missing primitive)

Add a change signal to `ProgressSyncService`, which already owns every
merge write:

- Interface gains `subscribe(listener: () => void): () => void` and an
  internal revision counter (readable via the `useSyncExternalStore`
  snapshot).
- An internal `notify()` bumps the revision and calls listeners. Call it
  **once** after the merge writes complete in `pullAndMergeAll` (after the
  loop) and in `pullAndMergeOne`.
- A small `useProgressRevision(service)` hook wraps
  `useSyncExternalStore(subscribe, getSnapshot)` and returns a number.
- `HomeScreen` and `GrillesArchiveScreen` call the hook and add its value
  to the dependency array of their `weekCells` / `infos` memo. Any merge →
  revision bumps → memo recomputes → re-reads `localStorage` → strip and
  calendar update live.
- Thread the service into both screens via the route context they already
  destructure (`index.tsx`, `grilles.tsx`). A narrow slice
  (`{ subscribe, getRevision }`) may be passed instead of the whole service
  to keep the screen interfaces lean — decided at plan time.

This fixes the **cold-start-on-Home** case: the sign-in reconcile's merge
now updates the already-mounted screen, as does any other background merge.

### Piece 2 — Pull-on-entry, non-blocking (stale-while-revalidate)

- Gate `pullAndMergeAll` with `if (!enabled) return;` at the top —
  consistent with `pullAndMergeOne` and `schedulePush`, which already
  self-gate. This makes it a no-op for anon / prerender / crawler traffic
  (Home and `/grilles` are public, indexable routes). **Safe for existing
  callers:** `useProgressSync` runs `setEnabled(true)` in an effect that
  precedes the `reconcileOnAuth` effect (verified in
  `useProgressSync.ts`), and `/compte` is authed, so `enabled` is already
  true at both existing call sites.
- On mount of `HomeScreen` and `GrillesArchiveScreen`, fire a
  fire-and-forget `void progressSyncService?.pullAndMergeAll().catch(() => {})`.
  No spinner, no blocked navigation: the cached strip/calendar renders
  immediately, and when the pull's merge lands, Piece 1's signal updates
  the view.

This makes **every entry** re-pull. The sign-in reconcile only runs once
per device, so without this, re-entering a screen never refreshes.

### Why both

- Piece 2 alone: in-app navigation is fresh, but cold-start-on-Home stays
  stale — the mount pull no-ops before auth resolves, and the later
  reconcile merge cannot re-render a mounted screen without Piece 1.
- Piece 1 alone: cold-start works, but re-entering never re-pulls
  (reconcile is once-per-device), so progress made elsewhere while this
  device idled won't appear without Piece 2.

## Components & data flow

```
mount HomeScreen / GrillesArchiveScreen
  └─ effect: progressSyncService.pullAndMergeAll()   (Piece 2, non-blocking, no-op if !enabled)
        └─ client.pullAll() → mergeProgress → blobStore.replacePayload (localStorage)
              └─ notify() bumps revision                 (Piece 1)
                    └─ useProgressRevision → useSyncExternalStore re-renders
                          └─ weekCells / infos memo (revision in deps) re-reads localStorage
                                └─ strip / calendar reflect merged cross-device state
```

The sign-in `reconcileOnAuth` merge and the `/play` `pullAndMergeOne`
merge also flow through `notify()`, so any mounted Home/grilles screen
updates from those too.

## Testing

- **Service:** `subscribe`/`notify` fires exactly once after
  `pullAndMergeAll` and after `pullAndMergeOne`; unsubscribe stops
  delivery. `pullAndMergeAll` is a no-op (no `client.pullAll`) when
  disabled — new gate. Existing merge/conflict/pacing tests unchanged.
- **Screens:** an external merge (write `localStorage` + `notify`)
  recomputes `weekCells` / `infos` and updates the rendered cells; a mount
  fires `pullAndMergeAll`.
- **Loader/mount gating:** anon → no network call; authed → pull fires.

## Scope

Files: `application/progress/ProgressSyncService.ts` (+ its interface),
a `useProgressRevision` hook, `ui/home/HomeScreen.tsx`,
`ui/v2/GrillesArchiveScreen.tsx`, `ui/routes/index.tsx`,
`ui/routes/grilles.tsx`, and tests. Single frontend workstream, additive
to ADR-0075 (new method + a gate), no schema/contract change, no new
dependency. Well under the 400-line diff cap.

## Consequences

- Home and `/grilles` become genuinely device-synced: fresh on every
  entry and live when any background merge lands.
- `ProgressSyncService` gains a small observable surface; other screens
  can reuse `useProgressRevision` later if needed.
- Each Home/grilles entry issues one `client.pullAll()` for authed users
  (idempotent merge; anon is a no-op). Concurrent-pull de-duplication is
  intentionally out of scope (YAGNI) — noted for follow-up if it shows up
  in practice.
