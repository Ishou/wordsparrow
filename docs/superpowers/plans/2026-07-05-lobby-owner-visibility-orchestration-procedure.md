# Orchestration procedure — Lobby owner-visibility fix

Source-of-truth for the 2-minute cron tick. See the `dispatch` skill for
the canonical tick decision tree and open-PR decision tree; this file only
records the phase map, standing authorization, and the two agent prompt
templates. Blueprint: `2026-07-05-lobby-owner-visibility.md`.

## Standing maintainer authorization (2026-07-05)

Maintainer (colinutor@hotmail.com) said **"lgtm go for it + cron pls"** on
the fix approach in the design session.

- **Merge authority granted.** The orchestrator merges a phase PR when:
  every blocking check is `SUCCESS`, `mergeable: MERGEABLE`,
  `mergeStateStatus != BLOCKED`, AND the most recent §6a review body's
  first line is `LGTM` (case-insensitive). `gh pr merge <pr#> --squash`
  (no `--delete-branch` — collides with agent worktrees holding `main`).
- **§4 soft-target override, proactive.** Phase B is pre-flagged cap-heavy.
  The implementer cites the ADR-0001 §4 2026-05-25 soft-target amendment in
  the PR body from the first push. If the §6a reviewer re-flags the cap on a
  later cycle, apply the 3c-loop-terminator (body-edit fixer → fresh
  reviewer), do NOT escalate for the cap alone.
- Everything else escalates per the skill's step 5 (log + `CronDelete` self).

## Phase map

Walk in order. One action per tick. A phase's PR is discovered by branch
prefix on `origin` (`gh pr list --head <branch>` or search by title).

| # | Phase | Branch (implementer picks, prefix fixed) | Gate to next |
|---|-------|------------------------------------------|--------------|
| A | ADR-0066 amendment | `docs/adr-0066-owner-visibility-*` | PR A MERGED |
| B | Implementation | `fix/lobby-owner-visibility-*` | PR B MERGED → rollout complete |

Tick logic:

1. `cd $(git rev-parse --show-toplevel) && git fetch origin --quiet`.
2. Read this procedure. If it is not yet on `origin/main`, read from the
   setup branch: `git show origin/chore/lobby-owner-visibility-setup:docs/superpowers/plans/2026-07-05-lobby-owner-visibility-orchestration-procedure.md`.
3. **Phase A:** find PR A.
   - No PR A → dispatch the **Phase A agent** (template below). One action; stop.
   - OPEN → apply the skill's open-PR decision tree (review/fix/merge).
   - MERGED → go to Phase B.
   - CLOSED-not-merged → escalate.
4. **Phase B:** only if Phase A MERGED.
   - No PR B → dispatch the **Phase B agent**. One action; stop.
   - OPEN → open-PR decision tree.
   - MERGED → **rollout complete**: append the completion line to the log,
     `CronDelete` self, exit.
5. Append every action to the log file.

## Phase A agent prompt template

Dispatch with `Agent({ subagent_type: "general-purpose", isolation: "worktree", run_in_background: true, description: "Phase A · ADR-0066 owner-visibility amendment", prompt: <below> })`.

Before dispatching, the tick session runs
`scripts/adr-context.sh docs/adr/0066-cross-device-my-lobbies.md docs/adr/INDEX.md`
and inlines the output into the prompt under "MANDATORY READING".

> You are an implementation agent. **Phase A** of the lobby owner-visibility
> fix: amend ADR-0066 to record the owner-visibility parity decision. This
> is an ADR-only PR (ADR-0001 §7 — it must merge before the implementation).
>
> Read `docs/superpowers/plans/2026-07-05-lobby-owner-visibility.md` in full
> (root cause + fix + phase map). [INLINE adr-context output here.]
>
> Scope: append an "## Amendment 2026-07-05 — owner-visibility parity"
> section to `docs/adr/0066-cross-device-my-lobbies.md` stating: (1) the
> seat-only union in §1 is insufficient because the owner's `lobby_players`
> seat is deleted by the 30s WS leave-grace (`LeaveLobbyUseCase`), leaving no
> seat carrying the owner's `userId`; (2) the decision: add a nullable
> `owner_user_id` column on `lobbies`, set once at create, and give
> `findByUserId` an owner arm mirroring the existing `findBySessionId` owner
> arm; (3) this supersedes §3 ("No data migration") for this follow-up.
> Keep it tight — one screen. Update `docs/adr/INDEX.md` only if a
> path-glob binding is missing for the new migration path.
>
> DO NOT touch any code, migration, or test file. ADR + INDEX only.
>
> Ship: branch `docs/adr-0066-owner-visibility-parity` off `origin/main`;
> `git commit -s`; message `docs(adr-0066): owner-visibility parity for
> user-scoped lobby list`; open PR (owner `ishou`, repo `bliss`, base
> `main`), body = Why/What, reference the plan file. Conventional commit,
> DCO, no emojis. [INLINE the CI auto-fix loop block from the dispatch skill.]
> [INLINE the comment-style preflag.] Report back < 250 words: branch, PR
> URL, checks status.

## Phase B agent prompt template

Dispatch only after PR A is MERGED. Before dispatching, run
`scripts/adr-context.sh` for every path Phase B touches (migration, repo,
use case, domain) and inline under "MANDATORY READING". Tell the agent to
invoke `/jvm-backend` first.

> You are an implementation agent. **Phase B** of the lobby owner-visibility
> fix. ADR-0066 (amended, on `main`) governs. Invoke `/jvm-backend` before
> writing code.
>
> Read `docs/superpowers/plans/2026-07-05-lobby-owner-visibility.md` in full.
> [INLINE adr-context output.]
>
> Implement (game context only):
> 1. `game/infrastructure/src/main/resources/db/migration/V3__lobbies_owner_user_id.sql`
>    — `ALTER TABLE lobbies ADD COLUMN owner_user_id UUID NULL;` plus a
>    partial index `WHERE owner_user_id IS NOT NULL`, and a backfill:
>    `UPDATE lobbies l SET owner_user_id = lp.user_id FROM lobby_players lp
>    WHERE lp.lobby_id = l.id AND lp.session_id = l.owner_session_id AND
>    lp.user_id IS NOT NULL;` (best-effort; owners already leave-graced out
>    stay null — acceptable, they predate the fix).
> 2. `game/domain/.../Lobby.kt` — add `ownerUserId: UserId?` (nullable,
>    default null). Update all constructor call sites.
> 3. `CreateLobbyUseCase` (`LobbyUseCases.kt`) — set `ownerUserId =
>    ownerUserId` on the new `Lobby`.
> 4. `PostgresLobbyRepository` — `upsertLobby`: INSERT `owner_user_id` from
>    `lobby.ownerUserId`; in the `ON CONFLICT DO UPDATE SET` list **do NOT**
>    update `owner_user_id` (write-once, so a post-leave save cannot null it).
>    `hydrate`: read the column into `ownerUserId`. `findByUserId`: change to
>    `WHERE (l.owner_user_id = ? OR EXISTS(SELECT 1 FROM lobby_players lp
>    WHERE lp.lobby_id = l.id AND lp.user_id = ?)) AND l.state IN
>    ('IN_PROGRESS','COMPLETED') ORDER BY l.last_activity_at DESC` (bind the
>    userId twice).
> 5. `InMemoryLobbyRepository.findByUserId` — match `lobby.ownerUserId ==
>    userId || players.values.any { it.userId == userId }`, same state filter.
> 6. Tests: a repository test (both adapters, Testcontainers for Postgres)
>    that creates an authed-owner lobby → starts a game → `leaveLobby(owner)`
>    → asserts the lobby persists AND `findByUserId(ownerUserId)` returns it.
>    Confirm it is RED on `main` before the fix. Add a `CreateLobbyUseCase`
>    test asserting `ownerUserId` is stamped.
>
> DO NOT: change any wire schema (`openapi.yaml`) — the `LobbySummary` shape
> is unchanged; touch `grid/` or `frontend/`; add dependencies.
>
> Validate: `./gradlew :game:domain:check :game:application:check
> :game:infrastructure:check spotlessCheck`.
>
> Ship: branch `fix/lobby-owner-visibility` off `origin/main`; `git commit
> -s`; message `fix(game): keep authed-owned lobbies visible after
> leave-grace`. PR body Why/What/Test-plan, reference the plan, **cite the
> ADR-0001 §4 2026-05-25 soft-target override from the first push** (this is
> one atomic migration+query workstream that should not split). Conventional
> commit, DCO, no emojis. [INLINE CI auto-fix loop.] [INLINE comment-style
> preflag.] Report back < 250 words.

## Reviewer / fixer dispatch

Use the `reviewer` skill for manual reviews and the manual-fixer pattern
from the dispatch skill. Cap: 5 §6a passes per phase, 3 fix passes per
finding-set. Reviewer ≠ implementer.
