# WordSparrow query-timings performance analysis — 2026-07-03

Investigation of "loading times feel excessively long for data that should be easy of access".
Measured from the maintainer's machine against prod (wordsparrow.io + api/auth/game/billing/survey.wordsparrow.io).

## Headline

The backend is fast. Every page-load query measured ≤ ~40 ms of server-side processing
(60–100 ms TTFB on a warm connection, RTT included). The perceived slowness comes from
two multiplying factors:

1. **This machine's network** — an IPv6-only NAT64 Wi-Fi with heavy bufferbloat. During bad
   windows, RTT to *Cloudflare anycast* was 184–415 ms and to the Hetzner origin 1.0–1.6 s
   (0% loss = queueing, not loss). The API origin is IPv4-only so its traffic transits the
   NAT64/CGNAT gateway, while wordsparrow.io (Cloudflare) has real AAAA records and rides
   native IPv6 — assets stay fast while API calls crawl, which is exactly the observed feel.
2. **Round-trip amplification in the app** — a cold visitor pays ~5–6 *serial* round trips
   to a single-region Hetzner origin before any data renders: JS boot (~0.5 s before fetches
   start) → per-origin DNS+TCP+TLS (up to 4 API origins per session) → CORS preflight per
   endpoint URL → GET. No preconnect hints, no HTTP caching on immutable data, no CDN in
   front of the API. At RTT 30 ms this is ~1 s; at RTT 300 ms it is 2–3.5 s (measured both).

## Measurements

### Server-side processing (warm keep-alive connection, health-probe interleaved, calm network)

| Endpoint | TTFB warm (incl ~50–60 ms RTT) | Notes |
|---|---|---|
| grid `GET /v1/health` | 59–100 ms | baseline |
| grid `GET /v1/puzzles/daily` | 100 ms | 80 KB raw / 10 KB gzip |
| grid `GET /v1/puzzles/daily/list?from=2000-01-01` | 55–75 ms | 5.7 KB raw / 1.7 KB gzip (unbounded range, grows daily) |
| grid `GET /v1/words/sample` | 87–104 ms | random sample + HMAC minting |
| identity `GET /v1/auth/whoami` (401) | 79–81 ms | 3 serial DB queries when authed |
| billing `GET /v1/subscription` (401) | 68–90 ms | |
| game `GET /v1/sessions/{id}/lobbies` | 55–75 ms | |

→ No slow endpoint server-side at current load. Earlier multi-second samples for billing /
words were re-tested with interleaved health probes on the same connection and shown to be
local-network windows, not endpoint properties.

### Cold-connection cost per API origin (calm network)

DNS ~2 ms + TCP ~30–60 ms + TLS ~90–130 ms ≈ **150–200 ms before the first byte**, per origin.
A session touches up to 4 API origins (api, auth, game, billing/survey) — each pays this.
CORS preflight (OPTIONS) adds one more RTT per endpoint URL (cached 24 h, but keyed per URL
and query strings vary daily).

### Real browser page loads (fresh profile, no cache/cookies)

| Page | FCP | API fetches start | API fetch duration | Data on screen |
|---|---|---|---|---|
| `/` calm network | 436–512 ms | ~460–570 ms | 290–660 ms | ~0.8–1.2 s |
| `/` congested window | 464 ms (CF assets fine) | ~478 ms | **2 088–3 094 ms** | ~3.5 s |
| `/play` warm anon | 160 ms | 169 ms | 137 ms | ~0.3 s |
| `/grilles` | 208 ms | ~200 ms | 142 ms (list) / **1 059 ms** (game-api first hit = new cold origin) | |

Home fires 4 queries in parallel (whoami, words/sample, daily, daily/list) — good — but only
after the JS bundle boots. `/play` for **authed** users has a render-blocking loader waterfall:
`fetchDaily` → `GET /v1/users/me/progress/{id}` (serial, code-verified at
`frontend/src/ui/routes/play.tsx:109`).

### Network-environment evidence (this machine, 2026-07-03 ~14:20)

- ping 1.1.1.1: 184–415 ms (should be ~10–15 ms) → local congestion/bufferbloat, 0% loss.
- ping 8.8.8.8: avg 864 ms. ping Hetzner origin: avg 1 343 ms during the worst window.
- `dig AAAA api.wordsparrow.io` returns `64:ff9b::…` = DNS64-synthesized (NAT64 network);
  `@1.1.1.1` returns nothing → **the API has no real IPv6**. wordsparrow.io does (Cloudflare).

### Cluster state (prod, read-only)

- Nodes: worker 6% CPU, cp 14%, obs 52%. No pressure.
- Sane requests/limits (grid 250m/3 CPU, 512Mi–2Gi; others 100m/1 CPU, 256–512Mi).
- grid-api ×2 replicas, identity ×2, game/billing/survey ×1.
- Old `ensure-dailies` CronJob pods in Error (48/43/42 d ago) — unrelated to latency, worth a cleanup look.

## Hypotheses (plausibility-rated)

| # | Hypothesis | Plausibility | Evidence |
|---|---|---|---|
| H1 | Maintainer-side network (NAT64 + bufferbloat) makes API calls look seconds-slow while CF assets stay fast | **Very high** (measured) | ping/DNS64 data above; API-only degradation reproduced in browser |
| H2 | Round-trip amplification: late fetch start + multi-origin TLS + preflights + no caching/CDN — hypersensitive to RTT for *all* users on mediocre links | **High** (measured + code) | waterfall data; `frontend/index.html` has no preconnect; no Cache-Control anywhere (`grid/Module.kt` DefaultHeaders only) |
| H3 | Authed `/play` loader waterfall + whoami-on-every-focus adds avoidable serial RTTs | **Medium-high** (code-verified, unmeasured authed) | `play.tsx:109`; `AuthProvider.tsx:82,126`; `WhoAmIUseCase.kt:41-49` (3 serial pool checkouts) |
| H4 | Server degradation under load / GC pauses (512Mi pods) | **Low** today | all warm measurements fast; no CPU pressure; unproven at higher load |
| H5 | Slow DB queries | **Very low** for page loads | all single-statement + indexed (verified against Flyway migrations). Future risk: survey `ORDER BY random()` + correlated count() (`PgSurveyItemRepository.kt:129-155,445`) degrades with table growth; grid Hikari pool=5 smallest on busiest service |

## Fix propositions (ranked by impact ÷ effort)

1. **Publish real IPv6 for the API ingress** (Hetzner v6 is free; AAAA via external-dns).
   Directly fixes NAT64-path users — including this machine. Small infra change.
2. **Put the API behind Cloudflare** — either orange-cloud the five API DNS records or,
   better, serve the API same-origin (`wordsparrow.io/api/*` proxied to Hetzner). Same-origin
   eliminates *all* preflights, extra DNS/TLS setups, and cross-site cookie friction; CF keeps
   warm connections to origin and terminates TLS near the user. **Needs an ADR** (deploy-target
   change; CORS/cookie-domain implications for `__Secure-ws_session`).
3. **Cache headers on immutable GETs** — `GET /v1/puzzles/daily` is immutable per day
   (ADR-0081 freezes daily clues): `Cache-Control: public, s-maxage=<until-midnight-Paris>,
   stale-while-revalidate` + ETag; same for `daily/list`. With (2), the world hits CDN cache
   at ~20 ms. Also add `Timing-Allow-Origin` so browser RUM/OTel sees real API timing splits.
4. **Cut the cold-start waterfall in the frontend**: `<link rel="preconnect">` for api+auth
   origins in `index.html`, and kick off the daily-puzzle/whoami fetches at module top-level
   (before React mounts) instead of in effects — saves ~200–500 ms cold.
5. **Parallelize the authed `/play` loader** — fire `fetchDaily` and the progress pull
   concurrently, or render the grid immediately and merge progress on arrival.
6. **Tame whoami** — skip the `visibilitychange` refetch unless stale (e.g. >5 min), and
   collapse the server's 3 serial queries into one JOIN.
7. **Future-proofing (no urgency)**: survey random-pick strategy before `survey_items` grows;
   raise grid Hikari pool from 5; `/abonnement` currently blocks on a live Mollie
   `listReceipts` call (`ListReceipts.kt:16`) — cache or load lazily.

## Verification ideas

- Re-test from a wired/dual-stack network to separate H1 from H2 in your own experience.
- Pull real-user percentiles from SigNoz (blocked this session: prod-exec permission).
- After fixes: assert `curl -s -D-` shows Cache-Control/AAAA; browser waterfall shows no
  OPTIONS and fetch start < 300 ms.
