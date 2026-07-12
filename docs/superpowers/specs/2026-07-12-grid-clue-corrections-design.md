# Design: Grid clue corrections (moderation of already-generated definitions)

Date: 2026-07-12
Status: Design — approved for Waves 1–2; Wave 3 gets its own spec.

## Problem

A player reports a definition (clue) that is offensive or has a typo. Today the
maintainer review queue (`GET /v1/signalements`) only lets them mark a report
*handled* or *dismissed* — it records triage but does **not** fix anything. We
want the maintainer to correct a flagged definition so the fix lands in **two**
places at once:

1. **The corpus** — the source of truth — so the bad clue never gets placed into
   *future* grids.
2. **Every already-generated grid** that used it — so the fix shows up on grids
   already in players' hands, including today's daily.

## Constraints discovered (why the design is shaped this way)

- **A report carries no clue id.** `player_reports` stores raw `clue_text`,
  optional `word_text` (null when reported before the word was solved, ADR-0103),
  optional `puzzle_id`, and a `reason`. There is no `clueId`/direction/position.
  → **Correction identity is the `clueText` string** (plus the word when
  blocklisting a word). Matching is text-join, exactly as the queue already
  groups reports.
- **A generated grid freezes its clues into `puzzles.payload` JSONB**
  (`SerializedClue.text`). There is no normalized clue table and no update
  endpoint. → Patching an existing grid means rewriting rows of that JSONB.
- **The corpus is an offline artifact.** `words-fr.csv` is built by the Python
  pipeline and published to object storage; the Kotlin runtime reads it
  read-only from `$CORPUS_DIR`. A maintainer click **cannot** rebuild it. →
  Corpus-fix-for-future-grids is achieved by a **runtime overlay** consulted by
  the generator, with an **offline export** into `data/curated/clue_overrides_fr.csv`
  as the durable backstop.
- **`survey/` and `grid/` are separate bounded contexts**; cross-context backend
  imports are forbidden. The corpus and grids are owned by `grid/`. → The
  **corrections capability lives in `grid/`**; the `/signalements` review UI
  composes two calls (grid correction + survey `action`) at the frontend, which
  already talks to multiple contexts.
- **Capabilities are a generic `Set<String>` end-to-end** (identity
  `capabilitiesFor(role,tier)` → whoami → session attributes). The `contribuer`
  capability's scope is still under maintainer review (ADR-0079), and a precedent
  exists for capability-scope broadening at GA (`billing:subscribe`, ADR-0080).
  Admin moderation must stay maintainer-only regardless, so it gets its **own**
  capability distinct from `contribuer`.

## Decisions (locked during brainstorming)

- **Entry point:** maintainer, from the `/signalements` review queue.
- **Blast radius on existing grids:** **all** stored grids whose payload contains
  the clue, patched **in place** (preserves `puzzle_id`, so player progress is
  kept). Not just the reported puzzle.
- **Corpus mechanism:** a **runtime corrections store** in `grid/`, overlaid on
  the corpus by the generator (mirrors the *conceptual shape* of the existing
  themed-clue overlay, though that overlay is inline in `CsvWordRepository.load()`
  today — this introduces the first `WordRepository`-wrapping decorator in
  `grid/`), so new grids are clean immediately — **plus** an offline export into
  `clue_overrides_fr.csv` so the durable corpus catches up.
- **Existing-grid backfill is async, durable, and resumable** with progress
  polling. Recording a correction returns immediately; patching every stored grid
  runs as a background job that survives restarts and converges idempotently.
- **Capability:** a dedicated maintainer-only `admin:signalements` capability,
  distinct from `contribuer`.

## Operations

| Operation | Corpus (future grids) | Existing grids | Regen? | Gating |
|-----------|-----------------------|----------------|--------|--------|
| **Replace text** | override clue text for the word | patch clue text in payload | no | `admin:signalements` |
| **Forbid clue** *(word keeps ≥1 usable clue)* | drop that clue for the word | re-pick another surviving clue into payload | no | `admin:signalements` |
| **Forbid last clue** | — | — | — | **rejected** → maintainer must Replace or Blocklist |
| **Blocklist word** | drop the word entirely | **regenerate** affected grids | yes | `admin:signalements` + typed-word confirm + audit |

**Correction identity** is `clueText` (the definition string). `word` is an
optional disambiguator, required only for **Blocklist word**. A `Replace`/`Forbid`
is applied to whichever corpus word owns that clue text and to every stored grid
placement whose `chosenClue.text` equals it.

**Why "forbid last clue" is rejected:** a corpus `Word` must keep a non-empty
clue list, and the generator drops words that become unclueable. Forbidding the
only clue would make the word unplaceable — which is the *blocklist-word* path
(regeneration), not a cheap forbid. So the endpoint checks the corpus (+ pending
corrections) and rejects a forbid that would empty the word, telling the
maintainer to Replace (author a clean clue) or Blocklist the word.

---

## Architecture

```
survey/ (review queue)                 grid/ (owns corpus + grids)
  GET  /v1/signalements  ──────┐
  POST /v1/signalements/{id}/decision   POST /v1/corrections        (Wave 1–2, 202)
                               │        GET  /v1/corrections/{id}   (progress poll)
                               │        POST /v1/corrections/blocklist-word (Wave 3)
                               │   grid/worker: backfill loop (durable, resumable)
frontend /signalements ────────┴──> compose: grid correction → survey action → poll

identity/ (capability policy)
  Capability.ADMIN_SIGNALEMENTS granted to MAINTAINER only
```

### New capability — `admin:signalements` (all waves)

- `identity/domain/.../user/Capability.kt`: add
  `ADMIN_SIGNALEMENTS("admin:signalements")` and grant it in
  `roleCapabilities` to `Role.MAINTAINER` **only** (not `PLAYER`). Update
  `CapabilityTest`/`RoleTest`. It flows onto whoami automatically.
- `grid/api`: enforce it on the correction routes. There is no generic guard
  today — introduce `ApplicationCall.requireCapability(cap: String)` (in grid's
  auth layer, mirroring survey's `ContribuerGuard`) rather than another bespoke
  function; verify grid/api already stashes the whoami capability set on call
  attributes (survey does via `SessionMiddleware`/`IdentityClient`) — if not,
  port that plumbing. **This is an auth/authz change → the ADR (below) carries a
  threat model.**
- `frontend`: switch the `/signalements` route gate from
  `useCapabilityGate('contribuer')` to `useCapabilityGate('admin:signalements')`.
  (The `/contribuer` rating surface keeps `contribuer`.) Hooks are already
  generic over the string.

### Corrections store (`grid/`)

New table `clue_corrections` (Flyway migration under `grid/api/.../db/migration`):

| column | type | note |
|--------|------|------|
| `correction_id` | UUID PK (v7) | |
| `kind` | TEXT CHECK in (`replace`,`forbid_clue`,`blocklist_word`) | |
| `word_text` | TEXT NULL | folded; required for `blocklist_word`, else disambiguator |
| `old_clue_text` | TEXT | the reported definition (match key); null for `blocklist_word` |
| `new_clue_text` | TEXT NULL | required for `replace` |
| `reason` | TEXT NULL | mirrors the report reason for audit |
| `created_by` | UUID | maintainer user id |
| `created_at` | TIMESTAMPTZ default now() | |
| `exported_at` | TIMESTAMPTZ NULL | set when flushed to `clue_overrides_fr.csv` |
| `backfill_status` | TEXT CHECK in (`pending`,`running`,`done`,`failed`) default `pending` | drives the worker + progress polling |
| `grids_matched` | INT NULL | total stored grids to patch, captured at job start |
| `grids_patched` | INT NOT NULL default 0 | monotonic counter for progress |
| `backfill_error` | TEXT NULL | last error; non-null with `failed` |
| `backfill_updated_at` | TIMESTAMPTZ NULL | heartbeat, for stuck-job detection |

Domain: a `ClueCorrection` value type + a `WordRepository`-facing view
(`activeCorrections()`) the overlay consults. Application: use cases
`ApplyClueCorrectionUseCase` (record + backfill existing grids) and a query for
the generation overlay.

### Generation overlay — `CorrectionAwareWordRepository`

A decorator wrapping `CsvWordRepository` — the first `WordRepository`-wrapping
decorator in `grid/`; today's themed-clue overlay is inline in
`CsvWordRepository.load()` rather than a separate decorator, so this mirrors its
*conceptual shape* only. At load it applies active corrections to each `Word`:

- `replace`: rewrite the matching `WordClue.text`.
- `forbid_clue`: drop the matching `WordClue`; if that empties the word, drop the
  word from the generation set (defensive — the endpoint should already have
  rejected a last-clue forbid).
- `blocklist_word`: drop the word entirely.

Injected wherever `WordRepository` is composed for `GeneratePuzzleUseCase`. The
overlay reads **active corrections at generation time** (not only at corpus load),
so a new correction takes effect for future grids without a redeploy — a cheap
query against the small `clue_corrections` table, optionally cached with a short
TTL / NATS-event invalidation. Result: **future** grids (daily pre-gen and live
solo) are clean immediately.

### Existing-grid backfill — async, durable, resumable (all stored grids)

Recording a correction (`POST /v1/corrections`) is a fast, durable write: insert
the `clue_corrections` row with `backfill_status = 'pending'` and return **`202`**
with the `correction_id`. The overlay is already active and the report can be
marked handled right away — correctness converges even if the backfill lags.

A **backfill worker** (a loop in `grid/worker`, mirroring `--ensure-dailies`)
drains pending/running corrections; a NATS event kicks it promptly, with a
periodic poll as the resilience backstop. Per correction it:

1. On first claim, counts matching stored grids → `grids_matched`, sets
   `backfill_status = 'running'`.
2. Repeatedly selects a **batch** of `puzzles` rows still matching `old_clue_text`
   (JSONB containment predicate; add a repository method + GIN index on `payload`
   if the planner needs it) and patches each placement:
   - `replace`: set `chosenClue.text` (and the matching clue-list entry) to
     `new_clue_text`, re-serialize, update in place. `puzzle_id` unchanged →
     **player progress preserved**; today's daily is fixed without regeneration
     because `getCurrentForDate` returns the same (now-patched) row.
   - `forbid_clue`: re-pick another surviving clue for the word (reuse the
     generator's clue-selection over the non-forbidden set) and swap it in.
   - increments `grids_patched`, updates `backfill_updated_at` (heartbeat).
3. When no rows still match → `backfill_status = 'done'`.

**Resilience properties:**
- **Idempotent & self-resuming.** "Rows still matching `old_clue_text`" is the
  work queue; a patched row no longer matches, so a crashed/restarted worker
  simply re-queries the remainder. Re-applying a correction is a no-op.
- **Per-grid failure isolation.** A row that fails to patch is logged and skipped
  (recorded in `backfill_error`), it does not block the batch; the job can be
  retried. A stale `backfill_updated_at` on a `running` row lets a supervisor
  reclaim a stuck job.
- **Progress polling.** `GET /v1/corrections/{correctionId}` returns
  `{ status, gridsMatched, gridsPatched }`. The queue UI polls it to show
  "Correction en cours — 12/40 grilles".

### Offline export → durable corpus

A worker sub-command / script flushes un-exported corrections into
`data/curated/clue_overrides_fr.csv` (the override file the Python
`assemble_corpus.py` already merges), stamping `exported_at`. This keeps the
authoritative offline corpus in sync so a future full rebuild reproduces the
corrections without relying on the runtime overlay forever. Cadence and whether
it opens a PR to the corpus repo are an implementation detail for the wave.

### Frontend — `/signalements` "corriger" action

In `SignalementQueue.tsx`, each grouped report gains, alongside "handled"/
"reject", a **Corriger** control that opens a small form:

- **Remplacer la définition** → text input for the corrected clue → `POST /v1/corrections {kind:'replace', oldClueText, wordText?, newClueText}`.
- **Interdire cette définition** → `POST /v1/corrections {kind:'forbid_clue', oldClueText, wordText?}`; on a `409`/last-clue rejection, show "cette définition est la seule du mot — corrige le texte ou blackliste le mot".
- **Blacklister le mot** (Wave 3) → destructive path; requires typing the word to
  confirm, shows the count of grids to be regenerated + progress orphaned.

On a `202`, the frontend immediately calls the existing survey
`POST /v1/signalements/{reportId}/decision {decision:'action'}` to mark the report
handled (the correction is already durable; backfill converges in the background),
then **polls `GET /v1/corrections/{id}`** to show live progress
("Correction en cours — 12/40 grilles" → "Terminé"). Copy uses **tutoiement**. If
the survey `action` fails after a successful correction, surface a retry — the
correction is already durable and idempotent.

---

## Waves (each ≤400-line PRs, schema-first per ADR-0001 §3)

**Wave 1 — foundation + Replace text**
1. **ADR** (next number, assign by PR#) — "Grid clue corrections & moderation":
   the corrections store, the generation overlay, the offline export, and the
   `admin:signalements` capability. Includes the **threat model** for the
   auth/authz change. Update `docs/adr/INDEX.md` in the same PR.
2. **Schema-only PR** — `grid/api/openapi.yaml`: `POST /v1/corrections`
   (`replace` first, returns `202` + `correction_id`) and
   `GET /v1/corrections/{id}` (progress: status + gridsMatched/gridsPatched),
   RFC-7807 errors, `admin:signalements` documented. (ADR-0003 conventions: UUID
   v7, explicit required/nullable.)
3. **identity** — mint + grant `ADMIN_SIGNALEMENTS` to maintainer; tests.
4. **grid producer** — migration (corrections table + backfill-tracking columns),
   `ClueCorrection` domain, record use case (fast `202` write), route +
   `requireCapability` guard, `CorrectionAwareWordRepository` overlay (reads at
   gen time), progress-query endpoint, offline export command. TDD; JSONB
   round-trip is a property test. *(May split into schema-vs-size sub-PRs to
   respect the 400-line cap.)*
5. **grid worker** — durable backfill loop: claim pending corrections, count +
   batch-patch matching grids, heartbeat, per-grid failure isolation, resume on
   restart. NATS kick + poll backstop. Crash/resume + idempotency tests.
6. **frontend** — `admin:signalements` gate swap + "Corriger → Remplacer" form +
   survey `action` composition + progress polling UI; MSW tests.

**Wave 2 — Forbid clue**
- Schema: add `kind:'forbid_clue'` + the last-clue `409`.
- grid: forbid in overlay + backfill re-pick; endpoint guard rejecting last-clue
  forbid.
- frontend: "Interdire cette définition" + rejection copy.

**Wave 3 — Blocklist word + regeneration (separate spec)**
- Its own design doc: dropping the word from corpus, **regenerating** affected
  stored grids (ADR-0081 mints fresh `puzzle_id` → **orphans saved progress**),
  the player-progress policy (accept orphaning as a safety trade-off? notify?),
  daily vs on-demand solo handling, and the extra gating (typed-word confirm,
  audit, impact preview). Do **not** start until this spec is written and approved.

## Testing

- Domain/application: TDD, near-100% on correction application; property test the
  `PuzzlePayload` JSONB round-trip through a replace/forbid.
- Overlay: generating after a correction never emits the corrected-away clue.
- Backfill idempotency: applying twice == once.
- Backfill resilience: interrupt the worker mid-batch and restart — it resumes on
  the remaining unmatched rows and reaches `done` with correct `grids_patched`; a
  single failing grid does not abort the job; progress counters are monotonic.
- Auth: a `player`-capability session gets `403`/`404` on every correction route;
  only `admin:signalements` passes.
- Frontend: MSW-backed queue test that "Corriger → Remplacer" fires both calls and
  the last-clue forbid renders the rejection copy.

## Out of scope

- Word-blocklist + regeneration (Wave 3, separate spec).
- Editing anything other than clue text on a grid (letters, layout).
- A general corpus-editing admin UI (this is report-driven correction only).
- Undo/history UI (the `clue_corrections` rows are the audit trail; no revert UI
  in these waves).

## Resolved during planning

- **Backfill trigger = polling CronJob.** The grid worker is a one-shot CLI
  (ADR-0042 pattern), not a long-running NATS consumer. The backfill runs as a
  `grid-worker --process-corrections` sub-command driven by a k8s CronJob every
  few minutes, draining pending corrections. Durable + resumable + resilient with
  no new messaging surface; an in-process prompt kick can be added later.
- **grid/ has no capability/session plumbing today.** Wave 1 ports survey's
  `SessionMiddleware` + `IdentityClient` + a capability guard into grid/api
  (generalized as `requireCapability(cap)`).

## Still open (non-blocking)

- Whether the offline export opens a PR to the corpus repo or just writes the CSV
  for the next pipeline run.
