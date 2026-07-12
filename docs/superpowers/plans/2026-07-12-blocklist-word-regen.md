# Blocklist Word + Regeneration — Implementation Plan (Wave 3)

> **For agentic workers:** implement task-by-task; each PR is a separate ≤400-line branch merged before the next (ADR-0001 §3 schema-first, §6a review). Dispatch via the `dispatch` skill; prepend `scripts/adr-context.sh` output per PR. TDD for domain logic; Spotless + Konsist green.

**Goal:** Let a maintainer blocklist an offensive WORD from the `/signalements` queue — dropping it from the corpus and scrubbing it from every already-generated grid (dailies regenerated, solo grids deleted) — with an impact preview + typed-word confirmation.

**Architecture:** Extends the merged ADR-0108 corrections layer. New `BLOCKLIST_WORD` kind (overlay already drops null-yielding words), a new regenerate-daily/delete-solo backfill strategy (patch-only backfill can't remove a word), a dedicated audited endpoint + dry-run preview, and a destructive frontend action. Governed by **ADR-0110**.

## Global Constraints

- PR diff cap 400 lines (soft; cite §4 override for coherent layers). One workstream/PR.
- Schema-first: the schema PR (P2) merges before producers/consumers.
- No `println`/`console.log`; structured logs. One-line comments only (no multi-line blocks — §6a flags every cycle).
- French copy = tutoiement.
- `admin:signalements` gates both new endpoints (merged in ADR-0108).
- Migrations expand-and-contract. Correction identity for this kind = `word_text` (folded); `old_clue_text` null.
- Implementers branch off `origin/main` (which has the full ADR-0108 corrections layer).

## P1 — ADR-0110 + governance (this bundle)

Files: `docs/adr/0110-blocklist-word-regeneration.md`, `docs/adr/INDEX.md`, the spec, this plan, the orchestration procedure + log. Docs only; ADR gates the implementation PRs (ADR-0001 §7).

## P2 — Schema-only

**Files:** `grid/api/src/main/resources/db/migration/V<next>__blocklist_word.sql` (+ its `grid/infrastructure/src/test/resources` mirror if one exists), `grid/api/openapi.yaml`, regenerated `frontend/src/infrastructure/api/grid/types.ts`.

- Migration (expand-and-contract): `ALTER TABLE clue_corrections DROP CONSTRAINT <kind_check>` and re-add with `kind IN ('replace','forbid_clue','blocklist_word')`; `ALTER COLUMN old_clue_text DROP NOT NULL`. Confirm the next free `V<n>` (V10 is taken by ADR-0108). One-line comment.
- OpenAPI: `POST /v1/corrections/blocklist-word` (`blocklistWord`) req `{ wordText (required, ≤64), reason? }` → `202 CorrectionAccepted`; errors 403/422. `GET /v1/corrections/blocklist-preview` (`blocklistPreview`) query `word` (required) → `200 { affectedDailies:int, affectedSolo:int }`; 403. RFC-7807 errors; document `admin:signalements`.
- `pnpm api:check`; `spectral lint`. Commit regenerated types.

## P3 — grid producer

**Files:** `grid/domain/.../correction/ClueCorrection.kt` (+ `Kind`), `grid/application/.../correction/RecordCorrectionUseCase.kt` + a `BlocklistPreview` query (port + `PostgresCorrectionRepository`/backfill), `grid/api/.../routes/CorrectionRoute.kt` (or a sibling route file) + DTOs, `Module.kt` wiring. Tests across domain/application/api.

- `Kind.BLOCKLIST_WORD("blocklist_word")` + `fromWire`. `applyTo(word)` → `null` when `foldedWordText == word.text` (unconditional; ignore clues). Domain test: drops the word, leaves others; overlay (`CorrectionAwareWordRepository`) omits it from `findByLength`/pattern (test with in-memory fake).
- `RecordCorrectionUseCase`: `BLOCKLIST_WORD` path records directly (skip the `recordForbidGuarded` last-clue guard); `word_text` required, `old_clue_text` null. Test: records without a last-clue rejection.
- Preview: a repo method counting affected `puzzles` split by `puzzle_date IS NULL` (match on payload placement `wordText`). Testcontainers test.
- Endpoints: `POST /v1/corrections/blocklist-word` (202, `created_by` from session, `requireCapability("admin:signalements")`) and `GET /v1/corrections/blocklist-preview` (counts). `testApplication` tests: 403 without cap; 202 records a blocklist_word row; preview returns counts.
- Do NOT build the backfill here (P4).

## P4 — grid worker (backfill strategy)

**Files:** `grid/application/.../correction/` (extend `ProcessCorrectionsUseCase` to dispatch by kind, or add `ProcessBlocklistUseCase` + port), `grid/infrastructure/.../persistence/` (new match-on-word query + regen/delete ops), worker wiring. Reuses the process-corrections CronJob.

- Match stored grids on `payload` placements where folded `wordText == word` (distinct from the chosen-clue match). Split by `puzzle_date`.
- **Daily** dates → `EnsureUpcomingDailiesUseCase.execute(date, force=true)` (window=1) per distinct date — appends a fresh-id row without the word. Inject the daily use case + generator into the worker path (already available for `--ensure-dailies`).
- **Solo** → `DELETE FROM puzzles WHERE puzzle_id = ?`.
- Durable/resumable: work queue = "rows still containing the word"; a regenerated daily's new latest row no longer matches, a deleted solo is gone → idempotent. Per-grid failure isolation, heartbeat, `grids_matched`/`grids_patched`.
- Tests (Testcontainers): seed a daily + solo containing the word → after run, the date has a new latest row without the word (new puzzleId) + the solo row is deleted; re-run patches 0; resume after interrupt; a failing row doesn't abort; preview count matches the processed count.

## P5 — frontend

**Files:** extend `frontend/src/ui/components/signalements/CorrectionForm.tsx` (or a sibling) + `SignalementQueue.tsx`; `frontend/src/application/correction/` (blocklist compose + preview); `frontend/src/infrastructure/api/grid/correctionClient.ts` (add `blocklistWord`, `blocklistPreview`). MSW tests + a11y.

- "Blacklister le mot" action, visible only when the group has `wordText` (disabled + hinted otherwise). Flow: fetch preview → render counts (tutoiement) → **typed-word confirm** (destructive button disabled until the word is typed exactly) → `blocklistWord` → survey `decideSignalement({action})` → poll progress (reuse the ADR-0108 `useCorrectionProgress` hook).
- Tests: preview counts render; button disabled until exact word typed; compose fires blocklist→action→progress; action hidden/disabled without wordText. a11y on the confirm dialog.

## Self-Review

- Corpus drop → P3 domain + no overlay change. ✅
- Scrub all affected (archive + solo) → P4 match-on-word + regen-daily/delete-solo. ✅
- Preview + typed-word confirm → P2 endpoint + P5 UI. ✅
- Progress via ADR-0105, no server cleanup → design decision, no task (intentional). ✅
- Threat model → P1 ADR. ✅
- Placeholder scan: migration version + route-file location are the two "confirm against the tree" items, flagged inline. No fabricated symbols.
- Types: `BLOCKLIST_WORD`/`blocklist_word`, `blocklistWord`/`blocklistPreview`, `affectedDailies`/`affectedSolo` consistent across P2–P5.
