# Cross-device solo progress sync — design

**Status:** awaiting maintainer review (Wave 1 of the workstream)
**Tracking:** the "auth grid sync" issue (#1063)
**Date:** 2026-06-28

## Problem

Solo puzzle progress is persisted only in `localStorage`, keyed by the
**anon `sessionId`** (`frontend/src/infrastructure/session/localStorageSolo.ts`).
It is never sent to the backend. A signed-in player who opens WordSparrow on a
second device sees none of their progress: filled cells, validated words, hint
usage all live on the first device's `localStorage` and nowhere else.

This is net-new functionality, not a regression — no sync layer has ever
existed.

## Decision (maintainer-approved 2026-06-28)

**The `identity/` context owns the synced store, as an opaque per-puzzle blob.**

Rationale, grounded in the current code:

- `identity/` is already a full hexagonal context with **CNPG + Flyway**
  (`V1__users` … `V5__user_role`) and a **session-cookie → `userId` principal**
  (`sessionCookie` security scheme `__Secure-ws_session`, consumed by `whoami`).
  It already *is* the owner of "the user's stuff."
- The blob is **opaque** to identity's domain — it stores the existing
  `SoloStore` JSON verbatim. identity never parses grid's puzzle structure, so
  there is **no cross-context coupling** (ADR-0001 §1) and no `$ref` into grid.
- The rejected alternative — grid owning `/v1/puzzles/{id}/progress` — would
  force grid (today "stateless puzzle generation") to validate identity's
  session cookie and hold per-user mutable state. Higher cost, posture change.

## Data model

New Flyway migration `identity/infrastructure/.../db/migration/V6__puzzle_progress.sql`:

```sql
CREATE TABLE puzzle_progress (
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    puzzle_id  TEXT        NOT NULL,
    payload    JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, puzzle_id)
);
```

- `ON DELETE CASCADE` ties progress to account deletion (RGPD: `deleteMe`
  already exists and must purge progress for free).
- `payload` is the opaque `SoloStore` JSON for that one puzzle.
- `updated_at` is the server-stamped write time, returned to the client for
  conflict resolution.

## API (schema-first — Wave 1 hard barrier)

Add to `identity/api/openapi.yaml`, secured by the existing `sessionCookie`
scheme (401 when absent — anon users never sync):

- `GET /v1/users/me/progress` → `{ items: [{ puzzleId, payload, updatedAt }], ... }`
  — batch pull on app load (the grilles archive needs the full set, not N round-trips).
- `GET /v1/users/me/progress/{puzzleId}` → `{ puzzleId, payload, updatedAt }` | 404
  — single-puzzle pull when opening one grid.
- `PUT /v1/users/me/progress/{puzzleId}` body `{ payload, baseUpdatedAt? }` → `{ updatedAt }`
  — debounced push of one puzzle's progress.

Wire conventions per ADR-0003 §6: camelCase, ISO-8601 `updatedAt`, RFC 7807
problem bodies, explicit `required` + `nullable`. `payload` is an opaque object
(`additionalProperties: true`) — the schema does NOT model grid's cell shape.

## Conflict policy

Two devices can edit the same puzzle offline. The merge is **semantic, not
last-writer-wins-whole-blob** (which would silently drop the other device's
letters):

- **Filled cells:** union by cell key; on a per-cell collision, keep the entry
  from the blob with the newer `updatedAt`.
- **Validated words / hints used:** monotonic — union of validated cell keys;
  `max` of hints used. A validated cell never un-validates from a sync.

The merge runs **client-side** in the Wave 3 sync layer (identity's blob is
opaque, so the server cannot merge). `PUT` may carry `baseUpdatedAt` so the
server rejects a push built on a stale read (409) and the client re-pulls,
re-merges, re-pushes.

## anon → authed carry-over

`AuthProvider` already fires `onAuthed(anonSessionId)` once per sign-in
(`frontend/src/ui/components/auth/AuthProvider.tsx`). On that transition the
sync layer pushes the device's local anon progress up (merged with whatever the
account already has), so signing in never discards the work done while anon.

## Threat model (Wave 1 ADR must include)

- **Authz:** every endpoint resolves `userId` from the `sessionCookie`
  principal server-side. There is **no `userId` in the path or body** — a user
  can only ever read/write their own rows. No IDOR surface.
- **Tenant isolation:** `WHERE user_id = :principal` on every query; PK enforces
  one row per (user, puzzle).
- **Abuse / resource bounds:** `payload` size cap (e.g. 64 KiB) enforced at the
  api edge → 413; reject non-object payloads → 400. Per-session write rate limit
  on `PUT`. A puzzle_id cap per user bounds table growth.
- **PII:** the blob is grid progress only — no PII. Account deletion cascades.
- **No new auth surface:** reuses the existing session cookie; no new token,
  no new login path, no threat-model delta to the OIDC flow.

## Wave plan

| Wave | PRs | Deliverable |
|------|-----|-------------|
| 1 | ADR-0075 + schema-only PR (`identity/api/openapi.yaml`) + this spec + threat model | **Hard barrier** — merges before any implementation. |
| 2 | identity backend: Flyway V6, `ProgressRepository` port + CNPG adapter, get/put/list use-cases behind session auth, api routes | One context, may exceed the 400-line soft target as one coherent layer (ADR-0001 §6a as amended). |
| 3 | frontend sync layer over `soloEntriesStore`: batch-pull + merge on authed load, debounced push, `onAuthed` carry-over wiring; localStorage stays anon + offline source of truth | Behind the existing auth state; anon UX unchanged. |

Each wave is fully reviewed and **merged** before the next opens (the schema is
a §3 barrier; the backend must land before the frontend can regenerate types).

## Out of scope (YAGNI)

- Real-time progress sync across two *simultaneously open* devices (the coop
  WebSocket path already covers live multiplayer; solo sync is pull-on-load +
  push-on-change, not a live channel).
- Server-side merge (the opaque-blob decision puts merge on the client).
- Syncing anon progress across devices (no identity to key on — anon stays
  device-local by definition).
