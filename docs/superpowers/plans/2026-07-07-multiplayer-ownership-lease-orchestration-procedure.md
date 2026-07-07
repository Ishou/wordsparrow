# Multiplayer Ownership Lease — Orchestration Procedure (cron-driven)

Cron-fired tick procedure for the multiplayer-ownership-lease multi-PR rollout.

**Cron schedule:** `*/2 * * * *` (every 2 min; recreate if the rollout runs past the cron's lifetime).

**CWD:** run from repo root (`cd "$(git rev-parse --show-toplevel)"`).

**Spec:** ADR-0098 (`docs/adr/0098-multiplayer-ownership-lease.md`, merged to `main`).
**Plan (full per-task TDD steps + interfaces):** `docs/superpowers/plans/2026-07-07-multiplayer-ownership-lease.md`.
**State source of truth:** `docs/superpowers/plans/2026-07-07-multiplayer-ownership-lease-orchestration-log.md` + live GitHub PR state.

## Standing maintainer authorization (recorded 2026-07-07)

Maintainer answered the merge-authority question with **"usual pr cron"** — granting the orchestrator standing authority to run the autonomous cron and to **merge each rollout PR itself** when BOTH hold:

1. An automated §6a **LGTM**: the `github-actions` / `claude-review` review body's first line is `LGTM` (case-insensitive), OR the 3c-loop-terminator fired and the verdict was effectively-resolved.
2. **All blocking checks green** AND `mergeable == MERGEABLE` AND `mergeStateStatus != BLOCKED`.

Blocking checks: `build (*)` matrix, `submit-gradle`, `commitlint`, `branch-name`, `dco`, `gitleaks`, `dependency-review`, `regen-and-diff`, `spectral`, `adr-index-coherence`, `bounded-context-coherence`, `survey-export-csv-byteequal`, and any `helm-lint`/`api-chart-lint` if present.
Informational (NEVER gate): `claude-review` check status itself (verdict is read from the review body, not the check), `Analyze (java-kotlin)` / CodeQL, `deploy` previews, `ai-gate`/`dispatch` (skipping).

Merge command: `gh pr merge <pr#> --squash` (NO `--delete-branch` — it triggers a local prune that collides with agent worktrees holding `main`).

The orchestrator invokes the ADR-0001 §4 400-line soft-target override proactively when a coherent single-layer workstream warrants it; PR body cites the §4 2026-05-25 amendment. Do NOT impersonate the maintainer in comments.

## Phase map

Implementer ≠ reviewer (ADR-0001 §6a). All branches base off `main`. Tasks 1-3 done.

| Phase | Branch | PR title prefix | Depends on | Status |
|---|---|---|---|---|
| T2 schema | `chore/game-ownership-claim-schema` | `chore(api-game):` | — | **OPEN #1441** |
| T3 domain | `feat/game-domain-ownership-lease` | `feat(game-domain):` | — | **OPEN #1440** |
| T4 application | `feat/game-application-ownership-lease` | `feat(game-application):` | T3 merged | pending |
| T5 infrastructure | `feat/game-infra-ownership-queries` | `feat(game-infrastructure):` | T4 merged | pending |
| T6 GC sweep | `feat/game-gc-ownerless-sweep` | `feat(game-application):` | T5 merged | pending |
| T7 api | `feat/game-api-claim-and-leave-split` | `feat(game-api):` | T2 **and** T4 merged | pending |
| T8 frontend | `feat/frontend-owned-game-modal` | `feat(frontend-game):` | T2 **and** T7 merged | pending |

### Per-phase scope brief (full TDD steps: see the plan file, Tasks 4-8)

- **T4 application** — `findActiveByOwnerUser` (WAITING+IN_PROGRESS by `owner_user_id`) replaces `findWaitingByOwnerUser` in `CreateLobbyUseCase`; `ClaimLobbyOwnershipUseCase` (present + ownerless + quota-gated; `UseCaseError.QuotaExceeded`/`NotPresentInLobby`/`AlreadyOwned`); `RelinquishOwnershipUseCase` (owner-only → `lobby.relinquishOwner(now)` + drop caller seat); keep `LeaveLobbyUseCase` NOT touching `owner_user_id` (pin with a test); add `findIdleOwnerless` to the port; flip the two IN_PROGRESS-exclusion quota tests. `/jvm-backend`.
- **T5 infrastructure** — Postgres + InMemory `findActiveByOwnerUser` (keyed on `owner_user_id` column, NOT the owner-seat join) + `findIdleOwnerless`; `eraseSession` RGPD rule 2 → **vacate** (`owner_user_id = NULL` + `owner_session_id` = zero-UUID sentinel) instead of transfer; adapt the erasure cascade + repo tests (Testcontainers). `/jvm-backend`.
- **T6 GC** — `LobbyGarbageCollector` gains `ownerlessTtl` (default 7d) + an ownerless sweep via `findIdleOwnerless`; fix the ADR-0039→0055 GC-matrix comment. `/jvm-backend`.
- **T7 api** — mount `POST /v1/lobbies/{lobbyId}/ownership` (claim; `withUserLock`, capability read like create); split the explicit `leaveLobby` WS frame (→ relinquish ownership) from the disconnect **grace** path (→ presence-drop only, keep `owner_user_id`) in `LobbyWebSocketRoute.kt`; wire the two use cases in `Module.kt`. `/jvm-backend`.
- **T8 frontend** — `useCreateOrResume` hook + `OwnedGameModal` (create-response `state === 'IN_PROGRESS'` ⇒ modal: rejoin / sole-occupant new-game=relinquish+create / subtle `useCanSubscribe` hint); wire the 3 create sites (`HomeScreen.handleCreateCoop`, `GrillesArchiveScreen`, `lobby.$lobbyId`); `claimOwnership` client method + "Reprendre la partie" button in `LiveCoopScreen`. `/frontend`.

## Tick procedure

One action per tick. Be concise: one line per phase examined + the action taken.

1. `cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet`.
2. Walk the phase map top-to-bottom. For each phase, resolve its PR by branch (`gh pr list --head <branch> --state all --json number,state`):
   - **MERGED** → phase done, continue to next.
   - **CLOSED (not merged)** → escalate (log ACTION, `CronDelete` self, exit).
   - **OPEN** → assess via the open-PR decision tree; act on the FIRST match, then STOP the tick.
   - **No PR yet** AND every dependency in the "Depends on" column is MERGED → dispatch the implementer for this phase (template below), log it, STOP.
   - **No PR yet** AND a dependency is not merged → this phase is blocked; continue scanning (an earlier open phase will usually be the actionable one).

### Open-PR decision tree (act on first match)

- **3a. Ready to merge.** All blocking checks `pass`, `mergeable==MERGEABLE`, `mergeStateStatus!=BLOCKED`, and the latest review body first line is `LGTM` (or 3c-terminator resolved). → `gh pr merge <pr#> --squash`. Log `MERGED`.
- **3b. Auto-review alive.** `claude-review` check is `IN_PROGRESS`/`QUEUED`, or a Claude review workflow ran on the branch in the last 15 min. → wait.
- **3c. Findings, no fixer activity.** Latest review starts with `Findings —`, no review workflow running now, no new commit since the review.
  - **3c-loop-terminator:** if this cycle's first finding is structurally identical (same rule + location + fix-shape) to the prior cycle's first finding AND the diff changed between reviews → the loop is stuck. If it's the 400-line target: dispatch a body-edit fixer citing the §4 soft-target override, then a manual reviewer. Else: escalate (log ACTION, `CronDelete`, exit).
  - Else → dispatch a manual fixer (template below), budget 3 passes/phase.
- **3d. CI done, no review yet.** All blocking checks terminal, reviews empty, no review workflow running → dispatch a manual reviewer (template below).
- **3e. CI running.** Otherwise → wait.

## Implementer agent prompt template

Dispatch with `Agent({ subagent_type: "general-purpose", isolation: "worktree", description: "<phase> impl", prompt: <below> })`. Build the prompt from the **dispatch skill's "Concrete prompt template"** plus:

1. Identity: "PR for <phase> of the multiplayer-ownership-lease rollout." Point at ADR-0098 (on main) + the plan file (Task N section) for full TDD steps + interfaces.
2. **MANDATORY READING** — run `scripts/adr-context.sh <every path this phase touches>` and inline its full output; instruct the agent to read ADR-0098 in full. For game/: ADR-0018, ADR-0055 (note the ADR-0039→0055 mislabel), ADR-0083. For frontend/: ADR-0002, ADR-0050.
3. The per-phase scope brief (above) verbatim + the plan's Task-N steps.
4. Domain skill pointer: `/jvm-backend` (T4-7) or `/frontend` (T8) or `/schemas`.
5. Comment-style preflag (dispatch skill, verbatim).
6. CI auto-fix loop using `gh pr checks <pr#> --watch` (dispatch skill, gh-adapted); 3-pass budget.
7. Ship: branch = phase-map branch; `git commit -s`; `gh pr create --base main`; PR body references the phase + ADR-0098.
8. Report-back < 250 words.

## Manual reviewer dispatch prompt

Dispatch (background): "Invoke the `/reviewer` skill. Review PR #<n> (`gh pr diff <n>`) for the multiplayer-ownership-lease rollout against ADR-0098 + the repo rules, IN-SCOPE only (this phase's deliverable). Post `LGTM, no findings.` or `Findings — <n>. <cite rule + file:line + proposed fix per finding>` via `gh pr review <n> --approve` (fall back to `--comment` if the same-actor token rejects approve — the merge gate still matches `LGTM` as the first line). You are NOT the implementer."

## Manual fixer dispatch prompt

Dispatch (background): "Fix PR #<n> of the multiplayer-ownership-lease rollout. Fetch open findings via `gh pr view <n> --json reviews` and `gh api` review comments. Address each in its own worktree off the PR branch, push, and reply mapping finding → commit SHA. Re-run local validation (`/jvm-backend` or `/frontend`). Budget 3 passes; if a finding cannot be resolved by code, comment why and stop."

## Logging format

Append to the log file, one line per event: `- <ISO-8601 or tick-N> · <PHASE> · <MERGED|DISPATCHED impl|DISPATCHED reviewer|DISPATCHED fixer|WAIT reason|ACTION escalation> · <pr# / branch / note>`.
