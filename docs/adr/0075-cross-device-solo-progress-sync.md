# ADR-0075: Cross-device solo progress sync via identity-owned opaque blob

## Status

Accepted

## Context

Solo puzzle progress is persisted only in `localStorage`, keyed by the
anonymous `sessionId`
(`frontend/src/infrastructure/session/localStorageSolo.ts`). It is never sent
to the backend. A signed-in player who opens WordSparrow on a second device
sees none of their progress — filled cells, validated words, and hint usage
all live on the first device's `localStorage` and nowhere else (#1063,
production-observed 2026-06-28). This is net-new functionality, not a
regression: no sync layer has ever existed.

The natural home for a per-user synced store is unclear:

- `grid/` is stateless puzzle generation today. Making it own
  `/v1/puzzles/{id}/progress` would force it to validate identity's session
  cookie and hold per-user mutable state — a posture change, and a
  cross-context coupling the hexagonal layout exists to avoid.
- `identity/` (ADR-0044, ADR-0045, ADR-0060) already owns "the user's stuff":
  it has CNPG + Flyway, the `sessionCookie → userId` principal consumed by
  `whoAmI`, and RGPD erasure (`deleteMe`). It already is the owner of
  per-user state.

## Decision

### 1. `identity/` owns the synced solo-progress store as an opaque per-puzzle blob

A new store lives in the `identity/` context. Each row holds the frontend's
`SoloStore` JSON for one puzzle **verbatim** — identity's domain never parses
grid's puzzle structure. Because the payload is opaque, there is no
cross-context coupling (ADR-0001 §1) and no `$ref` into `grid/`. The rejected
alternative (grid owning the store) is recorded in Context above: it is a
higher-cost posture change with no offsetting benefit, since the store needs
the user principal that already lives in identity.

### 2. Data model

A new table (the Flyway migration `V6__puzzle_progress.sql` is written in Wave
2; this ADR records the shape):

```sql
CREATE TABLE puzzle_progress (
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    puzzle_id  TEXT        NOT NULL,
    payload    JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, puzzle_id)
);
```

- `ON DELETE CASCADE` ties progress to account deletion: the existing
  `deleteMe` (ADR-0045 §4 erasure) purges progress for free, with no new
  fan-out to coordinate.
- `payload` is the opaque `SoloStore` JSON for that one puzzle.
- `updated_at` is the server-stamped write time, returned to the client for
  conflict resolution.
- The PK enforces one row per `(user, puzzle)`.

### 3. API (schema-first — Wave 1 hard barrier)

Three operations are added to `identity/api/openapi.yaml`, all secured by the
existing `sessionCookie` scheme (`__Secure-ws_session`); no new auth mechanism
is introduced. `401` when the cookie is absent — anonymous players never sync.

- `GET /v1/users/me/progress` — batch pull, `{ items: [ProgressEntry, ...] }`.
  The grilles archive needs the whole set on load, not N round-trips.
- `GET /v1/users/me/progress/{puzzleId}` — single pull; `404` when no row.
- `PUT /v1/users/me/progress/{puzzleId}` — push of one puzzle's progress;
  body `{ payload, baseUpdatedAt? }`; returns `{ updatedAt }`.

Wire conventions per ADR-0003 §6: camelCase, ISO-8601 `updatedAt`, RFC 7807
problem bodies, explicit `required` lists. `payload` is an opaque object
(`additionalProperties: true`) — the schema does not model grid's cell shape.

### 4. Conflict policy: client-side semantic merge

Two devices can edit the same puzzle offline. Whole-blob last-writer-wins
would silently drop the other device's letters, so the merge is **semantic**:

- **Filled cells:** union by cell key; on a per-cell collision, keep the entry
  from the blob with the newer `updatedAt`.
- **Validated words / hints used:** monotonic — union of validated cell keys,
  `max` of hints used. A validated cell never un-validates from a sync.

Because the server stores opaque blobs it cannot merge; the merge runs
client-side in the Wave 3 sync layer. `PUT` may carry `baseUpdatedAt` so the
server rejects a push built on a stale read with `409`; the client then
re-pulls, re-merges, and re-pushes (optimistic concurrency).

## Threat model

Required by CLAUDE.md for any auth/authz change. The store respects ADR-0045
data-minimization.

- **Authz:** every endpoint resolves `userId` from the `sessionCookie`
  principal **server-side**. There is no `userId` in the path or body — a user
  can only ever read or write their own rows. No IDOR surface.
- **Tenant isolation:** `WHERE user_id = :principal` on every query; the PK
  enforces one row per `(user, puzzle)`, so no cross-user row exists to leak.
- **Resource bounds:** the `payload` size is capped at **64 KiB** at the API
  edge → `413` over the cap; non-object payloads are rejected → `400`. A
  per-session write rate limit applies to `PUT`. A `puzzle_id` cap per user
  bounds table growth.
- **PII:** the blob is grid progress only — no PII (satisfies ADR-0045).
  Account deletion cascades via the `ON DELETE CASCADE` FK; the existing
  `deleteMe` erasure path needs no change.
- **No new auth surface:** the endpoints reuse the existing session cookie —
  no new token, no new login path, no delta to the ADR-0044/ADR-0047 OIDC
  threat model.

## Consequences

### Easier

- A signed-in player's solo progress follows them across devices; the
  invariant "same auth ⇒ same progress" holds.
- RGPD erasure stays a row-level cascade — no new fan-out, no audit traversal.
- `grid/` stays stateless; the identity boundary (ADR-0044) is respected with
  no cross-context `$ref`.

### Harder

- One more table, port, and CNPG adapter in identity (Wave 2), plus a sync
  layer in the frontend (Wave 3).
- The merge lives on the client, so its correctness is a frontend concern;
  the server is a dumb opaque store and cannot defend the semantic invariants.

### Different

- Read/write authority for solo progress is user-scoped and cookie-authed;
  anonymous play stays device-local by definition (no identity to key on).

## Implementation (waves)

Schema-first per ADR-0001 §3 and ADR-0003 §8: the schema-only PR is a §3
barrier and merges before any implementation.

| Wave | Deliverable |
|------|-------------|
| 1 | This ADR + the schema-only PR on `identity/api/openapi.yaml` + the design spec. **Hard barrier.** |
| 2 | identity backend: Flyway `V6__puzzle_progress.sql`, `ProgressRepository` port + CNPG adapter, get/put/list use cases behind session auth, API routes. |
| 3 | frontend sync layer: batch-pull + merge on authed load, debounced push, `onAuthed` carry-over of anon progress; `localStorage` stays the anon + offline source of truth. |

## References

- **#1063** — "auth grid sync" tracking issue.
- **`docs/superpowers/specs/2026-06-28-cross-device-solo-progress-sync-design.md`**
  — the design spec bundled with the Wave 1 PR.
- **ADR-0001 §1, §3** — cross-context coupling avoidance; schemas-first
  parallel-PR workflow.
- **ADR-0003 §6** — wire conventions consumed by the schema.
- **ADR-0044** — identity bounded context; introduced the `sessionCookie →
  userId` principal this store keys on.
- **ADR-0045** — player-identity data minimization; binds the no-PII posture
  of the blob and the cascading-erasure guarantee.
