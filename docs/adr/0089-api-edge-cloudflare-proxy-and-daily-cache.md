# ADR-0089: API edge — Cloudflare proxy for non-WS hosts, daily-cache policy, regen purge

## Status
Accepted (maintainer approved the rollout plan in-session, 2026-07-03)

## Context
The 2026-07-03 performance analysis
(`docs/superpowers/plans/2026-07-03-query-timings-perf-analysis.md`) measured a fast backend —
every page-load query completes in ≤ ~40 ms of server-side processing — behind a slow path to
it. Two multiplying factors dominate perceived latency:

- **Round-trip amplification.** A cold visitor pays ~5–6 *serial* round trips to a single
  Hetzner origin before any data renders: JS boot (fetches start ~570 ms after navigation),
  per-API-origin DNS+TCP+TLS (~150–200 ms each, up to 4 origins per session), a CORS preflight
  per endpoint URL, then the GET. No endpoint emits `Cache-Control` or `ETag`; there is no CDN
  in front of the API.
- **No real IPv6 on the API hosts.** `dig AAAA api.wordsparrow.io @1.1.1.1` returns nothing —
  the origin is IPv4-only, so IPv6-only/NAT64 clients transit a translation gateway. Measured
  on such a network: RTT to the Hetzner origin 1.0–1.6 s during congestion windows while
  Cloudflare-served assets (real AAAA) stayed fast. API fetch durations of 2–3 s were observed
  on `/` while FCP stayed under 500 ms.

The standing DNS posture is ADR-0007 §4 ("No proxy / orange-cloud — DNS-only mode keeps the
API path clean for SSE and any future WebSocket without a Cloudflare middleman"), carried
forward after the k3s migration by external-dns's `--no-cloudflare-proxied` default
(`infra/platform/values.yaml`, which cites the posture as "ADR-0007 §2"). That blanket rule
predates WebSockets being confined to one host: today only `game.wordsparrow.io` carries WS
traffic (ADR-0018), and Cloudflare's free tier is only hostile to *it* (proxy idle-timeout on
long-lived connections). The other API hosts pay the no-edge penalty for a reason that no
longer applies to them.

Caching the daily puzzle is newly safe because of ADR-0081: each (re)generation mints a fresh
random UUID v7 and the date resolves to the most-recently-created row, so a puzzle response is
immutable per id — the id itself is a correct strong validator. One complication: the daily
GET embeds a per-user hint budget (`hintsRemaining`, `secondsUntilNextHint`) when a
`__Secure-ws_session` cookie is present, so only the anonymous variant may be publicly cached.

## Decision

### 1. Proxy scope: orange-cloud api + auth; game stays gray
Orange-cloud `api.wordsparrow.io` (grid) and `auth.wordsparrow.io` (identity) via the
per-Ingress annotation `external-dns.alpha.kubernetes.io/cloudflare-proxied: "true"` in each
chart's `values-prod.yaml`. external-dns already runs the cloudflare provider with
`--no-cloudflare-proxied` as the *default* (`infra/platform/values.yaml`); the annotation
overrides it per record, so the platform default stays untouched. `game.wordsparrow.io` stays
gray-cloud — Cloudflare's free-tier WS idle timeout would sever live sessions, so ADR-0007's
reasoning survives for WS hosts only. `billing`/`survey`/`otlp`/`analytics` stay gray for now;
extending the proxy to them is a follow-up after the pattern proves out on grid + identity.
Proxying also publishes edge AAAA records for the proxied hosts, fixing the measured
NAT64-path penalty (the origin is IPv4-only and gains no AAAA of its own).

### 2. TLS: keep HTTP-01 through the proxy
Keep the existing HTTP-01 ClusterIssuer
(`infra/platform/templates/clusterissuer-letsencrypt.yaml`, solver `http01` / ingress class
`nginx`); the ACME challenge flows through the Cloudflare proxy to the origin. The rollout
includes a forced-renewal verification (`cmctl renew` or re-annotate) on both proxied hosts
right after the flip. Rollback = remove the annotation; external-dns reverts the record to
gray. Pre-flight checked at flip time: the zone SSL mode is Full (strict).

### 3. Cache policy for the daily endpoints
`GET /v1/puzzles/daily[?date=]`:

- **Cookie-less:** `Cache-Control: public, no-cache, s-maxage=<seconds-to-next-UTC-midnight>`
  plus a strong `ETag: "<puzzleId>"`, answering `304` on an `If-None-Match` match. Browsers
  revalidate on every use (`no-cache`); the Cloudflare edge holds the 200 until UTC midnight
  or an explicit purge.
- **With the `__Secure-ws_session` cookie:** `Cache-Control: private, no-store` — the response
  embeds the per-user hint budget (`hintsRemaining`, `secondsUntilNextHint`) and must never be
  shared.

`GET /v1/puzzles/daily/list`: `public, no-cache` + ETag only — **no edge caching**. Free-plan
purge is exact-URL and the endpoint's query-string variants are unbounded, so a cached copy
could not be reliably purged.

### 4. Edge cache rule (Terraform)
A net-new `terraform/cloudflare-cache-rules.tf` declares one `cloudflare_ruleset` in phase
`http_request_cache_settings` (provider `cloudflare ~> 5.20` is already pinned at root,
`terraform/versions.tf`): scoped to host `api.wordsparrow.io` + path `/v1/puzzles/daily`,
eligible for cache with "respect origin TTL", bypassing whenever the request cookie contains
`__Secure-ws_session`.

### 5. Purge-on-regen
The grid worker purges the edge after every generation run (ensure + regen paths): exact URLs
`…/v1/puzzles/daily` and `…/v1/puzzles/daily?date=<d>` for each persisted date. A purge
failure logs an error but does not fail the Job — worst-case staleness is bounded by the
until-midnight edge TTL, and a manual one-line purge is documented. A new k8s Secret carries a
Cloudflare API token scoped to `Zone.Cache Purge` only.

### 6. Timing-Allow-Origin for RUM
All five services add
`Timing-Allow-Origin: https://wordsparrow.io https://www.wordsparrow.io` in their
`DefaultHeaders` so browser OTel resource timings (ADR-0033) stop being opaque for
cross-origin API fetches.

### 7. Regen-propagation guarantee
A regenerated daily propagates immediately by construction: regeneration mints a fresh UUID
(ADR-0081) → the ETag flips → every browser holding the old copy revalidates on next use
(`no-cache`) and gets a `200` with the new body; the edge copy is purged by §5. Worst-case
staleness — purge fails *and* nothing retries — is the until-midnight edge TTL, never a
silently wrong grid replayed onto stale progress (ADR-0081 already guarantees the new id
starts from fresh state).

### Alternatives considered
- **Same-origin `/api/*` through Cloudflare** (kills all preflights and per-origin TLS
  setups): a much bigger migration — OAuth redirect URIs, the `__Secure-ws_session` cookie
  domain, and every MSW handler move. Deferred, not rejected; the proxy step is compatible
  with doing it later.
- **Switch the ClusterIssuer to DNS-01**: unnecessary while HTTP-01 verifies through the
  proxy (§2's forced-renewal check proves it); revisit only if that verification fails.
- **Origin IPv6 on Hetzner** (real AAAA on the ingress): subsumed by the proxy's edge AAAA
  for the hosts that matter; not pursued separately.

## Consequences
- **Amends ADR-0007 §4** (the "no proxy / orange-cloud — DNS-only" posture, cited elsewhere
  as ADR-0007 §2): gray-cloud-everything narrows to *WS hosts only*. Non-WS API hosts may be
  proxied; `game` stays gray until the WS-through-proxy story changes.
- **Anonymous daily traffic is served from the Cloudflare edge** (`cf-cache-status: HIT`),
  cutting the dominant page-data fetch from an origin round trip to an edge one; repeat
  visits revalidate with 304s.
- **Authed traffic bypasses the cache end-to-end**: `private, no-store` at origin, cookie
  bypass at the edge — the hint budget is never shared or stale.
- **New coupling: grid worker → Cloudflare API** for purge, with a new secret to provision
  and rotate (`docs/secrets.md` entry lands with the implementation PR). Purge failure is
  observable (error log) but non-fatal.
- **TLS renewal now transits the proxy**; a renewal regression surfaces at the §2 forced
  renewal, and rollback is a single annotation removal.
- Implementation lands in the follow-up waves of
  `docs/superpowers/plans/2026-07-03-perf-edge-caching-rollout.md`; this ADR is
  governance-only (ADR-0001 §7).
