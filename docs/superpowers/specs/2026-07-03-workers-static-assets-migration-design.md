# Frontend hosting: Cloudflare Pages → Workers static assets — design

Approved by the maintainer 2026-07-03 ("hop on cloudflare workers … the project is young,
i prefer doing it now"), with a grace period for the legacy Pages URL.

## Why now

Cloudflare has moved all platform investment to Workers; Workers static assets reached
feature parity with Pages in March 2026 and is the recommended target for new projects
(sources: Workers static-assets docs, migrate-from-Pages guide, CF full-stack announcement).
Pages remains supported but absorbed — "all investment, optimizations, and feature work"
goes to Workers. The project is young: migrating now costs a few small PRs; migrating later
costs the same plus accumulated coupling. Bonus alignment: a future same-origin
`wordsparrow.io/api/*` (deferred in ADR-0089's alternatives) becomes a fetch handler in this
same Worker instead of a separate mechanism.

## Decision drivers / constraints

- Parity must hold for: `_headers` + `_redirects` (natively supported per the migration
  guide), SPA deep-link fallback (`assets.not_found_handling = "single-page-application"` —
  explicit on Workers where Pages did it implicitly), per-PR preview deploys, apex + www
  custom domains (nameservers are on Cloudflare — requirement met).
- "CI is the only path to production": deploys stay in `.github/workflows/deploy-frontend.yml`.
- IaC auditability: the worker + its domains are declared in a committed `frontend/wrangler.jsonc`;
  Terraform keeps zone-level resources (cache ruleset, TXT record) and the Pages project until
  decommission. TF does NOT own the worker (deploy-through-TF churns state on every release —
  rejected approach B). Cloudflare Workers Builds (git integration) rejected — moves deploy
  out of GHA (approach C).
- Legacy URL `bliss-cb4.pages.dev`: grace period ~1 month as a 301 redirect to
  wordsparrow.io, then delete (maintainer decision 2026-07-03).

## Target state

- Worker `wordsparrow-frontend`, assets-only (no `main` script, no ASSETS binding):
  ```jsonc
  {
    "name": "wordsparrow-frontend",
    "compatibility_date": "<merge date>",
    "assets": {
      "directory": "./dist",
      "not_found_handling": "single-page-application"
    },
    "preview_urls": true,
    "routes": [
      { "pattern": "wordsparrow.io", "custom_domain": true },
      { "pattern": "www.wordsparrow.io", "custom_domain": true }
    ]
  }
  ```
  (routes added only at cutover — see rollout.)
- `deploy-frontend.yml`: `cloudflare/wrangler-action` replaces the deprecated
  `cloudflare/pages-action`. Push to main → `wrangler deploy`. PR → `wrangler versions
  upload` → preview URL commented on the PR (replaces pages.dev preview aliases; preview
  builds stay MSW-self-contained so the host change is cosmetic). Draft-skip, path filter,
  and concurrency-cancel behavior preserved. `wrangler` pinned in frontend devDependencies.
- `_headers`/`_redirects` continue to ship from `frontend/public/` into `dist/` unchanged.

## Rollout (3 PRs + 1 deferred issue)

1. **PR 1 — ADR-0090** (docs-only, bundles this spec + the implementation plan): hosting
   migration decision, amends ADR-0004; records the wrangler-vs-terraform ownership split,
   grace period, rollback. INDEX.md rows for `frontend/wrangler.jsonc`,
   `.github/workflows/deploy-frontend.yml`.
2. **PR 2 — worker + workflow** (no user-facing change): add `wrangler.jsonc` WITHOUT
   `routes`; rewrite the workflow; verify on `workers.dev`: bundle serves, security headers
   from `_headers` present, deep link `/grilles` returns 200 + SPA content, one real PR
   preview URL works. Operator prerequisite BEFORE merge: add `Account → Workers Scripts →
   Edit` to the repo's `CLOUDFLARE_API_TOKEN` secret. (DONE 2026-07-03 per maintainer.)
3. **PR 3 — cutover**: add the two `custom_domain` routes; Terraform removes the two
   `cloudflare_pages_domain` attachments (project stays); deploy a stub `_redirects`
   (`/* https://wordsparrow.io/:splat 301`) to the Pages project as its final deployment;
   update the stale `CLAUDE.md` "Live:" line to wordsparrow.io; update
   `docs/infra/topology.yaml` if it models the Pages node + `make diagrams`. Cutover is a
   Cloudflare-internal flip (seconds). Verification: prod smoke (headers, h3, deep links,
   Matomo/OTel beacons), `bliss-cb4.pages.dev/<any>` 301s to wordsparrow.io.
   Rollback: revert PR 3, `terraform apply` re-attaches the Pages domains, redeploy worker
   without routes.
4. **Deferred issue (T+~1 month)**: delete the Pages project (TF) + remaining references.

## Out of scope

- Same-origin `/api/*` routing through the Worker (separate decision; trigger recorded in
  ADR-0089 alternatives + backlog).
- Early Hints (unsupported on Workers assets; not currently used).
- Any change to game/otlp/analytics hosting.

## Risks

- CI token under-scoped → PR 2's deploy fails fast, no user impact (workers.dev only).
- SPA fallback behavior differences → caught by PR 2's deep-link verification before any
  domain moves.
- Preview-URL shape change breaks a hardcoded assumption → grep for `pages.dev` in repo
  during PR 2 (known: CLAUDE.md Live line, handled in PR 3).
- Custom-domain flip races DNS → routes use Cloudflare custom domains (CF manages the DNS
  records atomically); worst case is seconds of 522, rollback documented.
