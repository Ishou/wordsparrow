# Grid Clue Corrections — Implementation Plan (Waves 1–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Repo workflow overrides:** This is a Bliss multi-context rollout. Each PR below is a separate branch/PR of ≤400 diff lines, merged before the next per ADR-0001 §3 (schema-first) and §6a (review). Dispatch via the `dispatch` skill; each implementer prompt is prepended with `scripts/adr-context.sh` output for the paths it touches. TDD for domain logic; Spotless + Konsist must be green. Commits are conventional + `-s` (DCO).

**Goal:** Let a maintainer correct a flagged definition from the `/signalements` queue so the fix lands in the corpus (future grids) and, asynchronously and durably, in every already-generated grid that used it.

**Architecture:** A new `clue_corrections` store in `grid/`. Recording a correction is a fast `202` write; a `CorrectionAwareWordRepository` overlay makes future generation clean immediately; a polling `grid-worker --process-corrections` CronJob backfills all stored-grid `puzzles.payload` JSONB idempotently with progress tracking. A new maintainer-only `admin:signalements` capability gates the correction routes. The `/signalements` UI composes the grid-correction call + the existing survey `action` decision + progress polling.

**Tech Stack:** Kotlin 2.3 + Ktor 3 on JDK 21, Postgres (CNPG) + Flyway (grid); React 19 + TanStack Router + Panda CSS + Vitest + MSW (frontend); OpenAPI-first (grid/api/openapi.yaml).

## Global Constraints

- PR diff cap **400 lines** (excl. generated/blank); one workstream per PR (ADR-0001 §4). Invoke the standing cap-override only if a single indivisible unit exceeds it.
- **Schema-first:** the openapi PR (PR2) merges before any producer/consumer touches the new endpoints (ADR-0001 §3, ADR-0003).
- **No `println`/`console.log`; no string concatenation in log messages** — structured logs with correlation ids.
- **Comments:** single-line, non-obvious *why* only. No multi-line comment blocks in new code.
- **French copy uses tutoiement** ("tu", never "vous").
- **Capability wire strings** are stable API/event spellings; `admin:signalements` is namespaced-with-colon (matches `billing:subscribe`, `grilles:all`).
- **Correction identity = the `clueText` string** (+ `word` for blocklist-word, Wave 3). Matching is text-join; there is no clueId.
- Auth/authz change ⇒ the ADR (PR1) carries a **threat model** before review.
- Update `docs/adr/INDEX.md` in the ADR PR (registry-coherence gate). ADR number assigned by PR number (serialization point) — assigned `ADR-0108` (minted in the PR1 commit).

---

## File Structure (Wave 1)

**identity** (PR3)
- Modify: `identity/domain/src/main/kotlin/com/bliss/identity/domain/user/Capability.kt` — add `ADMIN_SIGNALEMENTS`, grant to `MAINTAINER`.
- Test: `identity/domain/src/test/kotlin/com/bliss/identity/domain/user/CapabilityTest.kt`.

**grid schema** (PR2)
- Modify: `grid/api/openapi.yaml` — `POST /v1/corrections`, `GET /v1/corrections/{correctionId}`, schemas, RFC-7807 errors.
- Generated: `frontend/src/infrastructure/api/grid/types.ts` (regen via `pnpm api:check`).

**grid domain/application/infrastructure/api** (PR4)
- Create: `grid/domain/src/main/kotlin/com/bliss/grid/domain/correction/ClueCorrection.kt` — value type + `kind` enum + apply-to-`Word` logic.
- Create: `grid/application/src/main/kotlin/com/bliss/grid/application/correction/CorrectionRepository.kt` (port), `RecordCorrectionUseCase.kt`, `CorrectionProgress.kt`.
- Create: `grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/PostgresCorrectionRepository.kt`.
- Create: `grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CorrectionAwareWordRepository.kt` — decorator over `CsvWordRepository`.
- Create: `grid/api/.../auth/SessionMiddleware.kt`, `grid/api/.../auth/CapabilityGuard.kt` (`requireCapability`), `grid/infrastructure/.../identity/IdentityClient.kt` (ported from survey).
- Create: `grid/api/src/main/kotlin/com/bliss/grid/api/routes/CorrectionRoute.kt`, `grid/api/.../dto/CorrectionDtos.kt`.
- Create migration: `grid/api/src/main/resources/db/migration/V10__clue_corrections.sql`.
- Modify: `grid/api/.../Module.kt` / `Main.kt` — install middleware, wire routes + repository, swap `WordRepository` to the decorator.

**grid worker** (PR5)
- Create: `grid/application/.../correction/ProcessCorrectionsUseCase.kt`, `grid/application/.../correction/GridBackfillPort.kt`.
- Create: `grid/infrastructure/.../persistence/PostgresGridBackfill.kt` — JSONB match + patch.
- Modify: `grid/worker/src/main/kotlin/com/bliss/grid/worker/Main.kt` — `--process-corrections`.
- Create: `infra/platform/charts/grid-worker/templates/corrections-cronjob.yaml` (+ values), regen `make diagrams`.

**frontend** (PR6)
- Modify: `frontend/src/ui/routes/signalements.lazy.tsx` — gate `admin:signalements`.
- Modify: `frontend/src/ui/components/signalements/SignalementQueue.tsx` — "Corriger" action.
- Create: `frontend/src/ui/components/signalements/CorrectionForm.tsx`, `frontend/src/application/correction/applyCorrection.ts`, `frontend/src/infrastructure/api/grid/correctionClient.ts`.
- Tests under `frontend/tests/`.

---

## PR1 — ADR + governance (Wave 1 gate)

**Files:**
- Create: `docs/adr/0108-grid-clue-corrections.md`
- Modify: `docs/adr/INDEX.md`

**Interfaces:** Produces the canonical decisions all later PRs cite. No code.

- [ ] **Step 1: Write the ADR** using the repo template (Status: Accepted). Context: the two-write problem (corpus offline vs frozen JSONB), report carries only `clueText`. Decision: corrections store in `grid/`; `clueText` identity; overlay at gen time; async durable polling-CronJob backfill; `admin:signalements` maintainer-only capability; operations Replace / Forbid-clue (reject last-clue) / Blocklist-word (Wave 3). Consequences + a **Threat model** section: who can call (maintainer only, deny-by-default), abuse (a compromised maintainer session can rewrite clues → mitigations: audit rows `created_by`, no player path), blast radius, the destructive blocklist-word gating deferred to Wave 3.
- [ ] **Step 2: Add the INDEX.md path→ADR rows** for `grid/**/correction/**`, `grid/api/src/main/resources/db/migration/V10__*`, `grid/api/openapi.yaml` (corrections), `identity/domain/**/Capability.kt`.
- [ ] **Step 3: Commit & PR.** `git commit -s -m "docs(adr): add ADR-0108 grid clue corrections & moderation"` (leading lowercase word — commitlint `subject-case` rejects an `ADR-0108`-leading subject). Merge on §6a LGTM + green CI before PR2.

---

## PR2 — Schema-only (grid/api/openapi.yaml)

**Files:**
- Modify: `grid/api/openapi.yaml`
- Generated (consumer, same PR only if drift-gate requires; otherwise PR6): `frontend/src/infrastructure/api/grid/types.ts`

**Interfaces:**
- Produces the wire contract every later PR implements:
  - `POST /v1/corrections` → `202` `{ correctionId: uuid, backfillStatus: "pending" }`.
  - `GET /v1/corrections/{correctionId}` → `200` `CorrectionProgress { correctionId, kind, backfillStatus: pending|running|done|failed, gridsMatched: int|null, gridsPatched: int }`.
  - Request `CorrectionRequest` (oneOf by `kind`): `{ kind: "replace", oldClueText, wordText?, newClueText }` and `{ kind: "forbid_clue", oldClueText, wordText? }`. (`blocklist_word` added in Wave 3.)
  - Errors: `403` forbidden, `409` `LAST_CLUE_FORBIDDEN` (forbid would empty the word), `422` validation — all RFC-7807 `application/problem+json`.

- [ ] **Step 1: Add the two paths + schemas.** Follow ADR-0003: UUID v7 format, explicit `required`, explicit `nullable`, `operationId` per op (`submitCorrection`, `getCorrectionProgress`), problem+json responses. Reference the existing `ProblemDetails`/error style already in the file.
- [ ] **Step 2: Lint.** Run: `npx @stoplight/spectral-cli lint grid/api/openapi.yaml` (or the repo's `make openapi-lint` target). Expected: 0 errors.
- [ ] **Step 3: Regenerate + diff-check frontend types.** From `frontend/`: `pnpm api:check`. Expected: types regenerate; commit the regenerated `types.ts` so the `openapi-typescript-drift` gate is green.
- [ ] **Step 4: Commit & PR.** `git commit -s -m "feat(api-grid): corrections endpoints schema (ADR-0108)"`. Merge before PR4/PR6.

---

## PR3 — identity: mint `admin:signalements`

**Files:**
- Modify: `identity/domain/src/main/kotlin/com/bliss/identity/domain/user/Capability.kt`
- Test: `identity/domain/src/test/kotlin/com/bliss/identity/domain/user/CapabilityTest.kt`

**Interfaces:**
- Produces capability wire string `"admin:signalements"`, present in `capabilitiesFor(Role.MAINTAINER, *)`, absent for `PLAYER`/guest/tier.

- [ ] **Step 1: Write the failing test.**

```kotlin
@Test
fun `maintainer holds admin signalements, player does not`() {
    assertThat(capabilitiesFor(Role.MAINTAINER).map { it.wire }).contains("admin:signalements")
    assertThat(capabilitiesFor(Role.PLAYER).map { it.wire }).doesNotContain("admin:signalements")
    assertThat(capabilitiesFor(null).map { it.wire }).doesNotContain("admin:signalements")
}
```

- [ ] **Step 2: Run it, verify FAIL.** `./gradlew :identity:domain:test --tests '*CapabilityTest*'` → FAIL (no enum constant).
- [ ] **Step 3: Implement.** Add `ADMIN_SIGNALEMENTS("admin:signalements")` to the enum; add `Capability.ADMIN_SIGNALEMENTS` to the `Role.MAINTAINER` set in `roleCapabilities` only.
- [ ] **Step 4: Run tests, verify PASS.** `./gradlew :identity:domain:test spotlessCheck`.
- [ ] **Step 5: Commit & PR.** `git commit -s -m "feat(identity-domain): admin:signalements maintainer capability (ADR-0108)"`.

---

## PR4 — grid producer: store, overlay, record endpoint, auth plumbing

> Likely exceeds 400 lines across sub-concerns. **Split into PR4a/4b** if needed: 4a = auth plumbing + migration + domain/repo + overlay (no route); 4b = record use case + route + Module wiring. Prefer the split; each is independently testable.

**Files:** see File Structure. **Interfaces:**
- Consumes: `admin:signalements` (PR3), migration table (below), openapi shapes (PR2).
- Produces:
  - `ClueCorrection(kind: Kind, wordText: String?, oldClueText: String?, newClueText: String?)`; `enum Kind { REPLACE, FORBID_CLUE }` (Wave 3 adds `BLOCKLIST_WORD`); `fun Kind.applyTo(word: Word): Word?` (returns null ⇒ word dropped from corpus).
  - `interface CorrectionRepository { fun record(c: ClueCorrection, createdBy: UUID): UUID; fun active(): List<ClueCorrection>; fun progress(id: UUID): CorrectionProgress? }`.
  - `RecordCorrectionUseCase.execute(request, createdBy): Result` (rejects last-clue forbid via corpus check → `LastClueForbidden`).
  - `class CorrectionAwareWordRepository(delegate: WordRepository, corrections: () -> List<ClueCorrection>) : WordRepository`.
  - `ApplicationCall.requireCapability(cap: String): Boolean`.

### Migration

- [ ] **Step 1: Write `V10__clue_corrections.sql`** — table per spec (columns: `correction_id UUID PK, kind TEXT CHECK, word_text TEXT NULL, old_clue_text TEXT, new_clue_text TEXT NULL, reason TEXT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ default now(), exported_at TIMESTAMPTZ NULL, backfill_status TEXT NOT NULL default 'pending' CHECK in (pending,running,done,failed), grids_matched INT NULL, grids_patched INT NOT NULL default 0, backfill_error TEXT NULL, backfill_updated_at TIMESTAMPTZ NULL`). Index `WHERE backfill_status IN ('pending','running')`. One-line comment: expand-and-contract, no FK to puzzles (text-join identity).
- [ ] **Step 2: Migration test** (Testcontainers Postgres) asserting the table + check constraints exist. Run `./gradlew :grid:infrastructure:test`.

### Domain — correction application (TDD)

- [ ] **Step 3: Failing test** `ClueCorrectionTest`: `REPLACE` rewrites the matching `WordClue.text`; `FORBID_CLUE` drops the matching clue; forbidding a word's only clue returns `null`; non-matching clue text leaves the word unchanged.
- [ ] **Step 4:** Run → FAIL.
- [ ] **Step 5: Implement** `ClueCorrection` + `applyTo(word)` matching on `oldClueText` against `word.clues[*].text`. Keep pure (domain depends on nothing).
- [ ] **Step 6:** Run → PASS; `spotlessCheck`.

### Overlay decorator (TDD)

- [ ] **Step 7: Failing test** `CorrectionAwareWordRepositoryTest`: with a `REPLACE` correction active, `findByLength`/`findByLengthAndPattern` return words whose matching clue text is rewritten; with a `FORBID_CLUE` that empties a word, that word is absent from results; `countByLength`/`lettersAtPosition`/`containsLemma` stay consistent with the filtered set. Use an in-memory `WordRepository` fake as delegate (never mock our own class).
- [ ] **Step 8:** Run → FAIL.
- [ ] **Step 9: Implement** the decorator: map each delegate result through active corrections, drop null-yielding words. Read `corrections()` per call (cheap; small table) so mid-process corrections take effect.
- [ ] **Step 10:** Run → PASS.

### Repository adapter

- [ ] **Step 11: Test** `PostgresCorrectionRepositoryTest` (Testcontainers): `record` returns an id and persists; `active()` returns non-exported corrections; `progress(id)` maps columns.
- [ ] **Step 12: Implement** `PostgresCorrectionRepository` (UUID v7 ids). Run tests → PASS.

### Auth plumbing (ported from survey)

- [ ] **Step 13: Port** `SessionMiddleware` (attribute keys `UserIdKey`/`CapabilitiesKey`, `__Secure-ws_session` cookie, auth-optional) and `IdentityClient` (whoami verify) into `grid/api` + `grid/infrastructure`, adapting package names. Add `CapabilityGuard.kt` with generic `requireCapability(cap)` returning 403 RFC-7807 (mirror `ContribuerGuard`).
- [ ] **Step 14: Test** the guard: denies when `admin:signalements` absent, allows when present (Ktor `testApplication`).

### Record use case + route

- [ ] **Step 15: Failing test** `RecordCorrectionUseCaseTest`: valid `replace` records + returns id; `forbid_clue` on a word with ≥2 clues records; `forbid_clue` on a single-clue word returns `LastClueForbidden`. Uses in-memory `CorrectionRepository` + `WordRepository` fakes.
- [ ] **Step 16:** Run → FAIL. **Step 17: Implement** the use case (corpus check for last-clue via injected `WordRepository`). Run → PASS.
- [ ] **Step 18: Route test** `CorrectionRouteTest` (`testApplication`): `403` without capability; `202 {correctionId, backfillStatus:"pending"}` for a valid replace with a maintainer session; `409 LAST_CLUE_FORBIDDEN`; `GET /v1/corrections/{id}` returns progress.
- [ ] **Step 19: Implement** `CorrectionRoute` + `CorrectionDtos` (map to/from openapi shapes) guarded by `requireCapability("admin:signalements")`, reading `UserIdKey` for `created_by`. Wire in `Module.kt`: install `SessionMiddleware`, register route, construct repositories, **swap the injected `WordRepository` to `CorrectionAwareWordRepository(csvRepo) { correctionRepo.active() }`**.
- [ ] **Step 20:** `./gradlew :grid:api:test :grid:application:test :grid:infrastructure:test spotlessCheck` + Konsist arch tests → PASS. Verify grid-api Dockerfile still builds if `settings.gradle.kts` unchanged.
- [ ] **Step 21: Commit & PR** (or 4a/4b). `git commit -s -m "feat(grid): record clue corrections + generation overlay (ADR-0108)"`.

---

## PR5 — grid worker: durable backfill

**Files:** see File Structure. **Interfaces:**
- Consumes: `CorrectionRepository`, `PuzzlePayload`, `PostgresPuzzleRepository`.
- Produces: `ProcessCorrectionsUseCase.run(): Int` (count processed); `interface GridBackfillPort { fun countMatching(c): Int; fun patchBatch(c, limit): Int /* rows patched, 0 ⇒ done */ }`.

- [ ] **Step 1: Failing test** `PostgresGridBackfillTest` (Testcontainers): seed 3 puzzles whose payload contains `old_clue_text`; `countMatching` == 3; `patchBatch` rewrites `SerializedClue.text` at `chosenClueIndex` for `replace` and re-picks another clue for `forbid_clue`; after enough batches no rows match. Assert `puzzle_id` unchanged (progress preserved) and the payload round-trips via `PuzzlePayload.toGrid()`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `PostgresGridBackfill`: match rows via JSONB containment on `payload->'placements'` clue text (SQL `@>` or `jsonb_path_exists`; add GIN index in the migration if the planner needs it — amend V10 or add V11). Patch by deserializing `PuzzlePayload`, editing placements, re-serializing. `forbid_clue` re-pick reuses the generator's clue-selection over non-forbidden clues.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Failing test** `ProcessCorrectionsUseCaseTest`: a `pending` correction → sets `running`, `grids_matched`, patches to `done` with `grids_patched == grids_matched`; **resume**: interrupt after one batch and re-run → completes on remaining rows, counters monotonic, idempotent (second full run patches 0); **failure isolation**: a row that throws is recorded in `backfill_error` and does not abort the batch.
- [ ] **Step 6:** Run → FAIL. **Step 7: Implement** the use case (claim pending/running, count-then-batch loop, heartbeat `backfill_updated_at`, mark `done`). Run → PASS.
- [ ] **Step 8: Wire `--process-corrections`** in worker `Main.kt` (new `when` branch → build DB + repos → `ProcessCorrectionsUseCase.run()`), update `printUsage`.
- [ ] **Step 9: CronJob chart** `corrections-cronjob.yaml` (schedule e.g. `*/5 * * * *`, `concurrencyPolicy: Forbid`, same image/args pattern as the dailies CronJob). Run `helm lint` on the chart; `make diagrams` if topology changes; update `docs/infra/topology.yaml` if a new node/edge is introduced.
- [ ] **Step 10:** `./gradlew :grid:worker:build :grid:application:test :grid:infrastructure:test spotlessCheck` → PASS.
- [ ] **Step 11: Commit & PR.** `git commit -s -m "feat(grid): durable clue-correction backfill worker (ADR-0108)"`.

---

## PR6 — frontend: correction UI

**Files:** see File Structure. **Interfaces:**
- Consumes: generated grid types (PR2) for `POST /v1/corrections` + `GET /v1/corrections/{id}`; existing `surveyClient.decideSignalement`.
- Produces: `applyCorrection(input)` (calls grid, returns `{correctionId}`), progress hook polling `getCorrectionProgress`.

- [ ] **Step 1: Failing test** (Vitest + MSW) `CorrectionForm.test.tsx`: submitting "Remplacer" with corrected text calls `POST /v1/corrections {kind:'replace',...}` then survey `decideSignalement({decision:'action'})`; a `409 LAST_CLUE_FORBIDDEN` on a forbid renders the tutoiement rejection copy ("cette définition est la seule du mot — corrige le texte ou blackliste le mot").
- [ ] **Step 2:** Run `pnpm test CorrectionForm` → FAIL.
- [ ] **Step 3: Implement** `correctionClient.ts` (typed calls), `applyCorrection.ts` (compose grid + survey), `CorrectionForm.tsx` (Ark UI dialog: "Remplacer la définition" text input, "Interdire cette définition"; tutoiement copy; no `,99`/pressure language), and a `useCorrectionProgress` poll hook showing "Correction en cours — {patched}/{matched} grilles" → "Terminé".
- [ ] **Step 4: Wire** the "Corriger" control into `SignalementQueue.tsx` per grouped report (passes `oldClueText`=clue text, `wordText`, `reportId`).
- [ ] **Step 5: Gate swap** in `signalements.lazy.tsx`: `useCapabilityGate('admin:signalements')` (was `'contribuer'`); `denied` → `<NotFoundScreen/>`.
- [ ] **Step 6:** Run `pnpm test`, `pnpm typecheck`, `pnpm a11y` (dialog + focus) → PASS.
- [ ] **Step 7: Commit & PR.** `git commit -s -m "feat(frontend-grid): maintainer clue-correction action (ADR-0108)"`.

---

## Wave 2 — Forbid clue (follow-on, after Wave 1 merges)

Small delta on the same files:
- **Schema:** ensure `kind:'forbid_clue'` + `409 LAST_CLUE_FORBIDDEN` are present (they are, from PR2) — no change unless PR2 shipped replace-only; if so, a schema PR adds them.
- **grid:** `FORBID_CLUE` is already implemented in `ClueCorrection.applyTo`, the overlay, and the backfill re-pick (PRs 4–5). Wave 2's residual work is only whatever was deferred to keep PR4/5 replace-first. If PRs 4–5 shipped both kinds, **Wave 2 is already done** — collapse it into Wave 1 and note that in the ADR.
- **frontend:** "Interdire cette définition" button + rejection copy (PR6 already includes it per Step 1/3). Same collapse note.

> Decision for the executor: implement **both kinds** in PRs 4–6 (they share all machinery; forbid adds only a branch + a guard check + a button). Treat "Wave 2" as a checklist item, not a separate rollout, unless PR size forces replace-first.

---

## Wave 3 — Blocklist word + regeneration

**Not in this plan.** Write a separate spec + plan: dropping the word from the corpus, **regenerating** affected stored grids (ADR-0081 mints fresh `puzzle_id` → orphans saved progress), the progress-orphaning policy, daily vs on-demand-solo handling, and extra gating (typed-word confirm, audit, impact preview). Do not start until that spec is approved.

---

## Self-Review

**Spec coverage:**
- Entry point (maintainer, queue) → PR6. ✅
- Blast radius = all stored grids → PR5 backfill (JSONB match loop). ✅
- Corpus mechanism = runtime overlay → PR4 `CorrectionAwareWordRepository`; offline export → **gap: add an `--export-corrections` step**. See fix below. ✅ after fix
- Async/durable/resumable + progress polling → PR5 use case + `GET /v1/corrections/{id}` (PR2/PR4). ✅
- `admin:signalements` maintainer-only → PR3 + PR4 guard + PR6 gate. ✅
- Operations: Replace ✅, Forbid (reject last-clue) ✅, Blocklist-word → Wave 3 (out of scope, flagged). ✅
- Threat model → PR1 ADR. ✅
- Report marked handled immediately on 202 → PR6 compose. ✅

**Gap fix — offline export (add to PR5 or a small PR5.5):**
- Create `grid/application/.../correction/ExportCorrectionsUseCase.kt` + a `--export-corrections` worker branch that appends un-exported (`exported_at IS NULL`) corrections to `data/curated/clue_overrides_fr.csv` in that file's existing column shape and stamps `exported_at`. Test: exporting twice writes each correction once (idempotent on `exported_at`). Whether it opens a corpus-repo PR vs just writes the file stays the one open question — default to write-file, log a structured line. Add one INDEX.md/ADR line noting the export path.

**Placeholder scan:** none — every step names files, commands, and concrete test intent. Code is sketched at signature/test level (repo convention: implementers are dispatched with domain skills + ADR context); exact line-level bodies are derived by the implementer from the cited existing files (`ContribuerGuard.kt`, `SessionMiddleware.kt`, `IdentityClient.kt`, `PuzzlePayload.kt`, `WordRepository.kt`, worker `Main.kt`), all read during planning.

**Type consistency:** `ClueCorrection`/`Kind{REPLACE,FORBID_CLUE}`, `CorrectionRepository.{record,active,progress}`, `CorrectionAwareWordRepository`, `requireCapability`, `ProcessCorrectionsUseCase.run`, `GridBackfillPort.{countMatching,patchBatch}`, wire `admin:signalements`, `backfill_status` values — used consistently across PRs 2–6.
