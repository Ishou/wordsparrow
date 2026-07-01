# Orchestration log — multiplayer word-validation fix (ADR-0084)

Append-only event ledger for maintainer review. Newest at the bottom.

## Standing decisions

- **2026-07-01 — Autonomy grant.** Maintainer: *"go through it autonomously
  till PR & merge & prod deploy"* and, as a bonus if finished early, *"multiplayer
  validated word should be colored according to the player that found them (if
  another player validates a crossing word, the first validated color stays on
  the crossed letter)"*. Interpreted as explicit merge + deploy authority for the
  ADR-0084 rollout, with the hard safety rules in the procedure (never force
  risky infra to prod; never reopen ADR-0076 for clients; escalate over break).
- **Root cause (confirmed).** grid PR #1170 (ADR-0076 binary `/validate`) dropped
  `incorrectCells`; game-api's `HttpWordValidator` still requires it →
  deserialization throws → swallowed in `UpdateCellUseCase` → no co-op word ever
  locks. Clean regression; not caught because game tests use an in-memory
  validator fake and there is no `HttpWordValidator` wire-shape test.
- **Design decisions (maintainer-chosen).** Internal per-word grid endpoint (not
  restore incorrectCells on the client endpoint); isolation = both service-token
  AND not-publicly-routed; transport HTTP not NATS; add client-side shake on
  validation timeout.

## Events

- 2026-07-01 — **P0 dispatched+opened.** ADR-0084 authored, INDEX.md updated,
  PR **#1241** opened (`docs/adr-0084-internal-word-validation`). State: OPEN,
  awaiting CI + §6a review.
- 2026-07-01 — **P1 authored+opened (by orchestrator, not dispatched).** grid
  `validate-word` schema + `serviceToken` scheme + regenerated grid types. PR
  **#1242** opened, base = the ADR branch (stacked). spectral clean locally.
  State: OPEN. On P0 merge, retarget+rebase per procedure "Stacked-PR handling".
- 2026-07-01 — **P0 MERGED.** #1241 §6a review "LGTM, no findings"; all gates
  green; squash-merged. ADR-0084 confirmed on main.
- 2026-07-01 — **P1 retargeted+rebased.** #1242 base → main;
  `git rebase --onto origin/main` dropped the duplicated ADR commit; force-pushed
  `feat/grid-validate-word-schema` (now a single schema commit on main). CI
  re-running. Next: merge P1 on LGTM, then dispatch P2 (grid impl).
- 2026-07-01 — **Autonomous cron armed.** Ticks every ~6 min to drive P1→P5 per
  the procedure. Standing authority + hard safety rules apply.
