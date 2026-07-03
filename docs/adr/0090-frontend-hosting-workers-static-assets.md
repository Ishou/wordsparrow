# ADR-0090: Frontend Hosting on Workers Static Assets

## Status

Accepted — maintainer approval 2026-07-03 ("hop on cloudflare workers … the
project is young, i prefer doing it now"), recorded in the bundled spec
(`docs/superpowers/specs/2026-07-03-workers-static-assets-migration-design.md`).

Amends ADR-0004: the frontend's production host moves from Cloudflare Pages
to Cloudflare Workers static assets. ADR-0004's decisions on *what* deploys
(the static bundle), *how* (GitHub Actions; CI is the only path to
production), promotion (previews on PR, production on `main`), and rollback
(revert + redeploy) all stand; only the hosting product changes. The Pages
project survives solely as a grace-period redirect (see Consequences).

## Context

Cloudflare has moved all platform investment to Workers. Workers static
assets reached feature parity with Pages in March 2026 and is Cloudflare's
recommended target for new projects; Pages remains supported but absorbed —
"all investment, optimizations, and feature work" goes to Workers
(Workers static-assets docs, migrate-from-Pages guide, and the Cloudflare
full-stack announcement, all re-verified 2026-07-03).

Everything ADR-0004 valued about Pages carries over: `_headers` and
`_redirects` are natively supported per the migration guide, SPA deep-link
fallback is available (explicitly, via `not_found_handling =
"single-page-application"`, where Pages did it implicitly), per-PR preview
deploys exist (`wrangler versions upload` → preview URL), and apex + www
custom domains attach via Cloudflare-managed custom domains (the
nameservers are already on Cloudflare).

The project is young: migrating now costs a few small PRs; migrating later
costs the same plus accumulated coupling. Bonus alignment: a future
same-origin `wordsparrow.io/api/*` (deferred in ADR-0089's alternatives)
becomes a fetch handler in this same Worker instead of a separate mechanism.

## Decision

### 1. Target state

An assets-only Worker `wordsparrow-frontend` (no `main` script, no ASSETS
binding), declared in a committed `frontend/wrangler.jsonc`:

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

The `routes` block is added only at cutover; the Worker first ships dark on
`workers.dev` with full verification (headers, SPA deep links, a real PR
preview) before any domain moves.

`.github/workflows/deploy-frontend.yml` keeps every build step byte-for-byte
and swaps only the publish step: `cloudflare/wrangler-action` replaces the
deprecated `cloudflare/pages-action`. Push to `main` → `wrangler deploy`.
PR → `wrangler versions upload` → preview URL commented on the PR
(replacing the pages.dev preview aliases; preview builds stay
MSW-self-contained, so the host change is cosmetic). Draft-skip, path
filters, and concurrency-cancel behavior are preserved. `wrangler` is
pinned in frontend devDependencies. `_headers` / `_redirects` continue to
ship from `frontend/public/` into `dist/` unchanged.

### 2. Ownership split: wrangler vs Terraform

- `frontend/wrangler.jsonc` owns the Worker: its name, assets config,
  preview URLs, and (at cutover) the two custom-domain routes. The deploy
  workflow applies it; the file is the committed, auditable declaration.
- Terraform keeps zone-level resources (the ADR-0089 cache ruleset, DNS
  records) and the Pages project until decommission. At cutover, Terraform
  removes the two `cloudflare_pages_domain` attachments; the
  `cloudflare_pages_project` resource stays for the grace period.
- Terraform does NOT own the Worker. Deploying through Terraform would
  churn state on every release (see Alternatives).

### 3. Grace period for the legacy URL

`bliss-cb4.pages.dev` lives on for ~1 month as a 301 redirect to
`wordsparrow.io` (a stub `_redirects` deployed to the Pages project as its
final deployment), then the Pages project is deleted — maintainer decision
2026-07-03, tracked as a deferred T+1-month issue.

## Alternatives considered

- **Terraform-owned Worker (deploy through TF).** Every frontend release
  would mutate Terraform state, entangling `terraform apply` with the
  deploy cadence and making CI deploys and IaC drift detection fight each
  other. Rejected: TF keeps zone-level scope; the Worker is wrangler's.
- **Cloudflare Workers Builds (git integration).** Moves the deploy out of
  GitHub Actions, violating "CI is the only path to production"
  (ADR-0004 §3) and hiding the build pipeline from the repo. Rejected.
- **Stay on Pages.** Supported but frozen; the investment gap with Workers
  only widens, and a later forced migration pays today's cost plus
  accumulated coupling. Rejected — the project is young, migrate now.

## Consequences

### Easier

- The frontend rides the platform Cloudflare actually invests in; parity
  features (SPA fallback, preview URLs) are explicit config instead of
  Pages-implicit behavior.
- A future same-origin `/api/*` (ADR-0089 deferral) is a fetch handler in
  this same Worker, not a new mechanism.
- The deploy pipeline sheds a deprecated action (`cloudflare/pages-action`).

### Harder / different

- **Preview URLs move to `workers.dev`** (`wrangler versions upload`
  preview URLs, commented on the PR) — anything assuming a `pages.dev`
  preview host must adjust; the migration PRs grep for stragglers.
- **Early Hints is unavailable** on Workers static assets. It is not
  currently used, so nothing is lost today; if it ever becomes wanted,
  that is a new trade-off to evaluate.
- **The Pages project lives on ~1 month** as a 301 redirect from
  `bliss-cb4.pages.dev` to `wordsparrow.io`, then gets deleted (Terraform
  + reference sweep) via a tracked follow-up issue.
- **Rollback** = revert the cutover PR: `terraform apply` re-attaches the
  Pages custom domains and a redeploy from the revert commit restores the
  Pages path; the Worker keeps serving only `workers.dev`. The redirect
  stub is deployed to Pages only after cutover verification passes, so the
  project still holds the last real build while rollback is plausible.
