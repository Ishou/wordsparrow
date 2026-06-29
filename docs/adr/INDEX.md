# ADR Path Registry

> **Purpose.** Map source-tree paths to the ADRs that govern them, so any
> agent (human or AI) editing those paths knows which decisions are binding
> *before* writing code. Skip this and you ship the next recurrence of an
> already-decided incident (see the 2026-05-26 5th-CORS bug — ADR-0048 was
> canonical, the survey-api scaffolding agent never read it).
>
> **How to use.** Run `scripts/adr-context.sh <path>...` — it greps this
> file for matching globs and emits the bodies of the matching ADRs to
> stdout. Inline that output into the implementer prompt at dispatch time
> (the dispatch skill does this automatically). For one-off edits, read
> the ADRs in full before touching the file.
>
> **How to maintain.** This file is a registry, not a memo. Every new ADR
> with operational bite goes here in the same PR that adds the ADR; CI's
> `registry-coherence` workflow fails any PR that touches `docs/adr/NNNN-*.md`
> without updating this file. Globs are bash-style (`*` does not cross `/`,
> `**` does). One ADR can appear under multiple globs.

## Format

```
<ADR-id>  <path glob>                              <one-line rule reminder>
```

Lines are matched literally by `scripts/adr-context.sh`. Keep the glob
column aligned for grep-ability; the one-liner is for humans skimming this
file, not for the helper script.

## Registry

```
ADR-0001  .claude/skills/dispatch/**               Parallel-agent workflow: branch naming, cap, §6a review/fix cycle
ADR-0001  docs/superpowers/plans/**                Orchestration procedures follow ADR-0001 §2-§7
ADR-0001  docs/superpowers/specs/**                Specs precede plans; both follow ADR-0001 §3
ADR-0003  */api/openapi.yaml                       Schema-first contract; merge schema-only PRs first
ADR-0003  */api/asyncapi.yaml                      Same as openapi but for event channels (ADR-0019)
ADR-0003  frontend/src/infrastructure/api/**/types.ts  Generated; never hand-edit (drift gate)
ADR-0007  */api/src/**/config/*.kt                 Runtime config from env vars; fail-fast at boot
ADR-0009  infra/platform/charts/**                 Self-managed k3s on Hetzner; helm chart layout
ADR-0009  .github/workflows/deploy-api-k8s.yml     Deploy pattern: configure-in-cluster, not push-from-CI
ADR-0010  terraform/**                             OpenTofu remote state on Hetzner
ADR-0011  terraform/k8s/**                         k8s subtree provisioned by OpenTofu
ADR-0013  */worker/src/**                          Batch worker pattern (words/clues)
ADR-0018  game/**                                  Game bounded context: HTTP + WebSocket
ADR-0019  */api/asyncapi.yaml                      AsyncAPI 2.6, not 3.x
ADR-0025  frontend/src/**/analytics/**             Matomo + RGPD posture
ADR-0026  frontend/**/sw.*                         PWA offline cache via Workbox
ADR-0026  frontend/src/ui/v2/UpdatePrompt.*        PWA update prompt (2026-06-29 amendment)
ADR-0027  infra/observability/**                   SigNoz on ClickHouse
ADR-0038  infra/observability/**                   k8s-infra subchart for per-pod/node metrics; OTLP exporter preset pins
ADR-0030  infra/observability/templates/oauth2-proxy.yaml   oauth2-proxy htpasswd-only; session cookie for SigNoz SPA; no OIDC
ADR-0030  infra/observability/values.yaml                   oauth2Proxy.image.tag pin (v7.15.3); Renovate keeps current
ADR-0033  frontend/src/**/otel/**                  Frontend OTel public ingest; emits traceparent/tracestate
ADR-0033  frontend/src/infrastructure/api/**       Browser SDK adds traceparent to every cross-origin fetch
ADR-0034  */api/src/**/Module.kt                   CORS: allowHeaders { true } (wildcard predicate)
ADR-0042  */worker/src/**/pre*generation/**        Daily puzzle pre-gen worker (k8s CronJob)
ADR-0044  identity/**                              Identity bounded context for player OIDC
ADR-0044  */api/src/**/persistence/*Database.kt    CNPG libpq URI → toJdbcUrl(); never pass raw uri to Hikari
ADR-0044  */api/src/**/SessionMiddleware.kt        Session cookie verification via identity-api
ADR-0045  identity/**                              Player-identity data minimization (RGPD)
ADR-0046  identity/api/build.gradle.kts            Nimbus JOSE JWT pinned dependency
ADR-0047  identity/api/src/**/token/**            Token endpoint exchange threat model
ADR-0048  */api/src/**/Module.kt                   CORS wildcard for credentialed contexts (mirrors identity)
ADR-0048  */api/src/test/**/CorsTest.kt            Mandatory CORS regression test (traceparent/tracestate)
ADR-0048  */api/src/test/**/architecture/CorsWildcardArchitectureTest.kt  Konsist guard: credentialed-CORS wildcard predicate
ADR-0049  */api/src/**/nats/**                     JetStream cross-context events (must start before Ktor serves)
ADR-0049  */infrastructure/src/**/nats/**          JetStream consumer pattern
ADR-0050  frontend/**                              A11y baseline: WCAG AA, axe-core via Playwright
ADR-0053  frontend/src/**/prerender/**             Build-time SEO prerender
ADR-0053  frontend/vite.config.ts                  SW navigateFallbackDenylist for post-Workbox flat prerendered routes
ADR-0054  frontend/src/ui/**                       Page-shell primitive
ADR-0055  game/**/persistence/**                   Multiplayer game persistence
ADR-0056  survey/**                                Survey bounded context (RLHF clue rating; pairwise comparison task pulled from v2 deferral)
ADR-0057  modal_jobs/**                            Cloud-GPU finetune lane (Modal)
ADR-0058  data/external/**                         Licensed-data posture (commercial intent); per-source verdict matrix
ADR-0058  data/dbnary/**                           DBnary SA-acceptance + distribution discipline
ADR-0058  scripts/clue_generation/**               Training/filter paths must classify per ADR-0058 matrix
ADR-0058  scripts/eval/**                          Same — eval paths that feed training must classify
ADR-0058  modal_jobs/**                            Training/inference on Modal must classify per ADR-0058 (incl. the Command-R base model)
ADR-0059  survey/**/persistence/**                 Campaign lifecycle: campaigns table, partial-unique open invariant
ADR-0059  survey/**/usecases/SubmitRatingUseCase.kt           Locked arm + campaign_id stamping
ADR-0059  survey/**/usecases/SubmitPairRatingUseCase.kt       Locked arm + campaign_id stamping
ADR-0059  survey/**/usecases/UndoActionUseCase.kt             Undo grace-window (campaign-open + 8 s close grace); grace is sole gate
ADR-0059  survey/api/openapi.yaml                  /v1/campaign/current + 423 on rating POSTs
ADR-0059  frontend/src/ui/components/sondage/**    LockBanner + useCampaignStatus + disabled cards
ADR-0059  scripts/survey/backfill_campaigns.py     Historical campaign attribution from Modal logs
ADR-0060  identity/**                              Identity user roles + UserRoleChanged event
ADR-0061  survey/**/persistence/V11__*.sql          V11 migrate: drop survey_word_meta, collapse categorie (48→18 classes), add per-rating target_categories/target_sense/is_multisense/sub_tags
ADR-0061  survey/**/text/GlossNormalizer.kt        Soft normalization rules for autocomplete + inventory dedup
ADR-0061  survey/api/openapi.yaml                  GET /v1/lemma-meta/{mot} aggregates prior ratings; PUT /v1/lemma-meta removed; RatingRequest carries target_categories/target_sense/is_multisense/sub_tags; write path admits any authenticated rater (maintainer wins on resolution)
ADR-0061  frontend/src/ui/components/sondage/**    Category multi-select (19 classes) + single sense gloss + is_multisense flag + sub-tag chips; difficulté default = 3
ADR-0062  survey/**/model/Pos.kt                   Lemma-anchored taxonomy: verbe_conjugue removed; verbs are verbe_infinitif, conjugation is grid-time
ADR-0062  survey/api/openapi.yaml                  Pos enum drops verbe_conjugue / VERBE_CONJUGUE
ADR-0062  scripts/clue_generation/pipeline_v2/run_pipeline.py    POS allowlist drops verbe_conjugue (generation is lemma-only)
ADR-0062  modal_jobs/04_generate_command_r.py      POS phrasing map drops verbe_conjugue
ADR-0062  frontend/src/infrastructure/api/survey/types.ts    Pos enum regenerated without verbe_conjugue / VERBE_CONJUGUE
ADR-0062  frontend/src/application/survey/types.ts           Hand-maintained Pos type drops verbe_conjugue
ADR-0062  frontend/src/ui/components/sondage/labels.ts       POS label map drops verbe_conjugue entry
ADR-0063  scripts/clue_generation/*judge*          Learned clue-quality judge: CamemBERT-probe shadow pre-filter at filter_8 ahead of human rating; human stays reward signal
ADR-0063  scripts/clue_generation/pipeline_v2/judge.py  Judge pre-filter insertion point; shadow mode (score + log, accept all) until enforcement flip
ADR-0064  frontend/lighthouserc.cjs                Lighthouse perf/best-practices/SEO assertions; a11y category disabled (axe canonical per ADR-0050)
ADR-0064  .github/workflows/lighthouse.yml         Lighthouse perf baseline workflow; workflow_run on Deploy Frontend; audits <hash>.bliss-cb4.pages.dev preview or wordsparrow.io
ADR-0064  .github/workflows/deploy-frontend.yml    Emits lighthouse-handoff artifact consumed by lighthouse.yml
ADR-0065  .github/workflows/build-and-push-image.yml  Trivy image-CVE scan (CRITICAL-only, SARIF)
ADR-0065  .github/workflows/trivy-config.yml       Trivy IaC misconfig scan (infra/, terraform/, Dockerfiles)
ADR-0065  .github/workflows/codeql.yml             SAST coverage extends to javascript-typescript
ADR-0065  .github/workflows/dependency-review.yml  License deny-list (GPL-2.0/GPL-3.0/AGPL-3.0 all variants) extending ADR-0058 to deps
ADR-0066  game/api/openapi.yaml                    Cross-device "Mes parties": new GET /v1/users/me/lobbies (cookie-authed, user-scoped); /v1/sessions/{sessionId}/lobbies retained for anon
ADR-0066  frontend/src/ui/routes/accueil.tsx       Accueil loader picks listLobbiesForUser when auth.status === 'authed'; falls back to session-scoped listMyLobbies otherwise
ADR-0066  frontend/src/application/game/LobbyClient.ts   LobbyClient port gains listMyLobbiesForUser() alongside listMyLobbies(sessionId)
ADR-0067  infra/tools-upgrade-sources.yaml           Superseded by ADR-0068; see ADR-0068 row
ADR-0068  scripts/breaking-bump/**                   Deterministic core of the breaking-bump pipeline (routing, schema, identity)
ADR-0068  .github/workflows/breaking-bump-*.yml      Breaking-bump dispatcher + pipeline + tests workflows; implementer forks `chore/claude-<dep>-v<to>`
ADR-0068  .github/breaking-bump/prompts/**           Per-agent prompts (A/B/C/D + ai-gate); versioned, not inline in YAML
ADR-0068  infra/tools-upgrade-sources.yaml           Source registry now governed by 0068 (reactive override; keep verified entries)
# ADR-0068: amendment 2026-06-13 (B'/amend-loop + monotonicity guard); no new binding paths — existing entries above cover all W2 implementation paths
# ADR-0068: amendment 2026-06-13 (prompt-injection threat model + structural hardening); no new binding paths — guards land under scripts/breaking-bump/**, prompts/**, workflows above
# ADR-0068: amendment 2026-06-13 (deterministic agent-d finalize + PR-exists gate); no new binding paths — finalize step lands in the breaking-bump workflow + agent-d prompt above
# ADR-0068: amendment 2026-06-13 (plan = AI execution contract; scope.files manifest + workflow-sensitivity split); no new binding paths — plan/gate/prompt changes land under scripts/breaking-bump/** + prompts/** above
# ADR-0068: amendment 2026-06-14 (broaden allowlist by dep-type; renovate.json stamps dep-type:<type> labels, allowlist.yaml gains types:); no new binding paths — changes land under scripts/breaking-bump/** + the dispatch workflow above (renovate.json governed repo-wide)
# ADR-0068: amendment 2026-06-14 (auto-merge of ai-gate-cleared minor/patch bumps; breaking-bump-automerge.yml + automerge.py, excludes .github/workflows/-touching bumps); no new binding paths — changes land under scripts/breaking-bump/** + breaking-bump-*.yml above
ADR-0069  scripts/issues/**                          Issue-driven dev: IssueTracker port/CLI; status = adapter-native board column (GitHub Projects v2 built-in `Status` field); `needs_input` human-decision gate (addendum 2026-06-14); priority = labels
ADR-0069  .claude/skills/issue-dev/**                Issue-driven workflow commands (/launch /capture /spec /refine /backlog) call the CLI
ADR-0069  .github/workflows/issues-tests.yml         IssueTracker port unit tests (pytest) gate
ADR-0069  .github/workflows/issue-dev-chatops.yml    Comment-driven ChatOps agents (/respec /correct /answer /replan /correct-plan); each step is a thin "read the prompt file and follow it" pointer
ADR-0069  .github/issue-dev/prompts/**               Versioned ChatOps agent prompts: shared `_contract.md` (draft-file → check --file → post-once via --body-file; binding directive; hard rules) + per-agent deltas
# ADR-0069: amendment 2026-06-14 (two-gate lifecycle: + plan_review + planned states; spec gate AND plan gate) — no new binding paths; changes land under scripts/issues/** above
# ADR-0069: amendment 2026-06-18 (steering authority: chatops agents apply maintainer CONTEXT/CORRECTION/ANSWER as a binding directive — fully, even against their own prior — with injection-safety rescoped to ignoring embedded meta-commands; corrections may ripple; + self-verification before finalize) — changes land in issue-dev-chatops.yml above
# ADR-0069: amendment 2026-06-18 (deterministic posting + prompt factoring: agents compose a DRAFT FILE, validate via `check --file`/`check-plan --file`, and post EXACTLY ONCE via `update-body`/`comment --body-file` — no agent improvisation, no scratch/duplicate comments; prompts extracted to versioned files with a shared _contract.md) — changes land in cli.py (--body-file, --file), .github/issue-dev/prompts/**, and the pointer steps above
ADR-0070  infra/platform/templates/cnpg-volume-gc-cronjob.yaml  Token-free GC of orphaned hcloud volumes: flip long-Released Retain PVs to Delete so the CSI reclaims them
ADR-0071  frontend/pnpm-workspace.yaml               24h install cooldown (minimumReleaseAge) + day-1 CVE escape hatch (minimumReleaseAgeExclude)
ADR-0071  renovate.json                              Renovate cooldown aligned to pnpm (minimumReleaseAge 1d + strict); vulnerabilityAlerts overrides it to 0 for security PRs
ADR-0072  frontend/src/design-system/**              WordSparrow design system v2 (jade/sakura/khaki); standalone module, app-isolated via eslint-boundaries; atoms → composites
ADR-0072  frontend/panda.config.ts                   v2 token set (`ws.*`) added namespaced, coexisting with ADR-0043's current tokens (no edits to existing tokens)
ADR-0072  frontend/src/ui/routes/design-system.tsx   Dev-only gallery route rendering every v2 component + variant (no Storybook); also the design-sync synth-entry surface
ADR-0072  frontend/src/main.tsx                       §3 render-gate: defers ReactDOM.render until v2 fonts load (or 1.2 s cap); governs font-display: block rationale
# ADR-0072: amendment 2026-06-27 (§3 font-loading strategy): font-display: block + render-gate in main.tsx amends ADR-0008 rejected verdict for block; binding paths above cover implementation
# ADR-0072: supersedes ADR-0043 for palette + typography (visual identity); ADR-0043's light-only theme + semantic-token-layering decisions still apply. Migration of the live app to v2 is a tracked follow-up (now ADR-0074).
ADR-0073  grid/api/openapi.yaml                      GET /v1/words/sample (minLen/maxLen/count) → SampleWord{clue,answer}; count + length-range capped server-side; random teaser pool, NOT the daily answer key
ADR-0073  grid/api/src/**/Module.kt                  Sample handler reads the resident CsvWordRepository (Module.kt:192); findByLength per L, dedupe by Word.lemma, plaintext answer (teaser validates client-side)
ADR-0073  frontend/src/application/grid/**            Home-teaser consumer of /v1/words/sample (W4)
ADR-0073  frontend/src/infrastructure/api/grid/types.ts  Generated SampleWord type (drift gate)
# ADR-0073: cross-references ADR-0058 — {clue, answer} over Hunspell-fr surface + LLM clue is clear under the matrix; widening to SA/NC-derived fields or beyond the dev teaser is gated on a per-source review (condition recorded in the ADR).
ADR-0074  frontend/src/ui/router.ts                  v1→v2 cutover: drop the /v2 prefix (v2 routes → root), delete v1 routes, redirect renamed v1 paths (preserve search params); multiplayer flag still gates lobby/join
ADR-0074  frontend/src/ui/routes/**                  Promote-to-root: ex-v2 routes lose their /v2 prefix and register at root; v1 route files deleted; renamed v1 paths (/grille→/play, /accueil→/, /privacy→/confidentialite) redirect
# ADR-0074: production cutover from the v1 forest design to the v2 jade/sakura design. v2 promoted to root (NOT kept under /v2), v1 removed. Contribuer fully gated now, un-gated for the maintainer in a follow-up (needs a whoami role).
ADR-0075  identity/api/openapi.yaml                  Cross-device solo progress sync: cookie-authed user-scoped /v1/users/me/progress (batch GET) + /v1/users/me/progress/{puzzleId} (GET/PUT); payload is an opaque SoloStore blob (no grid $ref); 409 optimistic-concurrency, 413 over 64 KiB cap; client-side semantic merge
ADR-0075  identity/infrastructure/**                 V6__puzzle_progress table (user_id FK→users ON DELETE CASCADE, puzzle_id, payload JSONB, updated_at, PK (user_id, puzzle_id)); opaque per-puzzle blob, server never parses it (Wave 2)
ADR-0075  frontend/src/infrastructure/session/**     Solo-progress sync layer over localStorageSolo: batch-pull + client-side semantic merge on authed load, debounced push, onAuthed anon carry-over (Wave 3)
# ADR-0075: amendment 2026-06-28 (concrete resource-bound values: 64 KiB payload cap → 413, 60 writes/60-second window rate limit → 429, 500-puzzle count cap → 403); no new binding paths — controls land in identity/api/** above
```

## Adding entries

When adding a new ADR or making an existing one operationally binding for a
new path, append to the registry above. The CI gate enforces that any change
to `docs/adr/NNNN-*.md` is paired with a touch of this file in the same PR.
That doesn't mean the touch has to add a line — sometimes an ADR is purely
contextual and doesn't govern a specific path — but if the gate trips on an
ADR that genuinely doesn't bind any path, add an "# ADR-NNNN: contextual, no
binding paths" comment line below the table so the diff is explicit.
