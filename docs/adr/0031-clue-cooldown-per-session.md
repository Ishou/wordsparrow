# ADR-0031: Per-session (and per-daily) clue cooldown across grid generations

## Status

Accepted

## Context

`SkeletonFiller.pickClue` (`grid/domain/.../generation/SkeletonFiller.kt`)
selects a clue uniformly at random from the candidates that fit the
per-grid theme caps. The picker carries no memory across grids: the same
seed-bound `Random` is rebuilt at every `GeneratePuzzleUseCase.execute`
call, so a player who generates several grids in a row sees the same
canonical clue for popular short words almost every time. The user
described this as "always the same clues, I'd like to shuffle a bit."

Today the corpus is 1 clue per word in `words-fr.csv` — the placeholder
LoRA generations land via overlay files (themed/compass.csv) and only a
handful of words like `est` actually carry alternates. So the visible
"sameness" comes from a **thin clue pool**, not from a biased picker.
Users were warned of this; they still chose to put cooldown machinery in
place now so the diversity story is in place by the time the pool grows
(LoRA expansion / overlay imports). This ADR captures that decision and
its rationale.

The user's framing during planning:

- *"new branch from main + jvm-backend skills → when a grid is generated
  I'd like each clue to be delayed by a random `1..X` number of generations
  before being used again."*
- After clarifying questions: vary **clues** (not words), persistent in
  Postgres, **per session** for player-initiated grids, plus a single
  **shared "daily" bucket** for the daily endpoint so the daily grid
  feels varied day-over-day.
- *"manifesto + TDD"* — the implementation must follow the manifesto's
  TDD red-green-refactor rule and contract-first / ADR / feature-flag
  obligations; this ADR closes the ADR obligation.

The feature is small surface but novel state, so the manifesto's *ADR
for non-obvious decisions* applies.

## Decision

Add a per-bucket cooldown that suppresses recently-used `(word, clue)`
pairs from the picker for a random `1..X` number of subsequent
generations within the same bucket, persisted in Postgres.

### Buckets

A "bucket" is the cooldown scope — the unit across which "recently
used" is reasoned about. Two kinds:

1. **Per-session bucket** — keyed by `X-Session-Id` (UUID v7, same
   convention as the hints route per ADR-0003 §6). One bucket per
   player session; bumps on every player-initiated puzzle generation
   that is not a cache hit.
2. **Daily bucket** — keyed by a reserved sentinel UUID
   `00000000-0000-7000-8000-000000000000` aliased `DAILY_SCOPE_ID`
   (formatted as a UUID v7 to keep schema-level validation uniform but
   reserved by convention). One bucket shared across all daily-endpoint
   generations; bumps on the **first** generation of each new daily
   puzzle (subsequent same-day fetches hit the cache and do not bump).

Why a sentinel UUID for daily rather than a separate scope column: the
existing `puzzle_hint_usage` table already keys on `(puzzle_id,
session_id)` with `session_id` as a plain UUID, and reusing that column
shape avoids a divergent precedent. The poisoning risk (a client
sending `X-Session-Id == DAILY_SCOPE_ID` to corrupt the shared bucket)
is closed by a `400 invalid-session-id` guard at the route layer.

### Counter and TTL

A monotonic per-bucket `generation_seq` (`BIGINT`) increments by 1 on
each successful new generation for that bucket. When a clue is used,
the picker writes a row keyed by `(bucket_id, word_text, clue_text)`
with `cooldown_until_seq = current_seq + rand(1..X)`. On the next
generation for the same bucket, the picker reads the bucket's snapshot
(rows with `cooldown_until_seq > current_seq`) and filters those clues
out. If every fitting clue for a word is on cooldown, the picker falls
back to the existing uniform-random behavior so generation never fails.

### Default for X (max cooldown)

`X = 8`, configurable via `GRID_CLUE_COOLDOWN_MAX`. Uniform draw on
`[1..8]` gives expected suppression ~4.5 generations — long enough to
feel varied, short enough not to starve a thin clue pool.

### Hexagonal placement

A new domain port `ClueCooldownRepository` (in `grid:domain`, following
the same placement as `WordRepository`: the domain generator invokes it
directly, so the port must reside in domain to avoid an upward dependency.
Contrast with `HintUsageRepository` and `PuzzleRepository`, which are
application-level ports and live in `grid:application`.) exposes `snapshot(bucketId)`,
`recordGeneration(bucketId, usedClues, rollMaxInclusive)`, and
`deleteBySession(bucketId)`. The domain remains I/O-free: the
application layer pre-loads the snapshot and passes a small
`ClueCooldownPolicy` (a pure-domain interface) into the generator.
Infrastructure provides two adapters — `PostgresClueCooldownRepository`
(production / Testcontainers) and `InMemoryClueCooldownRepository`
(local dev + route tests) — mirroring the existing `HintUsageRepository`
adapter pair.

### Schema

Two new tables under a single Flyway migration
`V3__create_clue_cooldown.sql`:

- `clue_cooldown_session(session_id PK, generation_seq BIGINT,
  updated_at)` — one row per bucket; the column name `session_id` is
  reused for consistency with `puzzle_hint_usage` even though one row
  is the daily bucket.
- `clue_cooldown(session_id FK, word_text, clue_text,
  cooldown_until_seq, last_used_seq, updated_at, PRIMARY KEY
  (session_id, word_text, clue_text))` — active cooldowns. Index on
  `(session_id, cooldown_until_seq)` for the snapshot read. `ON DELETE
  CASCADE` from the bucket table makes GDPR erasure
  (`DELETE /v1/sessions/{id}`) one statement.

`clue_text` is the only stable identity available — `Word.clues` is a
list and indices are fragile across CSV regenerations; a hash adds
machinery for no benefit (the corpus is small enough that text-in-PK
is fine).

### Feature flag

`GRID_CLUE_COOLDOWN_ENABLED` (env, evaluated in `Module.kt`). Default
`false` in PR 2 (machinery deployed, behavior unchanged). Flipped to
`true` in PR 3 alongside the migration and route plumbing. Manifesto
*Deploy ≠ Release* requires an expiration — **the flag is removed (and
the feature becomes unconditional) by `2026-09-01`** in a small
follow-up PR. After that date, leaving the flag in code fails CI per the
manifesto rule.

## Consequences

### Easier

- The frontend reuses its existing `X-Session-Id` plumbing (already used
  for hint-reveal calls); enabling cooldown for a session is a one-line
  change in the GET puzzle fetcher.
- Daily-grid variety improves automatically as soon as the corpus has
  more clues; no further code changes needed when the LoRA / overlay
  expansion lands.
- GDPR erasure (`DELETE /v1/sessions/{id}`) extends naturally —
  `ClueCooldownRepository.deleteBySession` joins the existing
  `HintUsageRepository.deleteBySession` call. `ON DELETE CASCADE`
  cleans the dependent table without an explicit second statement.

### Harder

- The cooldown table grows unboundedly: a session that returns months
  later still has stale rows whose `cooldown_until_seq` is far below
  the current `generation_seq` of either bucket. Out of scope for v1;
  a follow-up TODO is a scheduled prune job (or a partial-index
  variant) that drops rows where `cooldown_until_seq <= current_seq`.
- A session generating many puzzles in parallel serializes on the
  bucket's `clue_cooldown_session` row (the
  `INSERT ... ON CONFLICT DO UPDATE RETURNING` is row-locking).
  Acceptable: the same shape works for `puzzle_hint_usage` and a
  player rarely fires concurrent generations.
- The daily bucket is single-writer in practice (the daily UUID is
  derived deterministically from the date, so two replicas trying to
  generate the same daily grid race on the puzzle table's
  `ON CONFLICT DO NOTHING`); only the winner reaches the cooldown
  write path.

### Different

- `LoadOrGeneratePuzzleUseCase.execute` gains an optional `sessionId`
  parameter. `null` keeps today's behavior (no cooldown read or write)
  and is the path used by anonymous fetches and the `/daily` endpoint
  pre-DAILY_SCOPE_ID route plumbing. Once PR 3 lands, the daily
  endpoint passes `DAILY_SCOPE_ID` instead of `null`.
- `WordPlacement.chosenClue`
  (`grid/domain/.../model/WordPlacement.kt:16`) becomes a load-bearing
  data point — it's the only source from which the application layer
  reconstructs which `(word, clue)` pairs to record. Already exposed
  on the placement, so no new field, but worth flagging.

## Threat model (STRIDE-lite)

Per the manifesto's *Threat Modeling Before Building*. Categories with
no delta from existing endpoints are noted for completeness.

### Spoofing

`X-Session-Id` is unauthenticated — same as the hints route. A caller
can present any UUID and "claim" that session's cooldown. The blast
radius is **personal variety degradation** (the attacker bumps a
victim's counter and writes cooldown rows under the victim's id), not
data disclosure. Session cooldown rows do not contain anything the
session doesn't already know (its own clue history) and cannot be read
out of band — the API exposes no `GET /v1/cooldown` endpoint.

**Acceptable.** Same posture as hint usage.

### Tampering — *poisoning the daily bucket*

A client sending `X-Session-Id: 00000000-0000-7000-8000-000000000000`
(`DAILY_SCOPE_ID`) on `GET /v1/puzzles/{id}` would write cooldown rows
into the shared daily bucket, biasing the next day's daily grid for
every user.

**Mitigated.** The route handler rejects an `X-Session-Id` whose
parsed UUID equals `DAILY_SCOPE_ID` with `400 invalid-session-id`,
documented in the OpenAPI. Tested in `PuzzleRouteCooldownTest`.

### Repudiation

Out of scope. No audit trail beyond the standard request log.

**No delta.**

### Information disclosure

Cooldown rows store public dictionary text (`word_text`, `clue_text`)
and a session UUID the caller already owns. No PII; no payment data;
no auth tokens. The daily bucket's content is observable indirectly
(same date → same clues, by definition), but that's the cache
behavior, not a cooldown leak.

**No delta.**

### Denial of service

A client repeatedly hitting `GET /v1/puzzles/{newId}` with their own
`X-Session-Id` writes one bucket row + one batch insert per new
generation. The dominant cost is the puzzle generation itself, not
the cooldown writes. Edge rate limiting (out of scope for this ADR)
caps the request volume.

**Mitigated** by existing edge controls.

### Elevation of privilege

Cooldown does not grant any access. Not applicable.

**Not applicable.**

## Notes

- The user explicitly accepted the "thin clue pool" caveat — cooldown
  is the prerequisite for diversity, not the diversity itself.
- The `DAILY_SCOPE_ID` constant is reserved for this feature; future
  shared buckets (e.g. a "weekly puzzle" if it ever lands) get their
  own sentinel UUID rather than reusing this one.
- A larger refactor — renaming `session_id` to `bucket_id` for clarity
  — is deliberately deferred. Renaming a column shared with
  `puzzle_hint_usage` would couple unrelated work; if a third bucket
  ever lands, that triggers the rename.
- Feature-flag retirement PR is owed by `2026-09-01`. Search for
  `GRID_CLUE_COOLDOWN_ENABLED` in `Module.kt` to find the cleanup
  surface area.

## Amendment (2026-07-19): daily bucket uses a calendar-recurrence window

### Context

The daily bucket's generation-seq TTL assumes daily grids are generated
once per day, in date order, so a clue used "yesterday" is exactly one
counter bump behind "today" and reliably on cooldown. Two production
realities break that assumption:

- **Pre-generation runs far ahead.** The window is generated in large
  batches (dozens of dates at once), so date order and counter order
  already diverge within a batch's tail.
- **Regeneration is out-of-band.** Correction and blocklist processing
  (ADR-0108) regenerate a *single* date (`windowDays=1`, `force=true`,
  ADR-0081) at whatever counter value is current, and the shared
  `generation_seq` is bumped by every such regeneration. The `rand(1..8)`
  TTL then expires far faster than one day.

On 2026-07-19 this shipped a visible defect: a partial-window
regeneration on 2026-07-11 rebuilt 2026-07-10…18 but not 2026-07-19+.
The frozen 2026-07-19 grid had been generated five days earlier at a low
`generation_seq`; by the time 2026-07-18 was regenerated its clues had
long fallen off cooldown, so the regenerated grid reused seven
`(word, clue)` pairs — `CLE / "Ouvre la serrure"`, `RAS`, `RTT`, … —
that 2026-07-19 already showed. Two adjacent days repeated definitions,
which the whole feature exists to prevent.

The root cause is a units mismatch: "don't repeat within N days" is a
**calendar** constraint pinned to a **generation counter** polluted by
regeneration traffic. Widening `GRID_CLUE_COOLDOWN_MAX` cannot fix it
(it worsens short-word starvation, per `CooldownSweepTest`, and still
ignores generation order).

### Decision

For the **daily bucket only**, replace the generation-seq TTL with a
calendar-recurrence window derived from the stored grids themselves.
When generating or regenerating date `D`, forbid every `(word, clue)`
pair used by the *current* stored grid of any date `S` with
`|D - S| <= h`, where `h = rand(minGapDays..maxGapDays)` is derived
deterministically per `(pair, S)` from a stable hash — so a given stored
grid always yields the same horizons and a regeneration of `D` sees the
same constraints. Defaults `minGapDays = 5`, `maxGapDays = 10`
(`GRID_DAILY_CLUE_MIN_GAP_DAYS` / `GRID_DAILY_CLUE_MAX_GAP_DAYS`). The
`maxGapDays` is also the radius of stored neighbors consulted.

The minimum gap is a hard floor: any two dates within `minGapDays` are
always mutually exclusive regardless of generation order, so adjacent
days can never repeat. The `min..max` band randomizes the recurrence
distance, mirroring the original `rand(1..X)` intent.

Placement: a pure `DailyClueRecurrence` helper in `:grid:application`
computes the forbidden set from a `Map<LocalDate, Set<ClueId>>`;
`EnsureUpcomingDailiesUseCase` sources that map via
`PuzzleRepository.getCurrentForDate` and passes the resulting
`ClueCooldownPolicy` into the generator — the same seam the seq snapshot
used. No new port, no schema change: the stored grid *is* the record, so
the daily path no longer reads or writes the `DAILY_SCOPE_ID` bucket.

The per-session bucket is unchanged: it keeps the generation-seq TTL,
the `clue_cooldown*` tables, and `GRID_CLUE_COOLDOWN_MAX`. Session
generations are inherently in-order within a session, so the original
model holds there.

### Consequences

- **Order-independent and regeneration-safe.** A single-date regen reads
  its neighbors' stored grids directly, so the 2026-07-11 blind spot
  cannot recur. This supersedes ADR-0042's "sequential walk … reads
  cooldown state" *correctness* rationale — sequential generation is now
  only a convenience (a just-persisted day is a visible neighbor for the
  next), not the guarantee.
- **No schema migration.** The forbidden set is derived from `puzzles`.
  The `DAILY_SCOPE_ID` row and its `clue_cooldown` rows become inert
  historical data; a later prune may drop them.
- **More reads per generation.** Up to `2 * maxGapDays`
  `getCurrentForDate` lookups per date. Offline pre-gen only; negligible.
- **Starvation is bounded and validated.** Worst case forbids ~`2*maxGap`
  neighbor grids' pairs; `DailyRecurrenceWindowSweepTest` confirms 22×15
  daily generation still fills across a long sequence at gap 5..10 —
  0/30 failures, first-attempt fills, on the production corpus (words
  carry many distinct clues, so a forbidden pair rarely removes a word).
  The committed mock corpus (~1 clue/word, ADR-0097) is not a valid proxy
  here; the test asserts only against a `WORDSPARROW_REAL_CORPUS_DIR`.
- `GRID_CLUE_COOLDOWN_MAX` no longer affects the daily grid.
