# Workers static-assets migration — implementation plan

> For agentic workers: one PR per wave via the dispatch skill (worktree per PR, §6a review,
> auto-merge on green+LGTM). Spec: `docs/superpowers/specs/2026-07-03-workers-static-assets-migration-design.md`
> (maintainer-approved 2026-07-03). Facts verified against the repo + Cloudflare migration guide same day.

**Goal:** move frontend hosting from Cloudflare Pages to Workers static assets with zero
user-visible change, per-PR previews preserved, and a 1-month 301 grace period for
`bliss-cb4.pages.dev`.

**Architecture:** assets-only Worker declared in a committed `frontend/wrangler.jsonc`,
deployed by `cloudflare/wrangler-action` from the existing `deploy-frontend.yml`; custom
domains attach via wrangler `routes` at cutover; Terraform keeps zone-level resources and
the Pages project until decommission.

## Global constraints

- Conventional commits, single scope, DCO (`git commit -s`), no PascalCase first word.
- One-line comments only. No schema changes. 400-line soft target per PR.
- Build pipeline steps (pnpm 11.7.0, node from `.nvmrc`, Playwright chromium for the ADR-0053
  prerender, `build` vs `build:preview` split, `pnpm test:post-build` SEO assertions) are
  preserved byte-for-byte — only the publish step and preview comment change.
- Operator prerequisite before PR 2 merges: repo secret `CLOUDFLARE_API_TOKEN` gains
  `Account → Workers Scripts → Edit`. (DONE 2026-07-03 per maintainer.)

---

## PR 1 `docs(adr)`: ADR-0090 hosting migration (bundles spec + this plan)

**Files:** create `docs/adr/0090-frontend-hosting-workers-static-assets.md`; modify
`docs/adr/INDEX.md`; the spec + this plan are already committed on the branch
`docs/adr-0090-workers-static-assets` — build on it.

- ADR content: Decision = spec "Target state" + ownership split (wrangler.jsonc owns
  worker+domains; TF owns zone-level + Pages-project-until-deleted); Amends ADR-0004
  (Pages hosting) — Pages remains only as the grace-period redirect; Alternatives = spec's
  rejected B (TF-owned worker) and C (Workers Builds) with reasons; Consequences incl.
  preview-URL host change and Early-Hints unavailability (unused).
- INDEX.md rows: `frontend/wrangler.jsonc`, `.github/workflows/deploy-frontend.yml`,
  `terraform/cloudflare-pages*.tf` → ADR-0090. Verify next free ADR number is 0090 at
  branch time (`ls docs/adr/0090-*` on origin/main); renumber everywhere if taken.
- Verify: `registry-coherence` gate green. Branch `docs/adr-0090-workers-static-assets`.

## PR 2 `feat(infra)`: assets-only worker + workflow switch (no user-facing change)

**Files:** create `frontend/wrangler.jsonc`; modify `.github/workflows/deploy-frontend.yml`
(publish step + permissions + preview comment); modify `frontend/package.json` (+ lockfile)
adding pinned `wrangler` devDependency.

- `frontend/wrangler.jsonc` (NO `routes` in this PR):
  ```jsonc
  {
    "name": "wordsparrow-frontend",
    "compatibility_date": "<the PR's merge-week date>",
    "assets": {
      "directory": "./dist",
      "not_found_handling": "single-page-application"
    },
    "preview_urls": true
  }
  ```
- Workflow: replace the `cloudflare/pages-action` step with `cloudflare/wrangler-action`
  (pin by commit SHA, digest-pin rule), `workingDirectory: frontend`,
  `command: deploy` on main-push, `command: versions upload` on PRs. Fetch the
  wrangler-action README FIRST (fetch-known-example rule) to confirm the exact outputs
  key for the preview URL (`deployment-url` vs `command-output`) before wiring the
  PR-comment step (`actions/github-script` upserting one sticky comment). Keep draft-skip,
  path filters, concurrency-cancel, and all build steps unchanged. Drop the
  now-unneeded `deployments: write` permission if wrangler-action doesn't need it (verify
  in its README).
- `pnpm add -D wrangler@<current-4x>` in frontend so CI and local use one pinned version
  (`wrangler-action` gets `wranglerVersion` from the lockfile-installed version or pin the
  same version in the action input — pick ONE source of truth and say which in the PR body).
- Grep `rg -n "pages.dev" --glob '!node_modules'` — expected hits: CLAUDE.md Live line
  (handled in PR 3), terraform README, ADR-0004 (historical, leave). Anything else: report.
- **Verification (post-merge, orchestrator-run):** on `https://wordsparrow-frontend.<account>.workers.dev`:
  bundle serves + h3; `curl -sD-` shows the `_headers` security headers; deep link
  `/grilles` returns 200 with the SPA shell; open one test PR touching `frontend/**` →
  preview URL comment appears and serves the MSW preview build.
- Branch `feat/frontend-workers-deploy`. Note in PR body: production domains still on
  Pages; this PR is dark infrastructure.

## PR 3 `feat(infra)`: cutover + grace redirect

**Files:** modify `frontend/wrangler.jsonc` (add routes); modify `terraform/cloudflare-pages-domain.tf`
(remove both `cloudflare_pages_domain` resources; keep `cloudflare_pages_project`); create
`frontend/pages-legacy-redirect/_redirects` (`/* https://wordsparrow.io/:splat 301`) +
minimal `index.html` fallback; modify `CLAUDE.md` (Live: line → `https://wordsparrow.io`);
check `docs/infra/topology.yaml` (if the Pages node/edges are modeled, update + `make diagrams`
+ commit README.md — the drift gate arbitrates).

- wrangler.jsonc gains:
  ```jsonc
  "routes": [
    { "pattern": "wordsparrow.io", "custom_domain": true },
    { "pattern": "www.wordsparrow.io", "custom_domain": true }
  ]
  ```
- **Cutover runbook (PR body; orchestrator executes post-merge, in this order, back-to-back):**
  1. `terraform apply` (detaches the two Pages custom domains — apex + www DNS records freed).
  2. Immediately trigger the deploy-frontend workflow on main (or let the merge-push run do
     it) so `wrangler deploy` attaches both custom domains. Expected gap: seconds.
  3. One-off legacy redirect: `pnpm dlx wrangler@<pinned> pages deploy frontend/pages-legacy-redirect --project-name=bliss --branch=main` (CI token scope Pages:Edit already present).
  4. Verify: `curl -sD- https://wordsparrow.io/` (200, h3, `_headers` present, served by
     the Worker); deep link 200; `curl -sD- https://bliss-cb4.pages.dev/grilles` → 301 to
     `https://wordsparrow.io/grilles`; Matomo + OTel beacons observed in a real page load.
  - Rollback: revert the PR; `terraform apply` re-creates the Pages domains; re-run the
    frontend deploy from the revert commit (Pages project still holds the last real build
    until step 3 — so run step 3 ONLY after step-2 verification passes).
- Branch `feat/frontend-workers-cutover`.

## Post-wave

- File issue (status:idea): "T+1 month (2026-08-03): delete the bliss Pages project —
  remove `cloudflare_pages_project`/outputs from terraform, `terraform apply`, drop the
  legacy-redirect stub dir, sweep remaining `pages.dev` references."
- Update memory/log: hosting = Workers static assets; preview URLs on workers.dev.

## Self-review notes

Spec coverage: target-state config → PR 2/3; ownership split + amends ADR-0004 → PR 1;
grace redirect + CLAUDE.md + topology → PR 3; deferred deletion → issue. Preview mechanism,
token prerequisite, rollback all carried into PR bodies. No placeholders except the two
explicitly implementer-resolved pins (compatibility_date, wrangler version/SHA — resolution
instructions given inline).
