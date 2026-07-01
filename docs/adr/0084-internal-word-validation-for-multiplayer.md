# ADR-0084: Internal service-authenticated word validation for multiplayer locking

## Status

Proposed

## Context

Multiplayer co-op grids (ADR-0018) lock words **server-authoritatively**.
When a player completes a word, `game-api` asks `grid` to validate it via
`POST /v1/puzzles/{id}/validate`, reads back which cells are wrong, locks any
candidate word with zero wrong cells, and broadcasts a `wordLocked` event so
every client renders the word as solved. The frontend has no client-side
answer key for co-op — the lock is the only "valid word" signal.

ADR-0076 §9 (amendment, 2026-06-30) made `POST /v1/puzzles/{id}/validate` a
**binary oracle**: it returns `{ solved }` and nothing else — no positional
data, "not even which cells are wrong". The purpose is anti-cheat: a solo (or
teaser) player must not be able to read per-cell correctness from the browser
Network tab and trivially reconstruct the solution.

That endpoint was **also** `game-api`'s per-word validation dependency, and the
two consumers were never separated. Removing `incorrectCells` (grid PR #1170)
silently broke multiplayer locking:

- `game-api`'s `HttpWordValidator.ValidateResponseDto` still requires a
  non-nullable `incorrectCells` field, so every validate response now fails to
  deserialize (`MissingFieldException` → `WordValidatorException.UpstreamMalformed`).
- `UpdateCellUseCase` deliberately swallows validator failures so a keystroke is
  never lost — so the exception is invisible, and **no word ever locks** in
  co-op. The client's "checking…" pulse (ADR-0076-era co-op affordance) arms and
  silently times out.
- No test caught it: the game word-lock tests use an in-memory `FakeWordValidator`,
  and there is no `HttpWordValidator` test pinning the JSON wire shape.

This is a clean regression: before #1170, grid's `ValidatePuzzleResult` carried
`{ solved, incorrectCells }`, matching `game-api`'s parser exactly, and co-op
locking worked.

`game-api` needs per-word correctness. Solo clients must not regain it. The
tension is that both were reading one shared, now-binary endpoint.

## Decision

### 1. A dedicated internal endpoint for per-word validation

Add `POST /v1/puzzles/{id}/validate-word`, returning `{ correct: boolean }` for
a **single** submitted word (`{ cells: [{ row, column, letter }] }`). grid reuses
its existing validation logic, scoped to the submitted cells: `correct` is true
iff every submitted cell matches the canonical solution. It carries no positional
data — the answer to "is *this* word right" is one bit, and it never says *which*
cell is wrong.

`game-api` calls it once per candidate word (1–2 per keystroke), replacing the
old whole-grid `incorrectPositions` call.

### 2. The client-facing `/validate` stays a binary whole-grid oracle

`POST /v1/puzzles/{id}/validate` is unchanged (`{ solved }`, ADR-0076 §9).
**Solo grids never regain per-word or per-cell feedback.** This ADR does not
reopen ADR-0076's posture for any client-facing surface.

### 3. Access control — defense in depth, both layers

`validate-word` is reachable **only** by `game-api`, never by a browser. Two
independent controls, either of which alone blocks the attack:

- **Service token.** `game-api` attaches an `X-Service-Token: <shared secret>`
  header; grid rejects (`401`) any `validate-word` request without the matching
  token. The secret is injected at runtime via the services' existing
  `envFromSecret` env Secrets (`wordsparrow-api-env` for grid,
  `bliss-game-api-env` for game), never committed (CLAUDE.md secrets posture,
  ADR-0009 §10). It is rotatable.
- **Not publicly routed.** `validate-word` is not exposed through grid's public
  ingress; it is reachable only in-cluster (`game-api` already calls grid over
  the ClusterIP at `http://wordsparrow-api:8080`). The implementation uses a
  dedicated internal Ktor connector/port that the public ingress does not front,
  rather than reshaping the ingress `/`-catch-all into a hand-maintained
  path-allowlist (which would silently expose the endpoint the first time
  someone forgets to update it). The exact mechanism is settled in the grid
  implementation PR; the requirement — "unreachable from `api.wordsparrow.io`" —
  is binding.

### 4. Transport is HTTP, not NATS

The call is synchronous per-word validation in the keystroke path, i.e. an RPC.
HTTP is `game-api`'s existing transport to grid (`HttpPuzzleProvider`,
`HttpWordValidator`). NATS request-reply was considered and rejected: both
services are NATS **consumers only** today, request-reply is used nowhere in the
repo, and ADR-0049 steers NATS toward durable async decoupling — a synchronous
RPC subject would be a posture reversal. The coupling already exists over HTTP
(co-op cannot lock words if grid is unreachable, by design), so HTTP is the
idiomatic, lower-churn choice.

## Threat model

- **Asset.** Per-cell / per-word correctness of a puzzle. Leaking it to a
  browser makes solo grids trivially solvable — the exact risk ADR-0076 closed.
- **Attacker.** A solo player probing their own grid word-by-word from the
  browser (Network tab / `curl`) to defeat the binary-oracle posture.
- **Surfaces.** (a) client-facing `/validate` — unchanged, binary only, no new
  exposure. (b) new `/validate-word` — internal.
- **Controls.** `validate-word` requires a server-only secret **and** has no
  public network path. A browser has neither. The two controls are independent:
  a single misconfiguration (an ingress path added by mistake, or a token check
  omitted) does not by itself expose the asset.
- **Residual risk (accepted).** If the service secret leaks — e.g. a compromised
  `game-api` pod or its Secret — an attacker with in-cluster network access could
  probe per-word. That already presupposes cluster compromise, which exposes far
  more; the leak is one bit per word per call, the secret is rotatable, and this
  is **strictly less** exposure than the pre-ADR-0076 state, which returned the
  whole grid's wrong-cell map to any anonymous browser. Not in scope: co-op
  players probing — co-op is cooperative over a shared grid, there is no
  per-player advantage to leak, and players never call `validate-word` directly
  (only `game-api` does).

## Consequences

### Easier

- Multiplayer word-locking works again, restoring the co-op experience.
- Solo/teaser anti-cheat posture (ADR-0076) is preserved intact.
- The two consumers no longer share one contract: a future change to the
  client-facing binary `/validate` can no longer silently break `game-api`.

### Harder

- grid gains its first service-authenticated, internal-only endpoint (a small
  token check plus a not-publicly-routed mechanism). grid had no
  service-to-service auth before.
- `game-api` manages a shared service token (custody + rotation).
- A new `HttpWordValidator` wire-shape contract test is required so a grid
  contract change cannot again break co-op silently, and the validator failure
  in `UpdateCellUseCase` becomes observable (logged/metered) instead of a silent
  swallow — a *total* lock outage must never again be invisible.

### Different

- Establishes the pattern for future server-to-server grid capabilities that
  must not be client-reachable (token + internal-only), distinct from the
  cookie-based user auth grid already has for hint budgets.

## Rollout (expand-and-contract, schema-first)

1. **This ADR** — decision + threat model. Update `docs/adr/INDEX.md`.
2. **Schema-only (grid):** `grid/api/openapi.yaml` adds `POST
   /v1/puzzles/{id}/validate-word` + request/response schemas, documented as
   internal / service-authenticated.
3. **grid implementation:** use case (word-scoped) + route + service-token gate
   + internal-only exposure.
4. **game-api rewire:** `HttpWordValidator` calls `validate-word` per candidate
   word, attaching the token; DTO becomes `{ correct }`; add the
   `HttpWordValidator` wire-shape test; make the validator failure in
   `UpdateCellUseCase` observable. Chart: inject the shared token into both env
   Secrets.
5. **frontend:** the co-op "checking…" pulse converts a validation timeout into
   a reject → `rejectingPositions` → shake. Independent of the backend PRs, but
   the UX is only correct once steps 3–4 deploy (before that, correct words also
   time out).

## Relationships

- **Extends ADR-0076** — carries its answers-off-the-wire posture to the
  multiplayer consumer without reopening it for clients.
- **ADR-0049** — NATS transport considered and rejected here.
- **ADR-0018** — the multiplayer/co-op context this restores.
- **ADR-0009** — secrets injected at runtime as k8s Secrets.
