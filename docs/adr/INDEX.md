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
ADR-0039  grid/domain/src/main/kotlin/com/bliss/grid/domain/generation/**  Bitmask-CSP generator: black-cell layout invariants — functional blacks, no 3-run/clamp, and white-cell connectivity (canPlaceBlack Check 6: a placement must not split white into a disconnected pocket / closed block). Interlocking is half-checked: canPlaceBlack Check 1 rejects a neighbour only if it is orphaned on BOTH axes, allowing single-axis (sandwiched) cells; GridValidator.uncrossedCells flags only cells in no word (2026-07-01 amendment, generator-side follow-up)
ADR-0039  grid/domain/src/main/kotlin/com/bliss/grid/domain/validation/**  Interlocking is half-checked: GridValidator.uncrossedCells / GridViolation.UncrossedCell flag only cells in no word (2026-07-01 amendment)
ADR-0042  */worker/src/**/pre*generation/**        Daily puzzle pre-gen worker (k8s CronJob)
ADR-0044  identity/**                              Identity bounded context for player OIDC
ADR-0044  */api/src/**/persistence/*Database.kt    CNPG libpq URI → toJdbcUrl(); never pass raw uri to Hikari
ADR-0044  */api/src/**/SessionMiddleware.kt        Session cookie verification via identity-api
ADR-0045  identity/**                              Player-identity data minimization (RGPD) — SUPERSEDED by ADR-0082 for OAuth scope + email retention (rest of stance holds)
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
# ADR-0060: amendment 2026-06-29 (resolved guest|player|maintainer taxonomy) — guest is resolved at the edge (no session), NOT a stored role; player/maintainer stored unchanged (no migration, no UserRoleChanged wire change); whoami + /v1/users/me gain a `role` field (player|maintainer), whoami still 401s anonymous (consumers map no-session→guest); assignment surface unchanged (bootstrap-Job only). No new binding paths — changes land under identity/** above
# ADR-0060: amendment 2026-06-30 (identity is the authorization authority — owns capabilities) — identity consumes billing's SubscriptionChanged, maps (role+subscription)→capabilities; whoami + /v1/users/me gain a `capabilities` array + a capability-change event; consumers gate on capabilities+userId only (never billing). billing:subscribe is role-derived (maintainer, test phase); subscription-derived feature caps deferred with offer. No new binding paths — changes land under identity/** above
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
ADR-0064  .github/workflows/lighthouse.yml         Lighthouse perf baseline workflow; workflow_run on Deploy Frontend; audits the Cloudflare Pages preview URL or wordsparrow.io
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
ADR-0072  frontend/src/main.tsx                       §3 render-gate: defers ReactDOM.render until Nunito loads (or 800 ms cap); UI fonts use font-display: block, Fredoka wordmark uses swap
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
ADR-0076  grid/api/openapi.yaml                      Server-verified teaser answers: SampleWord gains answerLength + opaque token (HMAC-SHA256(serverKey, normalize(answer)), base64url); answer deprecated+optional (expand-and-contract). POST /v1/words/sample/verify {token, guess} → SampleVerifyResult{correct}, constant-time compare; no plaintext answer/reveal going forward
ADR-0076  grid/api/src/**/Module.kt                  Sample handler mints token + answerLength; verify handler recomputes HMAC over normalized guess and constant-time-compares to token; serverKey injected as a k8s Secret (Wave 2)
ADR-0076  frontend/src/infrastructure/api/grid/types.ts  Generated SampleWord (answerLength, token) + SampleVerifyResult types (drift gate)
# ADR-0076: supersedes-in-part ADR-0073 §3 (plaintext teaser answer) — leak surfaced post-v2-cutover (ADR-0074); deterministic-token dictionary-mapping risk accepted over per-session salting (throwaway public-corpus teaser); leak fully closes at the contract wave (answer removed)
# ADR-0076: amendment 2026-06-30 (puzzle hint carve-out + binary validate) — §7: hints endpoint is the one sanctioned exception to the answers-off-the-wire posture (budgeted, opt-in, separate from daily key); §8: whole-word reveal accepted shape (one credit per word, replaces per-letter); §9: ValidatePuzzleResult is a binary oracle (solved only, no positional data). No new binding paths — schema changes land in grid/api/openapi.yaml above.
ADR-0077  grid/api/src/**/Module.kt                  Credentialed CORS for the session-authed hint endpoint: allowCredentials true; revert headers from allowHeaders { true } to explicit allowHeader(Content-Type, X-Request-Id, traceparent, tracestate); host allowlist UNCHANGED (Wave 2). Triggers ADR-0034 Follow-up #2; mirrors ADR-0048 posture with an explicit list, not the wildcard predicate
ADR-0077  grid/api/src/test/**/CorsTest.kt           Assert credentialed config: origin echo + Access-Control-Allow-Credentials true + explicit header set (Wave 2)
ADR-0077  survey/api/src/test/**/architecture/CorsWildcardArchitectureTest.kt  Update to exempt grid's deliberate explicit-list posture from the "credentialed CORS must use wildcard predicate" rule (Wave 2)
ADR-0077  frontend/src/infrastructure/api/grid/client.ts  Send credentials: 'include' only on the authed hint POST; public puzzle GET/sample/validate stay uncredentialed so CDN-cacheable fetches keep their cache key (Wave 2)
ADR-0077  frontend/src/ui/play/PlayScreen.tsx        Render hint.errorMessage (currently computed, never displayed) so a 401 shows "Connecte-toi pour utiliser les indices" instead of a dead button (Wave 2)
# ADR-0077: threat model — SameSite=Lax (SessionCookies.kt:30) + mandatory JSON-preflight mitigate cross-site CSRF on /hints; no explicit CSRF token (low-value, budget-idempotent reveal). Wave-2 confirmations: grid-api prod host must be a wordsparrow.io subdomain for the cookie to be in-scope
ADR-0078  billing/**                                 New billing bounded context: subscription entitlement foundation; hexagonal, no cross-context imports; anti-corruption BillingProviderPort (Mollie initial adapter)
ADR-0078  billing/api/openapi.yaml                   Edges: POST /checkout-session (session-derived userId), POST /webhook (authenticate every callback — signature or re-fetch-by-id), GET /entitlement
ADR-0078  billing/api/asyncapi.yaml                  EntitlementChanged on wordsparrow.user.entitlement-changed; event-driven cache, server-side enforcement (mirrors ADR-0060)
ADR-0078  billing/**/usecases/HandleUserDeleted.kt   Deletion-cancellation invariant: pending_cancellation → durable JetStream consumer → idempotent cancel → never lose externalRef before confirmed cancel
ADR-0078  billing/worker/**                          Reconciliation CronJob: event-independent backstop (cancel provider-active subs with no live entitlement intent) + aging alert (ADR-0032)
ADR-0078  infra/platform/charts/billing/**           Billing chart: Deployment + CronJob + NetworkPolicy-guarded NATS subject + provider API-key/webhook-secret as k8s Secrets
# ADR-0078: no card data (PCI SAQ A) — hosted checkout only; provider is system-of-record for PII/invoices; our projection is opaque refs + entitlement, erasable on GDPR deletion (statutory retention lives at the provider). EURL-is-merchant ⇒ direct PSP, not Merchant-of-Record. Deferred: pricing/offer, Play/Apple adapters
# ADR-0078: amendment 2026-06-29 (rollout phasing) — ships dark in provider TEST mode (Mollie test_ key), subscription flow gated to a maintainer user-id allowlist (BILLING_ALLOWED_USER_IDS, mirrors ADR-0060); promotion to GA = swap to live key + lift allowlist, both reversible flag/secret flips, no code change. No new binding paths — gate + config land under billing/** above
# ADR-0078: amendment 2026-06-30 (capabilities move to identity) — billing knows only userId+subscriptions, NEVER capabilities: emits SubscriptionChanged(userId,tier,status) (renamed from EntitlementChanged) on wordsparrow.user.subscription-changed; GET /v1/entitlement → GET /v1/subscription; Capability/capabilitiesFor removed from billing/domain. Test-phase gate becomes the billing:subscribe capability (identity-granted, maintainer in test) checked at billing's endpoint edge — supersedes the user-id allowlist / role gate. Identity owns capabilities (see ADR-0060 2026-06-30). No new binding paths — changes land under billing/** above
ADR-0079  identity/**/user/Capability.kt            Capability-based feature authz: capabilitiesFor(role?) incl. guest (null→{}); matrix player→{hint}, maintainer→{hint,contribuer,billing:subscribe}; minimal role-differentiating set only (universal features stay open); subscription-TIER access is ADR-0078, out of scope
# ADR-0079: hint enforcement is grid POST /v1/puzzles/{id}/hints (grid/api/**/routes/PuzzleRoute.kt) — assert `hint`; carry capabilities on grid/application/**/auth/WhoAmI.kt (read from identity whoami, absent ⇒ deny). No new glob — lands under ADR-0018 grid/** + ADR-0044 SessionMiddleware paths
# ADR-0079: contribuer becomes maintainer-only (NEW policy) — survey enforces `contribuer` on SubmitRatingRoute/MeContributionsRoute/MePreferencesRoute; survey/**/identity/{IdentityClient,CachedSessionVerifier}.kt carry capabilities (mirror billing SessionPrincipal). No new glob — lands under ADR-0056 survey/** + ADR-0044 SessionMiddleware paths
# ADR-0079: frontend gates are cosmetic — useHintGate.ts + contribuer.lazy.tsx gate on useCapability(cap) (frontend/src/ui/components/billing/useCapability.ts); billing useBillingGate unchanged. No new glob — lands under ADR-0002 frontend/** + ADR-0050 a11y paths
ADR-0080  identity/**/user/Capability.kt            Subscription-derived entitlement: capabilitiesFor(role, tier) adds tier-gated caps for the `subscriber` tier (grilles:all, grilles:generate); identity persists tier from SubscriptionChanged INTERNALLY; whoami/me stay capabilities-ONLY (NO tier field — consumers gate on caps, never tiers). Manage-panel labels come from billing getSubscription(). Tier set = {free, subscriber}. Offer = Gratuit (jour + 7j + déjà-commencée) vs « Accès complet » (toutes grilles + génération); 2€/20€; lock = >7j AND not started
# ADR-0080: identity gains its FIRST inbound NATS consumer — SubscriptionChanged on wordsparrow.user.subscription-changed (identity/infrastructure/**/nats/SubscriptionChangedConsumer.kt, mirror survey UserRoleChangedConsumer); last-write-wins by userId/changedAt; needs a durable JetStream consumer provisioned (same class as billing user.deleted bootstrap gap). No new glob — lands under ADR-0044 identity/** + ADR-0049 NATS paths
# ADR-0080: grid enforces the gating rule server-side for archived-grid access + generation using the tier-derived capability via the session principal (read from identity whoami, absent ⇒ deny; mirror grid WhoAmI capability-source). Frontend gates are cosmetic. No new glob — lands under ADR-0018 grid/** + ADR-0079 capability-source paths
# ADR-0080: frontend builds the prod surfaces directly from the ADR's offer decision (no mockup gallery exists in this repo) — offer /abonnement, /abonnement/merci, réglages manage panel, paywall sheet + locked-grid markers + upsell — gated on useSubscriber()/useCapability('grilles:all'); framing binding = neutral/factual (no hype, no pressure, no donation speech, round prices, provider never named, tutoiement). W3 renames the existing createCheckoutSession('premium') + 'premium' test strings to the `subscriber` tier id. One-off month + gift surface DEFERRED (need Mollie one-time-payment flow). No new glob — lands under ADR-0002 frontend/** paths
ADR-0081  grid/application/src/main/kotlin/com/bliss/grid/application/puzzle/**  Daily-puzzle identity is unique-per-generation, not deterministic-from-date: DailyPuzzleSelector drops puzzleIdForDate; each generation gets a new random UUID v7 (Generators.timeBasedEpochGenerator(), per ADR-0003 §6); date resolves to the most-recently-created puzzles row for that puzzle_date; ListDailyPuzzles + EnsureUpcomingDailies idempotency switch from fixed-id get to date->current-row resolution (Wave 3b/3c). gridNumber/difficulty stay date-derived
ADR-0081  grid/api/src/main/kotlin/com/bliss/grid/api/routes/PuzzleRoute.kt  Daily GET (/v1/puzzles/daily ~line 111) resolves the date to its current row instead of computing the deterministic id; 404 unchanged when no row for the date (Wave 3b/3c)
ADR-0081  grid/*/src/main/resources/db/migration/**  Migration adds nullable puzzle_date column + index to puzzles; daily rows set it, on-demand path leaves it null; expand-and-contract, regeneration appends a new row (newest wins), no delete/update — preserves the immutable-puzzle design
# ADR-0081: regeneration-safe daily identity — fresh random UUID v7 per generation so a regenerated grid gets uncorrupted state (hint usage / progress / ADR-0075 sync blobs are keyed by puzzleId). No frontend change needed; superseded rows accumulate (GC deferred)
ADR-0082  identity/application/**/usecases/BeginOidcLoginUseCase.kt  Request `email` scope: Google `openid email`, Apple `email` (supersedes ADR-0045 openid-only). No name/profile/picture
ADR-0082  identity/domain/**/oidc/OidcIdToken.kt    Retain the `email` claim (was dropped by ADR-0045); Apple path also captures email from the first-sign-in `user` field
ADR-0082  identity/**/usecases/CompleteOidcLoginUseCase.kt  Persist the verified email (was emailAtLink=null); recommended model = canonical nullable users.email set/refreshed at sign-in + link
ADR-0082  identity/api/openapi.yaml                  /v1/users/me gains nullable `email` (the ONLY endpoint that exposes it); /v1/auth/whoami does NOT carry it (minimization — whoami fires on every authed request across contexts); emailOptIn opt-in machinery retired (email is by-necessity, not consent)
ADR-0082  billing/infrastructure/**/provider/MollieBillingAdapter.kt  Pass caller email (read from identity /v1/users/me at checkout) to Mollie createCustomer for invoices/receipts; billing STORES no email (narrows ADR-0078 no-PII to pass-through only)
# ADR-0082: RGPD basis = performance of contract / legal obligation (invoicing), purpose-limited to billing/receipts/recovery; erasure unchanged (email on users row, ON DELETE CASCADE + UserDeleted); still no name/picture/IP. Supersedes ADR-0045 OAuth-scope + email-retention parts. Transparency (confidentialité + CGV + DPA/records-of-processing) updates required — accountant/DPO angle
```

## Adding entries

When adding a new ADR or making an existing one operationally binding for a
new path, append to the registry above. The CI gate enforces that any change
to `docs/adr/NNNN-*.md` is paired with a touch of this file in the same PR.
That doesn't mean the touch has to add a line — sometimes an ADR is purely
contextual and doesn't govern a specific path — but if the gate trips on an
ADR that genuinely doesn't bind any path, add an "# ADR-NNNN: contextual, no
binding paths" comment line below the table so the diff is explicit.
