# Perf fixes rollout: API edge, caching with regen-purge, frontend waterfall cuts

> **For agentic workers:** execute one PR per wave-item via the dispatch skill (worktree per PR,
> §6a review, auto-merge cron). Each PR below is a self-contained workstream ≤400 diff lines.
> Feasibility facts cited inline were verified against the repo on 2026-07-03.

**Goal:** cut WordSparrow page-data latency by removing round-trip amplification (edge proxy +
caching + preconnect + fewer refetches) while guaranteeing a regenerated daily grid propagates
immediately.

**Architecture:** Cloudflare-proxy the two critical API hosts (grid, identity) — game stays
gray-cloud for WebSockets (amends ADR-0007 §2). Origin emits `Cache-Control` + `ETag` on the
daily endpoints: browsers always revalidate (304s), the CF edge holds the anonymous response
until UTC midnight, and the daily-generation worker purges the edge after any (re)generation.
Frontend gains preconnect hints and an eager daily-puzzle prime at boot.

**Measured baseline (2026-07-03 analysis, `2026-07-03-query-timings-perf-analysis.md`):**
server processing ≤40 ms everywhere; cold visitor pays ~5–6 serial RTTs to one Hetzner IP
(fetch start ~570 ms after nav, per-origin DNS+TCP+TLS ~150–200 ms, preflight, GET); no cache
headers anywhere; no real IPv6 on API hosts (Cloudflare proxy adds AAAA automatically).

## Global constraints

- Conventional commits, single scope, DCO sign-off (`git commit -s`), no PascalCase first word.
- One-line comments only; no multi-paragraph comment blocks (§6a flags them).
- New/changed behavior lands test-first (TDD) where there is domain logic; route/header logic
  gets Ktor `testApplication` tests; frontend gets vitest.
- No schema changes anywhere in this plan (headers only) — `pnpm api:check` must stay clean.
- Registries: ADR ⇒ `docs/adr/INDEX.md` same PR; new k8s Secret ⇒ `docs/secrets.md` same PR.
- Per-user hint-budget fields (`hintsRemaining`, `secondsUntilNextHint`) ride inside
  `GET /v1/puzzles/daily` (`PuzzleRoute.kt:143-151`) ⇒ **public caching applies to cookie-less
  requests only**, enforced both at origin (conditional headers) and edge (bypass-on-cookie).

---

## Wave 1 — governance

### PR 1: ADR-0089 "API edge: Cloudflare proxy for non-WS hosts, daily-cache policy, regen purge"

**Files:** create `docs/adr/0089-api-edge-cloudflare-proxy-and-daily-cache.md`; modify `docs/adr/INDEX.md`.

Decision points the ADR must carry (all verified feasible):

1. **Proxy scope.** Orange-cloud `api.wordsparrow.io` + `auth.wordsparrow.io` via per-Ingress
   annotation `external-dns.alpha.kubernetes.io/cloudflare-proxied: "true"` (external-dns
   already uses the cloudflare provider with `--no-cloudflare-proxied` as the *default*,
   `infra/platform/values.yaml:106-114`; the annotation overrides per record). `game` stays
   gray (WS idle-timeout on CF free tier; ADR-0007 §2's reason survives for WS only, which
   this ADR amends). `billing`/`survey`/`otlp`/`analytics` stay gray for now — follow-up
   after the pattern proves out. Proxying also adds edge AAAA records, fixing the measured
   NAT64-path penalty (no real IPv6 on the origin today).
2. **TLS.** Keep the HTTP-01 ClusterIssuer (`infra/platform/templates/clusterissuer-letsencrypt.yaml`,
   solver `http01/ingress class nginx`); HTTP-01 flows through the CF proxy. Rollout includes a
   forced-renewal verification (`cmctl renew` or re-annotate) on both proxied hosts right after
   the flip; rollback = remove the annotation (external-dns reverts the record to gray).
   Precondition checked at flip time: zone SSL mode is Full (strict).
3. **Cache policy** for `GET /v1/puzzles/daily[?date=]`:
   - cookie-less: `Cache-Control: public, no-cache, s-maxage=<seconds-to-next-UTC-midnight>` +
     strong `ETag: "<puzzleId>"`, `304` on `If-None-Match` match. Browsers revalidate every
     time (ETag flips on regen because regen mints a fresh UUID, ADR-0081); the CF edge
     holds the 200 until midnight or purge.
   - with `__Secure-ws_session` cookie: `Cache-Control: private, no-store` (response embeds
     the per-user hint budget).
   - `GET /v1/puzzles/daily/list`: `public, no-cache` + ETag only (no edge caching — free-plan
     purge is exact-URL and the query-string variants are unbounded).
4. **Edge rule** (net-new Terraform; provider cloudflare ~>5.20 already root, `terraform/versions.tf:19-22`):
   one `cloudflare_ruleset` (phase `http_request_cache_settings`) scoped to host
   `api.wordsparrow.io` + path `/v1/puzzles/daily`, "eligible for cache, respect origin TTL",
   bypass when `http.cookie contains "__Secure-ws_session"`.
5. **Purge-on-regen.** The grid worker purges the edge after every generation run (ensure +
   regen paths): exact URLs `…/v1/puzzles/daily` and `…/v1/puzzles/daily?date=<d>` for each
   persisted date. Purge failure logs an error but does not fail the Job (worst-case staleness
   is bounded by the midnight edge TTL; manual purge one-liner documented). New k8s Secret:
   CF token scoped to `Zone.Cache Purge`.
6. **RUM visibility.** All five services add `Timing-Allow-Origin: https://wordsparrow.io
   https://www.wordsparrow.io` so browser OTel resource timings stop being opaque.
7. **Amendments:** ADR-0007 §2 (gray-cloud-everything reasoning narrowed to WS hosts).

INDEX.md rows: glob `*/api/deploy/chart/values-prod.yaml` (proxied annotation), `terraform/cloudflare-cache-rules.tf`,
`grid/worker/**` (purge hook), `*/api/src/main/kotlin/**/Module.kt` (TAO header) → ADR-0089.

---

## Wave 2 — origin + frontend (PRs 2–5 run in parallel once PR 1 merges)

### PR 2 `feat(frontend)`: preconnect + eager daily prime

**Files:** modify `frontend/index.html`; modify `frontend/src/main.tsx` (~line 181, adapter block);
create `frontend/src/infrastructure/api/grid/DedupedPuzzleRepository.ts` + test.

- `index.html` head gains:
  ```html
  <link rel="preconnect" href="https://api.wordsparrow.io" crossorigin />
  <link rel="preconnect" href="https://auth.wordsparrow.io" crossorigin="use-credentials" />
  ```
  (grid fetches run anonymous-mode CORS — `client.ts:74` sets no credentials; auth fetches are
  credentialed, hence `use-credentials` so the warmed socket matches the pool.)
- `createDedupedPuzzleRepository(inner, ttlMs = 60_000)`: memoizes `fetchDaily(date?)` promises
  keyed by normalized date, evicts on rejection (never caches failures) and after `ttlMs`.
  Wrap the repo in `main.tsx` *inside* the `enableMocks().then(...)` block (MSW-safe,
  `main.tsx:175-183`), then fire-and-forget `void repo.fetchDaily().catch(() => {})` so the
  network starts before React mounts; HomeScreen (`HomeScreen.tsx:253`) and the `/play` loader
  (`play.tsx:109`) join the same in-flight promise.
- Tests: dedup within TTL, separate keys per date, rejection eviction, TTL expiry (fake timers).

### PR 3 `feat(frontend)`: whoami staleness gate on tab focus

**Files:** modify `frontend/src/ui/components/auth/AuthProvider.tsx:121-133` + test.

- Track `lastRefreshAt` in a ref set on every successful `refresh()`; the `visibilitychange`
  handler skips `refresh()` when `Date.now() - lastRefreshAt < 5 * 60_000`. Initial mount
  refresh unchanged; sign-in/out paths unchanged (they call `refresh()` directly).
- Tests: focus within 5 min → no second whoami call; after 5 min → refetch; auth state
  transitions still refresh immediately.

### PR 4 `feat(grid-api)`: conditional cache headers + ETag on daily endpoints

**Files:** modify `grid/api/src/main/kotlin/com/bliss/grid/api/routes/PuzzleRoute.kt`
(daily handler `:108-166`, list handler `:168+`); tests in the existing PuzzleRoute test class.

- Implement policy §3 of ADR-0089 exactly (values above). Seconds-to-midnight computed from
  the route's existing `clock` (UTC — same zone the route already uses for "today").
- `If-None-Match` handling: compare against `"<puzzleId>"`; on match respond `304` with the
  same Cache-Control header and no body. List ETag: strong hash (SHA-256 hex, first 16 chars)
  of the ordered `puzzleId`s.
- TDD: testApplication cases — anon gets public+ETag; cookie gets private/no-store and *no*
  ETag; If-None-Match hit → 304; regen (insert newer row for same date) flips the ETag →
  200 with new body. Prove the 304 test fails before implementing.

### PR 5 `fix(infra)`: Timing-Allow-Origin across the five service modules

**Files:** the `install(DefaultHeaders)` block in `grid/api/.../Module.kt:132-138`,
`game/api/.../Module.kt`, `identity/api/.../Module.kt`, `billing/api/.../Module.kt`,
`survey/api/.../Module.kt` — one identical line each:
`header("Timing-Allow-Origin", "https://wordsparrow.io https://www.wordsparrow.io")`.
Cross-cutting single workstream (identical diff per context, CLAUDE.md rule). One header
assertion added per service's existing module/route test.

---

## Wave 3 — edge infra (sequential: PR 6 → PR 7 → PR 8; PR 6 first so certs/DNS settle)

### PR 6 `fix(infra)`: orange-cloud grid + identity ingresses

**Files:** `grid/api/deploy/chart/values-prod.yaml` (ingress.annotations, ~line 25) and
`identity/api/deploy/chart/values-prod.yaml` (~line 37): add
`external-dns.alpha.kubernetes.io/cloudflare-proxied: "true"`.

- Deploy notes in the PR body (execution is `helm upgrade` via existing deploy workflow):
  after rollout, verify `dig api.wordsparrow.io` returns CF anycast IPs + AAAA, run a forced
  cert renewal on `wordsparrow-api-tls` and `bliss-identity-api-tls`, confirm issuance events.
  Rollback: revert the annotation; external-dns (policy `sync`) restores gray records.
- Pre-flight check documented: zone SSL mode Full (strict).

### PR 7 `feat(infra)`: Cloudflare cache rule (Terraform)

**Files:** create `terraform/cloudflare-cache-rules.tf`.

- `cloudflare_ruleset`, phase `http_request_cache_settings`, zone `var.cloudflare_zone_id`:
  expression `(http.host eq "api.wordsparrow.io" and http.request.uri.path eq "/v1/puzzles/daily")`,
  action cache=true, edge TTL "respect origin", bypass expression adds
  `not http.cookie contains "__Secure-ws_session"` (single rule with the cookie clause).
- Per the fetch-known-example rule: the implementer fetches the provider-5.x `cloudflare_ruleset`
  cache_settings example from the registry docs/provider repo before authoring.
- Verify: `terraform plan` in CI-equivalent env; post-apply `curl -s -D-` twice on the daily URL
  → second response `cf-cache-status: HIT`; with a cookie → `BYPASS`/`DYNAMIC`.

### PR 8 `feat(grid-worker)`: regen CLI + purge-on-generation hook

**Files:** modify `grid/worker/src/main/kotlin/com/bliss/grid/worker/Main.kt` (flag wiring
`:38`, hook in `executeAndExit()` after the summary log `:98-108`); create
`grid/infrastructure/.../CloudflarePurgeClient.kt` (or worker-local class — no domain/application
imports of vendor SDKs; plain java.net.http) + unit tests; modify
`grid/api/deploy/chart/templates/cronjob-ensure-dailies.yaml` (env from Secret, optional);
create `grid/api/deploy/chart/templates/job-regenerate-dailies.yaml` (manual-trigger Job
template gated on a values flag, cloned from the CronJob shape); modify `docs/secrets.md`
(new `cloudflare-purge-token` Secret, zone-cache-purge scope).

- Wire `--regenerate-dailies` → `EnsureUpcomingDailiesUseCase.execute(today, force = true)`
  (the `force` param exists, `EnsureUpcomingDailiesUseCase.kt:34`, guard `:50`).
- After any run that persisted dates, POST the CF purge API with exact URLs
  (`/v1/puzzles/daily` + `?date=<d>` per persisted date), token+zone from env
  (`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_PURGE_TOKEN`); absent env = skip with info log (local
  clusters); failure = error log, exit code unchanged. Manual fallback documented in
  `docs/deploy.md`: one-line `curl` purge.
- TDD on the purge-URL builder + failure paths (mock only the HTTP boundary).
- **This PR delivers the regen guarantee**: fresh UUID → new ETag (browser), purge (edge).

---

## Wave 4 — small follow-up

### PR 9 `fix(grid-api)`: Hikari pool 5 → 10

**Files:** `grid/api/src/main/kotlin/com/bliss/grid/api/infrastructure/Database.kt:18`.
Headroom check in PR body: CNPG default `max_connections` 100 vs 2×10 api + 2 worker = 22.

### Issues to file (deferred, with rationale in each body)

1. `/play` loader parallelization — blocked by design: the uncontrolled grid reads the merged
   blob at mount (`play.tsx:110` comment, ADR-0075), so the progress pull must complete before
   render; post-Wave-3 the leg costs ~50–100 ms warm. Revisit only if RUM shows it matters.
2. whoami server-side single-JOIN read model — saves ~5–10 ms of 3 PK lookups
   (`WhoAmIUseCase.kt:41-49`); marginal vs port/adapter churn after PR 3 cuts call volume.
3. Survey `ORDER BY random()` + correlated `count(*)` (`PgSurveyItemRepository.kt:129-155,445`)
   — replace random-pick strategy before `survey_items` grows past ~50k rows.
4. Receipts: `/abonnement` fetches Mollie-backed `listReceipts` on mount (non-blocking UI but
   3rd-party coupling; `ReceiptsSection.tsx:60-75`) — lazy-load on expand or server-cache.
5. Extend orange-cloud to `billing`/`survey` after 2 weeks of clean grid/identity operation.
6. Ops: old `ensure-dailies` Error pods (48/43/42 d) in `wordsparrow` ns — inspect + clean.

## Success criteria

- Browser waterfall (cold, calm network): daily-puzzle fetch starts < 300 ms after nav
  (preconnect + prime), completes < 400 ms; repeat visit revalidates with 304s.
- `dig AAAA api.wordsparrow.io @1.1.1.1` returns CF AAAA records.
- `cf-cache-status: HIT` on anonymous daily; `BYPASS` with session cookie.
- Regen drill: run the regen Job in prod, then `curl -s https://api.wordsparrow.io/v1/puzzles/daily | jq .id`
  returns the fresh puzzle id immediately (no stale window).
- No §6a finding on comment style (one-liners only) and no api:check drift.
