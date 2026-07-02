# Orchestration procedure — multiplayer word-validation fix (ADR-0084)

> Cron source-of-truth. A tick session reads this file, walks the phase map,
> and takes **at most one action**. Standing authorization is in the log file
> (`…-orchestration-log.md`). This procedure is a living doc — patch via small
> follow-up commits.

## Goal

Restore multiplayer co-op word-locking (regressed by ADR-0076's binary
`/validate`, grid #1170) and add per-word shake feedback, then deploy to prod.
Autonomous through PR → §6a LGTM → squash-merge → prod deploy. Bonus phase
(per-player word coloring) only if all core phases land with time to spare.

## Standing maintainer authorization (2026-07-01)

The maintainer granted, verbatim: *"go through it autonomously till PR & merge &
prod deploy"*. This is explicit merge authority for this rollout (ADR-0001 §6a
autonomous mode; dispatch skill "Standing maintainer authorization"). Merge
conditions below. §4 400-line soft-target may be invoked proactively (cite the
2026-05-25 amendment in the PR body). Do NOT impersonate the maintainer in
comments — post as orchestrator, cite this grant.

## Hard safety rules (override autonomy)

- **Never** force anything risky to prod. If a deploy step, secret bootstrap, or
  infra change looks like it could break grid/game startup or expose per-cell
  correctness to solo browsers, **escalate** (log `**ACTION:** …`, comment on the
  PR, `CronDelete` self) and leave it for the maintainer. A stuck rollout the
  maintainer finishes in the morning beats a broken prod.
- **Never** reopen ADR-0076 for any client-facing surface. `POST
  /v1/puzzles/{id}/validate` stays `{ solved }`-only. Per-cell/per-word
  correctness is reachable by `game-api` **only** (token + not-publicly-routed).
- **Never** bypass a CI gate (`--no-verify`, `--no-gpg-sign`, force-push main).
- Degrade-open on the app path, degrade-closed on security: if the service token
  Secret is absent at runtime, grid `validate-word` returns 401 and co-op simply
  stays unlocked (== current prod), never worse, and never leaks.

## Phase map (sequential; each merges before the next opens)

| Phase | PR | Branch | Depends on | Deploys |
|------|----|--------|-----------|---------|
| 0 | **#1241 (OPEN)** ADR-0084 | `docs/adr-0084-internal-word-validation` | — | docs only |
| 1 | schema: grid `validate-word` | `feat/grid-validate-word-schema` | P0 merged | none (schema) |
| 2 | grid impl: usecase+route+token+internal | `feat/grid-validate-word-impl` | P1 merged | grid-api (k8s) |
| 3 | game rewire: HttpWordValidator+test+obs+chart token | `feat/game-word-validator-per-word` | P1 merged (P2 for e2e) | game-api (k8s) |
| 4 | frontend: pulse timeout → shake | `feat/coop-word-reject-shake` | P0 merged | frontend (CF Pages) |
| 5 | BONUS: per-player word color | (schema + impl, see below) | P2+P3 merged & deployed | grid? game + frontend |

Deploy sequencing note: P2 (grid) should DEPLOY before P3 (game) starts calling
`validate-word`, but ordering is forgiving — if game deploys first, its calls
404/401 and co-op stays unlocked (not worse) until grid deploys. Merge order
P2 then P3. P4 (frontend shake) must MERGE LAST of the core phases — until P2+P3
are deployed, correct words don't lock, so a timeout-shake would fire on correct
words. Gate P4's merge on P2+P3 being merged (deploy-in-flight is acceptable;
the frontend deploy lags similarly).

## Tick decision tree

1. `cd $(git rev-parse --show-toplevel) && git fetch origin --quiet`.
2. Read the log file for current state. Walk phases 0→5 in order; act on the
   FIRST phase not yet MERGED.
3. For that phase's PR:
   - **No PR yet** and all deps merged → dispatch its implementer agent
     (`isolation: "worktree"`, `run_in_background: true`) with the spec below.
     One dispatch per tick.
   - **OPEN** → apply the open-PR sub-tree (below).
   - **MERGED** → advance to next phase.
   - **CLOSED-not-merged** → escalate.
4. When phase 5 (or phase 4 if bonus skipped) is merged AND its deploy is
   confirmed → append `**ACTION:** rollout complete` + `CronDelete` self + exit.

### Open-PR sub-tree (first match wins)

- **Ready to merge.** All blocking checks `success` (`ci`/`build`/`frontend-build`,
  `commitlint`, `branch-name`, `dco`, `gitleaks`, `dependency-review`,
  `openapi-typescript-drift`/`regen-and-diff`, `openapi-lint`/`spectral`,
  `helm-lint`, `api-chart-lint`, `readme-diagrams-drift`, `registry-coherence`)
  AND mergeable AND (latest review body starts with `LGTM` (case-insensitive) OR
  the only open finding is the 400-line target and the PR body cites the §4
  override) AND (for P4: P2 & P3 are merged). → `gh pr merge <#> --squash`
  (no `--delete-branch`).
- **Auto-review alive.** `claude-review` / `Claude Code Review` running within
  last 15 min → wait.
- **Findings, no fixer activity.** Latest review starts `Findings —`, no review
  workflow running, no commit since the review → run the 3c identical-finding
  check (dispatch skill); else dispatch a manual fixer (background, worktree).
  Budget 3 fix passes/phase, then escalate.
- **CI done, no review yet** → dispatch a manual reviewer (invokes `reviewer`
  skill; posts `LGTM, no findings.` or `Findings — …`).
- **CI running** → wait.

Informational (never block): `claude-review` check itself, CodeQL/Analyze,
Cloudflare Pages preview `deploy`.

### Stacked-PR handling (P1 is stacked on P0)

PR #1242 (P1 schema) was opened with **base = the ADR branch**
`docs/adr-0084-internal-word-validation`, so ADR-0084 is present for its review.
When **P0 (#1241) squash-merges to main**, immediately, before merging #1242:
1. `gh pr edit 1242 --base main`.
2. Rebase #1242 onto main to drop the now-duplicated ADR commit:
   ```
   git fetch origin --quiet
   git checkout -B rebase-tmp origin/feat/grid-validate-word-schema
   git rebase --onto origin/main origin/docs/adr-0084-internal-word-validation rebase-tmp
   git push --force-with-lease origin rebase-tmp:feat/grid-validate-word-schema
   ```
   (`origin/docs/adr-0084-internal-word-validation` is the last P0 commit on the
   stack; the rebase drops it since it's on main via the squash.) CI re-runs.
3. THEN apply the normal open-PR sub-tree to #1242.

Phases 2–4 branch off `main` (not stacked) — dispatch them only after their
deps are merged to main, so no rebase dance.

## Per-phase implementer specs

Every implementer prompt MUST: invoke the relevant domain skill (`/schemas`,
`/jvm-backend`, `/frontend`) first; run `scripts/adr-context.sh <paths>` and read
the output (ADR-0084 + neighbors); include the dispatch skill's comment-style
preflag + CI auto-fix loop; branch per the table; `git commit -s`, conventional
scope; open PR via `gh pr create --repo Ishou/bliss`; report back <250 words.
Cite ADR-0084 in every PR body. ADR-0084 is on main once P0 merges — no
cherry-pick needed.

### Phase 1 — schema (grid openapi)

Add to `grid/api/openapi.yaml`:
- `POST /v1/puzzles/{id}/validate-word`, `operationId: validateWord`. Description:
  INTERNAL, service-authenticated (header `X-Service-Token`), server-to-server
  only; not exposed on the public ingress. Requires a single word's cells.
- Request `ValidateWordRequest`: `required: [cells]`, `cells`: array (`minItems:
  2`) of `FilledCell` (reuse the existing `FilledCell` schema — `{row, column,
  letter}` uppercase A-Z).
- Response `200` `ValidateWordResult`: `required: [correct]`, `correct: boolean`.
  Description: pure binary per-word verdict — carries no positional data (mirrors
  ADR-0076 §9 posture; one bit, never which cell).
- `401` (missing/invalid service token) + `404` (puzzle) + `400` responses,
  `Problem` (RFC 7807), consistent with the existing `/validate` op.
- Run `pnpm --dir frontend api:generate` and commit the regenerated
  `frontend/src/infrastructure/api/grid/types.ts` (drift gate) — even though the
  FE doesn't call it, the types are generated from the whole spec.
Validate: `npx -y @stoplight/spectral-cli lint grid/api/openapi.yaml`. Commit
`feat(api-grid): internal validate-word endpoint for co-op locking (ADR-0084)`.

### Phase 2 — grid implementation

1. **Use case** `grid/application/.../puzzle/ValidateWordUseCase.kt` (or extend
   the existing validate use case): given puzzleId + submitted cells, return
   `correct: Boolean` = every submitted cell matches the canonical solution AND
   the submitted set is a valid word span (reuse existing solution lookup +
   position validation from `ValidatePuzzleUseCase`; do NOT duplicate the answer
   store). No positional data in the result.
2. **Route** in `grid/api/.../routes/PuzzleRoute.kt`: `post("/v1/puzzles/{id}/validate-word")`.
   Service-token gate: read `X-Service-Token`, compare (constant-time) to
   `System.getenv("WORD_VALIDATE_SERVICE_TOKEN")`; if env unset OR header
   missing/mismatched → `401` Problem `https://bliss.example/errors/service-auth-required`.
   Deserialize `ValidateWordRequest`, call the use case, respond `ValidateWordResult`.
3. **Internal-only exposure.** Preferred: bind `validate-word` to a **dedicated
   internal Ktor connector/port** NOT fronted by the public ingress, reachable
   in-cluster only. If a second connector is too invasive for one endpoint, the
   token gate above is the binding control and the "not publicly routed" half is
   satisfied by an ingress path-deny for `/v1/puzzles/*/validate-word` — but
   verify the deny actually works and does not shadow `/validate`. Decide in-PR;
   document the choice in the PR body + threat-model note. Whichever: a browser
   hitting `api.wordsparrow.io/.../validate-word` MUST get 401/404, never a verdict.
4. **Token Secret bootstrap (in-cluster, CI-only) — BOOT-SAFETY IS PARAMOUNT.**
   Add a Helm `post-install,post-upgrade` Job to grid's chart mirroring
   `infra/nats/templates/stream-bootstrap-job.yaml`: idempotently create Secret
   `word-validate-token` (key `token`) with `openssl rand -hex 32` IF ABSENT
   (never rotate an existing one; the Job needs an RBAC Role+RoleBinding to
   get/create that one Secret, like the NATS bootstrap).
   **grid Deployment reads `WORD_VALIDATE_SERVICE_TOKEN` via an OPTIONAL
   `secretKeyRef {name: word-validate-token, key: token, optional: true}`** so the
   pod ALWAYS boots even if the Secret does not exist yet. This is non-negotiable:
   a hard (non-optional) secretKeyRef would put grid into CreateContainerConfigError
   and take down ALL of grid-api if the Job hasn't run — that is a far worse
   outcome than co-op staying unlocked. **Degrade-closed:** env unset →
   validate-word returns 401 → co-op stays unlocked (== current prod, never
   worse, never leaks). The feature self-activates once the Secret exists and the
   pods roll. Update `docs/infra/topology.yaml` + `make diagrams` if the chart
   adds a diagram-relevant resource. In the PR body, flag the deploy/Secret
   activation clearly for the maintainer. If ANY part of the Job/RBAC/Secret
   wiring is uncertain or you cannot verify it renders (`helm template`), SHIP
   THE ROUTE + TOKEN CHECK + OPTIONAL ENV ONLY and leave the Job as a flagged
   follow-up in the PR body — never ship a chart change you cannot `helm template`
   clean, and never block the whole rollout on infra polish.
5. Tests: use-case unit tests (correct/incorrect/partial word), route test for
   401-without-token and 200-with-token.
Commit `feat(grid): internal validate-word endpoint + service-token gate (ADR-0084)`.

### Phase 3 — game-api rewire

1. `game/infrastructure/.../HttpWordValidator.kt`: replace the whole-grid
   `incorrectPositions` call with a per-word `validate-word` call. New method
   shape on the `WordValidator` port: given puzzleId + a single word's
   `Map<Position, Letter>`, return `Boolean` correct (or keep `incorrectPositions`
   semantics by returning empty-set when correct / the word's positions when not
   — whichever keeps `LobbyUseCases` lock logic intact with least churn;
   PREFER a new `isWordCorrect(puzzleId, word): Boolean` and adapt the caller).
   Attach header `X-Service-Token` from `System.getenv("WORD_VALIDATE_SERVICE_TOKEN")`.
   Response DTO `{ correct: Boolean }`. Keep `WordValidatorException` mapping
   (UpstreamUnavailable/Error/Malformed).
2. `game/application/.../usecases/LobbyUseCases.kt`: adapt the candidate-word
   loop to call the per-word check for each candidate (1–2 per keystroke).
   **Make the validator failure observable**: replace the silent
   `catch (Exception) { return success(...) }` with the same non-fatal return
   PLUS a structured `logger.warn` (correlation id, puzzleId, position) and,
   if an `AnalyticsEventSink`/metric is at hand, a counter — so a total lock
   outage is visible, not invisible. Still non-fatal to the keystroke.
3. **The missing test**: add `game/infrastructure/.../HttpWordValidatorTest.kt`
   pinning the exact `validate-word` JSON wire shape (request has cells + the
   token header is attached; response `{ correct }` parses; a response missing
   `correct` throws `UpstreamMalformed`). This is the contract test whose absence
   let #1170 break co-op silently — it is REQUIRED by ADR-0084.
4. Chart: `game/api/deploy/chart` reads `WORD_VALIDATE_SERVICE_TOKEN` from the
   SAME `word-validate-token` Secret via an **OPTIONAL**
   `secretKeyRef {name: word-validate-token, key: token, optional: true}` (same
   boot-safety rule as grid P2 item 4 — game must ALWAYS boot even if the Secret
   is absent; env unset just means validate-word calls 401 and co-op stays
   unlocked). `GRID_BASE_URL` already points at the internal ClusterIP — confirm
   validate-word uses that base. Do not add the Job here (grid owns it); game
   only consumes the Secret.
5. Keep `FakeWordValidator` in tests updated to the new port method.
Commit `fix(game): per-word validate-word restores co-op locking (ADR-0084)`.

### Phase 4 — frontend shake

`frontend/src/ui/v2/multiplayer/useCoopValidating.ts`: when a word's `MAX_MS`
timer fires and the word is STILL not in `validatedPositions`, instead of
silently clearing, move its cells into a `rejecting` set for a short window
(~600ms, one shake), then clear. Expose `rejecting: ReadonlySet<string>`
alongside `validating`. `LiveCoopScreen.tsx`: pass `rejectingPositions={rejecting}`
to `PuzzleBoard` (the prop already exists; wire it). Extend
`tests/use-coop-validating.test.ts`: timeout without lock → cells appear in
`rejecting` then clear; lock before timeout → never rejects. TDD.
`pnpm --dir frontend typecheck && lint && test && build`.
Commit `feat(frontend-grid): shake a co-op word that fails validation (ADR-0084)`.
MERGE-GATE: only merge once P2 & P3 are merged.

### Phase 5 — BONUS: per-player word coloring (only if core done early)

Design (own mini schema-first rollout — needs its own ADR-lite note in the PR
body, or a short ADR-0085 if it changes the wire contract, which it does):
- `wordLocked` event must carry WHO locked it. Add `lockedBy: SessionId` (or
  `sessionId`) to the `wordLocked` payload in `game/api/asyncapi.yaml` (schema
  PR), populate from the locking player's session in `LobbyUseCases` →
  `WebSocketFrameMapper`, and thread through `reduceLobby` → `lockedPositions`
  becoming `Array<{row, column, lockedBy}>`.
- Frontend: derive a per-cell color from the locking player's color
  (`player-color.ts` already exists). First-writer-wins on crossing letters: a
  cell already coloured by an earlier `wordLocked` keeps its colour when a
  crossing word locks (dedup in `reduceLobby` already keeps the first occurrence
  — preserve `lockedBy` of the first). `PuzzleBoard` `LetterSlot` `solved` state
  gains an optional player-colour tint.
- This is additive and lower-risk; if any doubt about the wire change, open the
  asyncapi schema PR, get it reviewed, and STOP for the maintainer rather than
  rush a contract change overnight.

## Escalation

Append to the log: `**ACTION:** <what> — <why> — <what the maintainer should do>`,
comment the same on the relevant PR (as orchestrator), `CronDelete` self, exit.
Escalate on: any CLOSED-not-merged PR; 3 fix passes exhausted; identical-finding
loop on a non-cap finding; ANY prod-deploy/secret/infra step that risks breakage;
a bonus-phase wire change you are not confident is safe unattended.

## ADR-0085 auto-merge cron (maintainer said "cron auto-merge green+lgtm")

STANDING AUTH (2026-07-02): maintainer authorized a cron to auto-merge PRs that
are green + bot-LGTM. This is the explicit per-merge approval the classifier
requires. Merge ONLY on the AUTONOMOUS bot review (posted on PR open/synchronize).
**NEVER manufacture a review** (no `gh run rerun`, no dispatched reviewer, no
steering) — that is self-approval and is forbidden; it is what broke earlier.

Phase order (dependency + deploy sequencing). Resolve each PR by branch via
`gh pr list --repo Ishou/bliss --head <branch> --json number,state,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,reviews`:
1. `docs/adr-0085-word-rejected-event` (ADR #1247, base main)
2. `feat/game-word-rejected-schema` (asyncapi #1248, base = ADR branch → retarget)
3. `feat/game-word-rejected-impl` (game emit, base = asyncapi branch → retarget)
4. `feat/coop-word-rejected-sync-shake` (frontend, base main) — merge LAST, only
   after phase 3 is MERGED (so wrong-word shake works end-to-end; frontend demotes
   the timeout, so shipping it before the game emit deploys would leave wrong words
   with no shake — not harmful, correct words still lock, but avoid the window).

Tick (one action per fire):
- Walk phases in order; act on the first not-MERGED.
- **No PR yet** (impl agent still authoring) → WAIT (do NOT dispatch a new
  implementer; they were already dispatched).
- **OPEN, base != main and its base PR MERGED** → `gh pr edit <#> --base main`
  then rebase onto main dropping the base's commits:
  `git fetch origin; git checkout -B rb origin/<branch>; git rebase --onto origin/main origin/<base-branch> rb; git push --force-with-lease origin rb:<branch>`. Then wait for CI re-run.
- **OPEN, ready** = all blocking checks success + mergeable + mergeStateStatus in
  (CLEAN,UNSTABLE) + latest review body starts with `LGTM` (case-insensitive) AND
  (phase 4 gated on phase 3 MERGED) → `gh pr merge <#> --repo Ishou/bliss --squash`.
- **OPEN, latest review starts `Findings —` and no fix commit since it and no
  claude-review running** → dispatch a FIXER agent (worktree, background) to
  resolve the findings + push (the bot then re-reviews autonomously). NEVER a
  reviewer/rerun.
- else WAIT.
- After any action, append a one-line dated event to the log; commit+push to
  `chore/claude-mp-validation-orchestration`.
- When phase 4 is MERGED → append `**ACTION:** ADR-0085 rollout merged; watch
  deploy` and CronDelete self.

HARD SAFETY unchanged: never force risky infra to prod; never reopen ADR-0076 for
clients/solo; if a merge is classifier-blocked as self-approval, STOP + escalate
(do not retry/manufacture).

## COMBINED auto-merge phases (supersedes the ADR-0085-only cron)

Single cron now drives BOTH the ADR-0085 tail and the ADR-0086 coloring rollout
(two crons would race on the log push). Same tick rules as the "ADR-0085
auto-merge cron" section above: one action/tick; retarget `--base main` + rebase
`--onto origin/main origin/<base-branch>` when a stacked PR's base has merged;
merge on green + mergeable + AUTONOMOUS bot `LGTM` only; findings → dispatch a
FIXER (never rerun/dispatch a review); escalate + stop (no retry) if a merge is
classifier-blocked; append to log + push after each action.

Phase order (act on FIRST not-MERGED; resolve each via `gh pr list --head <branch>`):
1. `feat/game-word-rejected-schema`  (#1248 asyncapi 0085; base was ADR-0085 → retarget+rebase onto main)
2. `feat/game-word-rejected-impl`    (#1249 game 0085; base was #1248 → retarget+rebase after #1248 merges)
3. `feat/coop-word-rejected-sync-shake` (#1250 frontend 0085; base main; merge after phase 2)
4. `docs/adr-0086-player-locked-word-coloring` (#1251 ADR 0086; base main)
5. `feat/game-locked-by-schema`      (0086 schema; base = ADR-0086 branch → retarget+rebase after #1251)
6. `feat/game-locked-by-impl`        (0086 game; base = schema branch → retarget+rebase after phase 5; may not exist yet → WAIT)
7. `feat/coop-locked-word-color`     (0086 frontend; base = schema branch → retarget+rebase after phase 5; merge after phase 6; may not exist yet → WAIT)

Deploy sequencing: within each rollout merge backend (game) before frontend.
When phase 7 is MERGED → append `**ACTION:** both rollouts merged` + CronDelete self.
