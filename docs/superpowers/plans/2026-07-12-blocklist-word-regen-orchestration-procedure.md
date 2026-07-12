# Blocklist Word + Regeneration — Orchestration Procedure (cron-driven)

Cron-fired tick procedure for the Wave 3 (blocklist-word) rollout. Same machinery as the ADR-0108 rollout (`2026-07-12-grid-clue-corrections-orchestration-procedure.md`) — that file is the canonical reference for the tick decision tree and prompt templates; this one carries the Wave 3 phase map + standing authorization.

**Cron:** `*/2 * * * *`. **CWD:** `cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet`. **Repo:** `Ishou/wordsparrow`. **Source of truth:** the spec/plan/this file — read from `origin/docs/adr-blocklist-word` until PR1 merges, then `origin/main`. **Log:** `2026-07-12-blocklist-word-regen-orchestration-log.md`.

## Standing maintainer authorization (recorded 2026-07-12)

- **Merge authority:** orchestrator merges a phase PR on §6a LGTM + green blocking-CI (or the 3c-loop-terminator resolution). Granted in-session.
- **400-line soft cap:** standing authorization to invoke the ADR-0001 §4 2026-05-25 override proactively; pre-flag it in cap-heavy PR bodies (P3, P4) from the first push.
- **Autonomy:** autonomy on execution; escalate only on a genuine blocker (3 failed fix-cycles, CLOSED-not-merged phase, or an ambiguous product/design decision).
- **Progress policy (decided):** rely on ADR-0105 for player progress; NO server-side orphaned-`puzzle_progress` cleanup (ADR-0110 §3). Do not let a reviewer reopen this as a blocking finding — cite ADR-0110 §3.

## Phase map (strictly sequential — dispatch phase N only when N-1 is MERGED)

| Phase | Branch | Base | PR title prefix | Scope (plan section) |
|---|---|---|---|---|
| P1 | `docs/adr-blocklist-word` | main | `docs(adr): add ADR-0110 blocklist word` | ADR-0110 + spec + plan + this procedure. |
| P2 | `feat/blocklist-word-schema` | main | `feat(api-grid): blocklist-word endpoints + migration schema` | Plan P2. Migration V<next> (kind CHECK += blocklist_word, old_clue_text nullable) + openapi `POST /v1/corrections/blocklist-word` (202) + `GET /v1/corrections/blocklist-preview` + regen frontend types. |
| P3 | `feat/blocklist-word-producer` | main | `feat(grid): blocklist_word correction + preview endpoint` | Plan P3. Kind.BLOCKLIST_WORD + applyTo null-drop; record path (skip last-clue guard); preview count query; the two endpoints; wiring. Cap-heavy → cite §4. |
| P4 | `feat/blocklist-word-backfill` | main | `feat(grid): blocklist backfill — regenerate dailies, delete solo` | Plan P4. Match-on-word; regen-daily via EnsureUpcomingDailiesUseCase.execute(date,force=true); delete-solo; dispatch by kind; resume/idempotency/failure-isolation tests. Cap-heavy → cite §4. |
| P5 | `feat/frontend-blocklist-word` | main | `feat(frontend-grid): blacklister le mot action` | Plan P5. "Blacklister le mot" + impact preview + typed-word confirm + progress polling; MSW + a11y. |

## Tick procedure

Follow the ADR-0108 procedure's tick decision tree verbatim (steps 1-5 + the open-PR 3a–3e tree + 3c-loop-terminator + identical-finding heuristic), substituting THIS phase map. Take at most one action per tick; append a log line on dispatch/merge/escalate. When P5 is MERGED → append `**ACTION:** Wave 3 rollout complete; clean up worktrees; remind maintainer re export (#1564) + edge-purge follow-ups`, `CronDelete` self, stop.

### Per-phase adr-context paths (run `scripts/adr-context.sh <paths>`, inline under MANDATORY READING when dispatching)

- **P2:** `grid/api/src/main/resources/db/migration/ grid/api/openapi.yaml frontend/src/infrastructure/api/grid/types.ts`
- **P3:** `grid/domain/src/main/kotlin/com/bliss/grid/domain/correction/ClueCorrection.kt grid/application/src/main/kotlin/com/bliss/grid/application/correction/RecordCorrectionUseCase.kt grid/api/src/main/kotlin/com/bliss/grid/api/routes/CorrectionRoute.kt grid/api/src/main/kotlin/com/bliss/grid/api/Module.kt`
- **P4:** `grid/application/src/main/kotlin/com/bliss/grid/application/correction/ProcessCorrectionsUseCase.kt grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/PostgresGridBackfill.kt grid/application/src/main/kotlin/com/bliss/grid/application/puzzle/EnsureUpcomingDailiesUseCase.kt grid/worker/src/main/kotlin/com/bliss/grid/worker/Main.kt`
- **P5:** `frontend/src/ui/components/signalements/SignalementQueue.tsx frontend/src/ui/components/signalements/CorrectionForm.tsx frontend/src/application/correction/applyCorrection.ts`

Every implementer prompt: inline ADR-0110 + the adr-context output; invoke `/jvm-backend` (P2–P4 schema via `/schemas`) or `/frontend` (P5); HARD comment-style guard (one line only; grep added lines before push); tutoiement (P5); DCO `-s`; lowercase-leading commit subject (commitlint). Implementer prompt template, manual reviewer/fixer templates, and logging format: reuse the ADR-0108 procedure's verbatim.

## Known gotchas carried from the ADR-0108 rollout

- The §6a auto-fixer stalls on substantive logic (dispatch a manual fixer after ~1 tick of a stalled `claude-review` run) but does land trivial comment/config fixes — check the branch tip before dispatching a manual fixer to avoid a duplicate.
- Commit subject must not lead with an uppercase token (`ADR-0110 …` fails `subject-case`); use `add ADR-0110 …`.
- Merge with `gh pr merge <#> --repo Ishou/wordsparrow --squash` + an explicit lowercase `--subject`; no `--delete-branch`.
- Comment-style (multi-line blocks) is the recurring §6a finding — pre-empt at write time and grep before every push.
