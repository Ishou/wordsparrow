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

- **Gate at the call site, not inside the service.** On mount of
  `HomeScreen` and `GrillesArchiveScreen`, fire a fire-and-forget pull
  **only when authed**, using the auth status the screens already read
  (`useOptionalAuth` in Home, `useAuth` in grilles):
  `if (authStatus === 'authed') void progressSyncService?.pullAndMergeAll().catch(() => {})`.
  Anon / prerender / crawler traffic never issues the pull, so the public
  indexable routes keep their zero-network first paint. No spinner, no
  blocked navigation: the cached strip/calendar renders immediately, and
  when the pull's merge lands, Piece 1's signal updates the view.
- **`ProgressSyncService.pullAndMergeAll` is left unchanged (ungated).**
  An earlier draft proposed adding `if (!enabled) return;` inside it, but
  that would (a) break existing tests that call `pullAndMergeAll` /
  `reconcileOnAuth` directly without `setEnabled(true)`, and (b) let
  `reconcileOnAuth` save its per-device marker without actually syncing if
  `enabled` ever lagged. Call-site gating avoids both and touches no
  existing behavior.

This makes **every entry** re-pull. The sign-in reconcile only runs once
per device, so without this, re-entering a screen never refreshes.

### Why both

- Piece 2 alone (no reactivity): the mount pull writes `localStorage`, but
  a mounted screen never re-reads it — so on the same visit the strip stays
  stale until an unrelated remount. Piece 1 is what turns any completed
  pull (mount pull, cold-start re-fire when `authStatus` flips to
  `authed`, or the sign-in reconcile) into a visible update.
- Piece 1 alone: cold-start works (the sign-in reconcile merge now
  re-renders), but re-entering never re-pulls — the reconcile is
  once-per-device — so progress made elsewhere while this device idled
  won't appear without Piece 2.

## Components & data flow

```
mount HomeScreen / GrillesArchiveScreen (authed only)
  └─ effect: progressSyncService.pullAndMergeAll()   (Piece 2, non-blocking, fire-and-forget)
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

- **Service:** `subscribe`/`notify` fires after `pullAndMergeAll` and
  after `pullAndMergeOne`; `getRevision()` advances; unsubscribe stops
  delivery. Existing merge/conflict/pacing/reconcile tests unchanged.
- **Screens:** an external merge (write `localStorage` + `notify`)
  recomputes `weekCells` / `infos` and updates the rendered cells.
- **Mount gating:** anon → no `pullAndMergeAll` call; authed → the pull
  fires once on mount.

## Scope

Files: `application/progress/ProgressSyncService.ts` (+ its interface),
a `useProgressRevision` hook, `ui/home/HomeScreen.tsx`,
`ui/v2/GrillesArchiveScreen.tsx`, `ui/routes/index.tsx`,
`ui/routes/grilles.tsx`, and tests. Single frontend workstream, additive
to ADR-0075 (new `subscribe`/`getRevision` methods only — no change to
existing sync behavior), no schema/contract change, no new dependency.
Well under the 400-line diff cap.

## Consequences

- Home and `/grilles` become genuinely device-synced: fresh on every
  entry and live when any background merge lands.
- `ProgressSyncService` gains a small observable surface; other screens
  can reuse `useProgressRevision` later if needed.
- Each Home/grilles entry issues one `client.pullAll()` for authed users
  (idempotent merge; anon is a no-op). Concurrent-pull de-duplication is
  intentionally out of scope (YAGNI) — noted for follow-up if it shows up
  in practice.
