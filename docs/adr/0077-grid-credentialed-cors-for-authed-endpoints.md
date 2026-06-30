# ADR-0077: Grid credentialed CORS for session-authed endpoints

## Status

Accepted

## Context

The home/play **hint** feature is broken in production: clicking "Indice"
issues `POST /v1/puzzles/{puzzleId}/hints` (operationId `revealCellHint`,
grid-api), which always returns **401**, signed-in or not. The feature has
effectively never worked from the deployed client.

The cause is a transport mismatch, not a missing backend feature. The
backend is fully built to verify the identity session cookie:

- `grid/api/src/main/kotlin/com/bliss/grid/api/Module.kt:236` wires a
  `HttpCookieVerifier` (a `CookieVerifier`) against identity-api.
- `grid/api/.../routes/PuzzleRoute.kt:313` reads
  `call.request.cookies["__Secure-ws_session"]`
  (`SESSION_COOKIE_NAME`, the cookie identity-api issues as
  `SessionCookies.NAME`, `Domain = wordsparrow.io`), and at
  `PuzzleRoute.kt:315-323` returns `401 "Authentification requise"` when
  the verifier resolves no session.

But nothing ever delivers that cookie to grid:

- `Module.kt:119` sets `allowCredentials = false`, and `Module.kt:107`
  uses `allowHeaders { true }` (wildcard predicate) with a host allowlist
  (`wordsparrow.io`, `www.wordsparrow.io`, `localhost:5173`).
- `frontend/src/infrastructure/api/grid/client.ts:53` deliberately sends
  **no credentials** ("the grid API omits Access-Control-Allow-Credentials,
  browser-blocking credentialed responses for public endpoints").

Net: the browser never attaches `__Secure-ws_session` on grid calls, so
the verifier always sees no cookie → guaranteed 401.

The grid CORS comment (`Module.kt:102-106`) already anticipates this exact
revisit, citing ADR-0034: *"gaining auth would force a return to the
explicit list because credentialed CORS is incompatible with wildcard
headers."* The hint endpoint gaining auth **is** that condition. The home
screen now surfaces this every time a player taps "Indice".

The hint endpoint stays on grid. Grid owns the puzzle answers, the reveal
logic, and the per-user hint budget (`RevealCellHintUseCase`,
`HintUsageRepository`, `HintWriteCoordinator` in `Module.kt:292-293`).
Moving the endpoint to identity-api was considered and rejected: it would
force identity to hold puzzle answers and reveal rules, a cross-context
coupling worse than the CORS change this ADR documents.

### A precision on the "wildcard incompatible with credentials" claim

The `Module.kt` comment is imprecise, and ADR-0048 already corrected the
same imprecision for identity-api. Ktor's `allowHeaders { true }` is a
**predicate**, not the literal response value `Access-Control-Allow-Headers:
*`. On a credentialed preflight the plugin echoes the requested header names
verbatim (e.g. `x-request-id, traceparent, tracestate`), never the literal
`*`. That echoed form **is** spec-legal alongside `Access-Control-Allow-
Credentials: true` — which is exactly why identity-api runs
`allowHeaders { true }` with `allowCredentials = true` today (ADR-0048).

So enabling credentials on grid does **not** strictly require dropping the
wildcard predicate. This ADR drops it anyway, as a deliberate
defense-in-depth choice (see Decision §1), not because the predicate is
unsafe.

## Decision

Keep the hint endpoint on grid and enable credentialed transport. The
implementation lands in a **separate Wave 2 PR**; this ADR-only PR is the
ADR-0001 §7 governance gate.

1. **Grid CORS (`Module.kt`).** Flip `allowCredentials = false → true`, and
   replace `allowHeaders { true }` with an **explicit header allowlist** of
   the headers the frontend actually sends:
   - `Content-Type` — the hint/validate POSTs send `application/json`.
   - `X-Request-Id` — correlation ID (`CallId` plugin reads it, `Module.kt:146`).
   - `traceparent`, `tracestate` — OTel browser SDK (ADR-0033) attaches
     these to every cross-origin fetch.

   The wildcard predicate would also be spec-legal under credentials (above),
   but an explicit list is chosen here for the smaller-attack-surface reason
   in the Threat model below. This is a *narrowing* relative to identity-api,
   not a mismatch.

   The **host allowlist stays unchanged** — enabling credentials must not
   widen which origins receive CORS headers. `allowMethod` and
   `allowNonSimpleContentTypes = true` stay as-is.

   **Open question for Wave 2 (do not decide here):** identity-api's
   allowlist includes a Cloudflare Pages preview host
   (ADR-0048); grid's does not. Whether to add it to grid for parity is a
   Wave-2 confirmation, not decided in this ADR.

2. **Frontend (`client.ts` / `HttpPuzzleSolver.ts`).** Send
   `credentials: 'include'` **only on the authed hint POST** — not on the
   public puzzle `GET` / sample / validate calls. Anonymous,
   CDN-cacheable puzzle fetches stay uncredentialed: no cookie sent, cache
   key unaffected.

3. **UI (`PlayScreen.tsx` + `useHintRequest`).** Render `hint.errorMessage`
   (currently computed but never displayed) so a 401 shows
   "Connecte-toi pour utiliser les indices" instead of a dead button.
   Hints are a signed-in feature; anonymous users get a real sign-in prompt.

## Threat model

This is an auth/authz + CORS change; CLAUDE.md mandates a threat model.

**Origin exposure.** Enabling credentials does **not** broaden origin
access. The host allowlist is unchanged, so only the existing first-party
origins receive CORS headers. Credentialed CORS with a literal `*` origin is
illegal per the Fetch spec; grid already uses an explicit `allowHost`
allowlist (not `anyHost`), so the credentialed configuration is compliant.

**CSRF.** The hint is a state-changing POST (it decrements a per-user
budget). Two independent barriers mitigate cross-site CSRF:

1. `__Secure-ws_session` is issued `SameSite=Lax`
   (`SessionCookies.kt:30`). Lax cookies are **not** sent on cross-site
   sub-requests such as a `fetch`/form POST from an attacker page, so a
   cross-site POST to `/hints` carries no cookie → 401, same as anonymous.
2. The endpoint requires `Content-Type: application/json`, a non-simple
   type that forces a CORS preflight (`OPTIONS`). An attacker origin not on
   the allowlist fails the preflight before the actual request is sent.

An explicit anti-CSRF token (double-submit / synchronizer) is **not**
warranted on top of this: the action is low-value (reveals one cell the
player already paid a budget unit for), effectively idempotent at the
budget level, and SameSite=Lax + mandatory preflight already close the
cross-site vector. Adding a token would mean threading it through the
identity session and every authed grid call for no marginal protection.
Revisit if a higher-value state-changing authed endpoint is added to grid.

**Header surface.** Moving from `allowHeaders { true }` to an explicit list
*reduces* attack surface — it reverts ADR-0034's wildcard-header
convenience, exactly as ADR-0034 said would happen on gaining auth. The
operational tax ADR-0034 was written to avoid returns: every new outbound
header the frontend adds must be added to grid's `allowHeader` list or its
cross-origin calls break the preflight. That tax is accepted as the cost of
the smaller surface, and it is bounded — the header set above is small and
stable.

**Cache.** Public puzzle `GET`s remain uncredentialed (the frontend opts
into `credentials: 'include'` only on `/hints`), so shared/CDN caching of
puzzle responses is unaffected and no cookie leaks into a cached response.
`Access-Control-Allow-Credentials: true` is emitted only on the credentialed
preflight/response path, not on the public GETs.

**Cookie scope.** `__Secure-ws_session` carries `Domain = wordsparrow.io`
(covers subdomains) + `Secure` + `HttpOnly` (`SessionCookies.kt:13,14,27,28`).
For the cookie to ride a grid request, grid-api's production origin must be a
`wordsparrow.io` subdomain (e.g. `api.wordsparrow.io`). The grid CORS comment
(`Module.kt:73`) references `https://api.wordsparrow.io`, but the exact
deployed host is **not asserted here** — it is a **Wave-2 confirmation**.
If grid-api is served from a non-`wordsparrow.io` host, the cookie is
out-of-scope and the fix fails regardless of CORS; Wave 2 must verify the
host before shipping.

## Consequences

**Easier:**

- The hint feature works end-to-end for signed-in players for the first
  time since it shipped.
- Anonymous players get an honest sign-in prompt instead of a dead button.
- Grid keeps ownership of puzzle answers + reveal + budget — no
  cross-context coupling into identity.

**Harder / Different:**

- Grid re-acquires the ADR-0034 header-allowlist tax: a new outbound
  frontend header must be added to grid's `allowHeader` list or its
  cross-origin calls break. Accepted for the smaller attack surface.
- Grid now mirrors identity-api's credentialed-CORS posture (allowlist +
  `allowCredentials = true`, ADR-0048) but with an *explicit* header list
  rather than the wildcard predicate — a deliberate narrowing, documented
  above so a future reader does not "fix" the divergence by re-wildcarding.
- `CorsTest` for grid must assert the credentialed config (origin echo +
  `Access-Control-Allow-Credentials: true` + the explicit header set) in
  Wave 2.
- Wave 2 must update or carve grid out of `CorsWildcardArchitectureTest.kt`
  (`survey/api/src/test/…/architecture/`) before or alongside the CORS
  config change. That guard uses `Konsist.scopeFromProject()` — it scans
  every api module — and asserts every `allowCredentials = true` block also
  uses `allowHeaders { true }`. Grid's explicit-list posture is the
  ADR-0077 deliberate narrowing, not a violation; the guard does not yet
  know that. The simplest fix is to skip files whose path contains
  `grid/`, or relax the predicate to accept either form when the
  ADR-0077 narrowing comment is present.

## Relationship to prior CORS ADRs

- **ADR-0034** (grid/game wildcard headers) anticipated this exact revisit
  ("gaining auth → return to the explicit header list"). That condition is
  now triggered for grid and resolved here. ADR-0034 remains in force for
  game-api, which has no auth.
- **ADR-0048** (identity-api credentialed CORS) established that the Ktor
  predicate is spec-legal with credentials. Grid now adopts the same
  credentialed posture; it diverges only in using an explicit header list
  rather than the predicate.
