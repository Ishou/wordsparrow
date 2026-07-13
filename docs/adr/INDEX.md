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
# ADR-0007: §4 DNS-only / no-orange-cloud posture amended by ADR-0089 — narrowed to WS hosts (game); api+auth are Cloudflare-proxied
ADR-0009  infra/platform/charts/**                 Self-managed k3s on Hetzner; helm chart layout
ADR-0009  .github/workflows/deploy-api-k8s.yml     Deploy pattern: configure-in-cluster, not push-from-CI
ADR-0010  terraform/**                             OpenTofu remote state on Hetzner
ADR-0011  terraform/k8s/**                         k8s subtree provisioned by OpenTofu
ADR-0013  */worker/src/**                          Batch worker pattern (words/clues)
ADR-0018  game/**                                  Game bounded context: HTTP + WebSocket
ADR-0019  */api/asyncapi.yaml                      AsyncAPI 2.6, not 3.x
ADR-0025  frontend/src/**/analytics/**             Matomo + RGPD posture
ADR-0026  frontend/**/sw.*                         PWA offline cache via Workbox; injectManifest hand-authored SW owns precache + navigateFallback denylist + NetworkFirst (2026-07-11 amendment)
ADR-0026  frontend/src/ui/v2/UpdatePrompt.*        PWA update prompt (2026-06-29 amendment)
ADR-0027  infra/observability/**                   SigNoz on ClickHouse
ADR-0038  infra/observability/**                   k8s-infra subchart for per-pod/node metrics; OTLP exporter preset pins
ADR-0030  infra/observability/templates/oauth2-proxy.yaml   oauth2-proxy htpasswd-only; session cookie for SigNoz SPA; no OIDC
ADR-0030  infra/observability/values.yaml                   oauth2Proxy.image.tag pin (v7.15.3); Renovate keeps current
ADR-0033  frontend/src/**/otel/**                  Frontend OTel public ingest; emits traceparent/tracestate
ADR-0033  frontend/src/infrastructure/api/**       Browser SDK adds traceparent to every cross-origin fetch
ADR-0034  */api/src/**/Module.kt                   CORS: allowHeaders { true } (wildcard predicate)
ADR-0039  grid/domain/src/main/kotlin/com/bliss/grid/domain/generation/**  Bitmask-CSP generator: black-cell layout invariants — functional blacks, no 3-run/clamp, and white-cell connectivity (canPlaceBlack Check 6: a placement must not split white into a disconnected pocket / closed block). Interlocking is half-checked: canPlaceBlack Check 1 rejects a neighbour only if it is orphaned on BOTH axes, allowing single-axis (sandwiched) cells; GridValidator.uncrossedCells flags only cells in no word (2026-07-01 amendment, generator-side follow-up)
ADR-0039  grid/domain/src/main/kotlin/com/bliss/grid/domain/validation/**  Interlocking is half-checked: GridValidator.uncrossedCells / GridViolation.UncrossedCell flag only cells in no word (2026-07-01 amendment); dead-end words must be >= 5 letters: GridValidator.DEAD_END_MIN_LEN / GridViolation.ShortDeadEnd, enforced by canPlaceBlack Check 7 and a SlotRegistry.build rejection (2026-07-03 amendment)
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
ADR-0053  frontend/src/sw.ts                       SW navigateFallbackDenylist for post-Workbox flat prerendered routes (moved from vite.config.ts by ADR-0026 2026-07-11 injectManifest amendment)
ADR-0054  frontend/src/ui/**                       Page-shell primitive
ADR-0054  frontend/src/ui/v2/AppShell.tsx          Amendment 2026-07-09: one AppShell primitive (flow/overlay); document-scroll-lock invariant (html/body/#root height:100% overflow:hidden, one scroll container/screen, safe-area insets at shell edges)
ADR-0055  game/**/persistence/**                   Multiplayer game persistence
ADR-0055  game/application/src/main/kotlin/com/bliss/game/application/usecases/LobbyGarbageCollector.kt   GC matrix: WAITING 24h, COMPLETED 7d anon-only (2026-07-03 amendment: authed seat exempts), IN_PROGRESS 30d inactivity (2026-07-09 amendment: findIdleInProgress closes owned immortal-ghost gap under sticky ownership)
ADR-0055  game/application/src/main/kotlin/com/bliss/game/application/usecases/LobbyUseCases.kt   2026-07-08 amendment: destroy ownerless+empty lobbies immediately (Lobby.isDefunct) on relinquish/leave/erase, not at the 7d GC
ADR-0056  survey/**                                Survey bounded context (RLHF clue rating; pairwise comparison task pulled from v2 deferral)
ADR-0057  modal_jobs/**                            Cloud-GPU finetune lane (Modal); "second lane / training-only" framing amended by ADR-0087 (sole lane, generation included)
ADR-0058  data/external/**                         Licensed-data posture (commercial intent); per-source verdict matrix
ADR-0058  data/dbnary/**                           DBnary SA-acceptance + distribution discipline
ADR-0058  scripts/clue_generation/**               Training/filter paths must classify per ADR-0058 matrix
ADR-0058  scripts/eval/**                          Same — eval paths that feed training must classify
ADR-0058  modal_jobs/**                            Training/inference on Modal must classify per ADR-0058 (incl. the Command-R base model)
# ADR-0058: amendment 2026-07-05 (license-audit correction) — Grammalecte/Dicollecte lexicon data reclassified GPL 3.0 → MPL-2.0, redistribute forbidden → permitted (with NOTICE.md attribution); Lexique3 label corrected CC BY-NC-SA 4.0 → CC BY-SA 4.0 (no NC clause upstream), `forbidden` verdict retained pending maintainer confirmation since the NC-clause rationale no longer holds. No new binding paths — corrections land in the matrix above.
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
ADR-0063  scripts/clue_generation/pipeline_v2/judge.py  Learned CamemBERT probe judge — DEMOTED to shadow only (AUROC 0.73, never gates); score + log
ADR-0063  scripts/clue_generation/pipeline_v2/llm_judge.py  Committed Opus-as-judge ship gate: GOOD/BORDERLINE/BAD verdict; GOOD-only ships, BORDERLINE→curated-review, BAD→drop; batch not inline
ADR-0063  scripts/clue_generation/pipeline_v2/calibration_fixture.csv  8 cited maintainer rulings + round11 sample with expected verdicts; live-calibration proof of the rubric
ADR-0063  scripts/clue_generation/pipeline_v2/run_pipeline.py  apply_ship_gate + --ship-gate flag wire the Opus judge after deterministic filter_1..10
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
# ADR-0066: status flipped to Accepted — schema-first step 1 (GET /v1/users/me/lobbies) shipped in game/api/openapi.yaml. No new binding paths; existing entries above already cover it.
ADR-0066  game/application/**/usecases/LobbyUseCases.kt   Amendment 2026-07-05 (b): JoinLobbyUseCase gains owner/member rejoin arms keyed on server-verified userId (owner-rebind of ownerSessionId) before the code check
ADR-0066  game/api/src/main/kotlin/com/bliss/game/api/routes/LobbyWebSocketRoute.kt   Amendment 2026-07-05 (b): dispatchJoin threads the socket's connect-time server-verified userId into joinLobby (never from the client frame)
ADR-0066  game/infrastructure/**/db/migration/V3__lobbies_owner_user_id.sql   Amendment 2026-07-05 owner-visibility parity: nullable owner_user_id on lobbies (set once at create, never overwritten); findByUserId gains owner arm mirroring findBySessionId; expand-and-contract (supersedes §3 "No data migration")
ADR-0066  game/application/**/usecases/LobbyUseCases.kt   Amendment 2026-07-09 (c): JoinLobbyUseCase's fresh-join arm stamps the server-verified userId onto the seat so a seated authed co-player sees (and can claim) an explicitly-relinquished game from /grilles; anon joins still pass null
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
# ADR-0080: amendment 2026-07-06 (billing GA) — the test-phase `billing:subscribe` gate on offer *visibility* is lifted; the subscribe offer (promo surfaces + `/abonnement`) renders to every non-subscriber, guests included, via useCanSubscribe/AbonnementScreen. Checkout enforcement is unchanged: `requireCapability(billing:subscribe)` still guards billing routes server-side (ADR-0078). No new glob — lands under ADR-0002 frontend/** paths
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
ADR-0083  identity/domain/**/user/Capability.kt         Mint `multiplayer:host-unlimited` for the subscriber tier only (dedicated cap, not `grilles:all`); consumers see capabilities, never tiers (ADR-0079)
ADR-0083  game/application/**/auth/CookieVerifier.kt     WhoAmI carries `capabilities` parsed from identity whoami — game becomes a capability consumer (mirrors grid/survey/billing); absent ⇒ empty ⇒ deny-only
ADR-0083  game/application/**/usecases/LobbyUseCases.kt  Host quota: authed player = 1 WAITING lobby (findWaitingByOwnerUser, reopen existing); `multiplayer:host-unlimited` ⇒ unlimited
ADR-0083  game/api/**/routes/LobbiesRoute.kt             Guest = 0: anon `POST /v1/lobbies` returns 401 (hosting requires sign-in); joining stays open to everyone
# ADR-0083: Multiplayer hosting entitlement — extends ADR-0080 into game; guest 0 / player 1 open lobby / subscriber unlimited; join open to all; server-side enforced in game (unlike cosmetic solo grid gating). guest=0/player=1 ship now, subscriber=∞ dormant until billing GA
ADR-0084  grid/api/openapi.yaml                          New internal `POST /v1/puzzles/{id}/validate-word` → `{correct}`; client-facing `/validate` stays binary (ADR-0076 §9 unchanged)
ADR-0084  grid/api/**/routes/PuzzleRoute.kt              validate-word route: single-word `{correct}`; service-token gate + internal-only exposure (not on the public ingress)
ADR-0084  grid/application/**/puzzle/ValidatePuzzleUseCase.kt  Word-scoped validation reuse: `correct` iff every submitted cell matches solution; no positional data leaked
ADR-0084  game/infrastructure/**/HttpWordValidator.kt    Call validate-word per candidate word with `X-Service-Token`; response DTO is `{correct}`; wire-shape contract test REQUIRED (the gap that let #1170 break co-op silently)
ADR-0084  game/application/**/usecases/LobbyUseCases.kt  Validator failure must be observable (logged/metered), not a silent swallow — a total lock outage must never again be invisible
ADR-0084  frontend/src/ui/v2/multiplayer/useCoopValidating.ts  Co-op pulse timeout → reject → `rejectingPositions` → shake (timeout-driven; the shake trigger is SUPERSEDED by ADR-0085's server-driven `wordRejected`)
# ADR-0084: Internal service-authenticated word validation for multiplayer locking — restores co-op word-locking broken by ADR-0076's binary `/validate` (#1170 dropped `incorrectCells`, game-api still required it → swallowed parse failure → nothing locked). Dedicated internal `validate-word` (token + not-publicly-routed); solo never regains per-cell feedback. HTTP not NATS (ADR-0049). Extends ADR-0076. §2's "solo never regains per-cell feedback" amended by ADR-0099 (client-facing `/verify`, cooldown-bounded).
ADR-0085  game/api/asyncapi.yaml                         New server→client `wordRejected` event (mirror of `wordLocked`); reverses `WordLocked`'s "no wrong-word event" description for the co-op path only (ADR-0076 §9 untouched)
ADR-0085  game/application/**/usecases/LobbyUseCases.kt  Emit `LobbyEvent.WordRejected(positions, rejectedAt)` when a fully-filled candidate word validates incorrect (mirror of the WordLocked emit)
ADR-0085  frontend/src/ui/v2/multiplayer/useCoopValidating.ts  Shake is server-driven: `wordRejected` → clear pulse + shake immediately; the MAX_MS timeout is demoted to a silent safety-clear (no shake)
# ADR-0085: Synchronous wrong-word feedback via `wordRejected` — the co-op shake becomes server-authoritative (mirror of `wordLocked`) instead of a client-side pulse-timeout guess. Leaks nothing (positions the player already typed; wrong-completion already inferable). Broadcast, symmetric with wordLocked. Extends ADR-0084; reverses the `WordLocked` "no wrong-word event" description for co-op only (ADR-0076 §9 untouched).
ADR-0086  game/api/asyncapi.yaml                         `wordLocked` gains `lockedBy: SessionId`; `lockedPositions` items become `LockedCell {row,column,lockedBy}` (per-cell owner) for late-joiner coloring
ADR-0086  game/api/openapi.yaml                          `GET /v1/lobbies/{id}` GameSession.lockedPositions items become `LockedCell {row,column,lockedBy}` (mirror asyncapi)
ADR-0086  game/application/**/usecases/LobbyUseCases.kt  `WordLocked` carries `lockedBy` = the completing player; `GameSession` tracks lock owner per position; crossing lock emits only new cells (first-writer-wins on the shared cell)
ADR-0086  frontend/src/ui/components/grid/PuzzleBoard.tsx  Owned solved cell tints `color-mix(var(--player-color) 32%, solved-fill)` from `playerColor(lockedBy)`; solo/no-owner untinted (WCAG AA)
# ADR-0086: Attribute locked co-op words to the player who found them — `wordLocked.lockedBy` + `LockedCell` snapshot; frontend soft-tints solved cells with the finder's `playerColor`. First-writer-wins on crossing cells (server emits diff-not-union + additive snapshot, so a shared cell keeps its first owner). Extends ADR-0084.
ADR-0087  modal_jobs/**                            Modal Command-R is the SOLE clue-generation + training lane (amends ADR-0057)
ADR-0087  scripts/clue_generation/**               MLX lane (run_production.sh, train_lora.sh, train_dpo.sh, generate_clues_lora*, lora_iter*.yaml) RETIRED 2026-06-23 — never invoke for new work
ADR-0087  scripts/eval/**                          validate_clue/inflation/runtime guards stay live (lane-independent); CamemBERT filter retired as a shipping gate
ADR-0088  frontend/panda.config.ts                       Dark mode « jardin de nuit »: ws.* promoted to semanticTokens with {base,_dark}; dark condition = [data-theme=dark]
ADR-0088  frontend/src/ui/v2/**                          Night-ramp values for the v2 chrome; SVG art + hero gradients consume CSS vars so they theme
ADR-0088  frontend/index.html                            Pre-paint data-theme applied from localStorage bliss.theme ('clair'|'sombre'); default light, no prefers-color-scheme (2026-07-12 addendum drops 'auto')
ADR-0088  frontend/src/infrastructure/session/localStorageTheme.ts  Theme port adapter: load/save/apply bliss.theme; legacy 'auto' resolves to light
ADR-0088  frontend/src/ui/v2/ReglagesScreen.tsx          Theme control lives in Réglages; two-option toggle (Clair|Sombre), default clair
# ADR-0088: Dark mode « jardin de nuit » — ws.* and semantic tokens promoted to {base,_dark} pairs, condition = [data-theme=dark]; theme setting 'clair'|'sombre' persisted in localStorage, applied pre-paint; default clair (2026-07-12 addendum removed the 'auto'/system-default lane).
ADR-0089  */api/deploy/chart/values-prod.yaml        Orange-cloud api+auth via external-dns.alpha.kubernetes.io/cloudflare-proxied: "true"; game stays gray (WS); rollback = remove the annotation
ADR-0089  terraform/cloudflare-cache-rules.tf        cloudflare_ruleset (http_request_cache_settings): host api.wordsparrow.io + /v1/puzzles/daily, respect origin TTL, bypass on __Secure-ws_session cookie
ADR-0089  grid/worker/**                             Purge-on-regen: exact-URL CF purge (no-date /v1/puzzles/daily [+?date=]) after every generation run; each URL purged as default + one Origin variant per prod origin (Vary: Origin from credentialed CORS); 30-file/call chunking; failure logs, never fails the Job; Zone.Cache Purge-scoped token Secret
ADR-0089  */api/src/main/kotlin/**/Module.kt         Timing-Allow-Origin: https://wordsparrow.io https://www.wordsparrow.io in DefaultHeaders (all five services)
ADR-0089  frontend/src/sw.ts                         SW is a 4th cache layer: date-scope the date-less daily's cache key to the UTC day + drop no-store bodies, so a rollover isn't replayed until hard refresh (2026-07-11 amendment)
# ADR-0089: amends ADR-0007 §4 (DNS-only posture narrowed to WS hosts); daily cache policy = anon-only public,max-age=0,must-revalidate + s-maxage-to-UTC-midnight + ETag="<puzzleId>" (304), cookie ⇒ private,no-store; daily/list stays public,no-cache — never edge-cached (unbounded query variants vs exact-URL purge); regen propagates via ADR-0081 fresh-UUID ETag flip + edge purge
ADR-0090  frontend/wrangler.jsonc                    Assets-only Worker owns name, SPA not_found_handling, preview_urls, custom-domain routes (routes added only at cutover); TF never owns the Worker
ADR-0090  .github/workflows/deploy-frontend.yml      Publish via cloudflare/wrangler-action: `deploy` on main-push, `versions upload` + PR comment on PRs; build steps byte-for-byte; CI is the only path to production
ADR-0090  terraform/cloudflare-pages*.tf             TF keeps zone-level resources + the Pages project (grace-period 301 to wordsparrow.io) until T+1-month decommission; cutover removes only the cloudflare_pages_domain attachments
# ADR-0090: amends ADR-0004 (hosting: Cloudflare Pages → Workers static assets); deploy/promotion/rollback shape of ADR-0004 stands, only the hosting product changes
ADR-0091  identity/domain/**/auth/**                 Email-OTP domain: OtpCode, ChallengeSecret, EmailOtpChallenge; TTL + 5-attempt-cap + single-use invariants
ADR-0091  identity/application/**/usecases/RequestEmailOtpUseCase.kt  Start: enumeration-safe 202, per-email 60s cooldown + daily cap, hashed code + hashed binding secret
ADR-0091  identity/application/**/usecases/VerifyEmailOtpUseCase.kt   Verify: challenge-cookie binding check, Option-B verified-email account resolution, session mint
ADR-0091  identity/api/**/auth/ChallengeCookies.kt    __Secure-ws_otp_chal HttpOnly short-TTL binding cookie (PKCE-style)
ADR-0091  identity/api/**/routes/EmailOtpRoute.kt     POST /v1/auth/email/start + /v1/auth/email/verify
ADR-0091  identity/api/**/routes/LogoutAllRoute.kt    POST /v1/auth/logout-all — revoke all sessions except the caller (provider-agnostic)
ADR-0091  identity/infrastructure/**/db/migration/V9__*.sql  Expand identity_user_providers CHECK to include 'email' (expand-and-contract)
# ADR-0091: passwordless email-OTP login; email = first-class provider; verified-email collision = same account (Option B), never merge on ambiguity; per-IP limiting delegated to ingress-nginx (no IP stored); full cross-provider merge deferred
ADR-0092  identity/infrastructure/**/email/BrevoEmailSender.kt   Brevo transactional adapter (Ktor HttpClient → POST /v3/smtp/email; no vendor SDK)
ADR-0092  identity/api/**/config/IdentityApiConfig.kt            Reads BREVO_API_KEY (nullable; required fail-fast only when IDENTITY_EMAIL_OTP_ENABLED)
# ADR-0092: paid service (maintainer-approved 2026-07-03, Starter plan); EU data residency; SPF/DKIM/DMARC domain-auth is the deliverability lever; swappable behind the EmailSender port
ADR-0093  identity/application/**/usecases/RequestEmailOtpUseCase.kt  Nested daily send budget: daily total (150) + new-account sub-cap (50) → 100/day registered floor; classifies via UserRepository.findByEmail; gates before per-email throttles
ADR-0093  identity/application/**/ports/EmailOtpChallengeRepository.kt  countNewAccountCreatedSince(since) over account_existed = false (daily total reuses countAllCreatedSince)
ADR-0093  identity/domain/**/auth/EmailOtpChallenge.kt  accountExisted: Boolean recorded at creation (point-in-time classification)
ADR-0093  identity/infrastructure/**/db/migration/V11__*.sql  Nullable account_existed column (expand-and-contract)
ADR-0093  identity/api/**/Wiring.kt  IDENTITY_OTP_DAILY_CAP (150) + IDENTITY_OTP_NEW_ACCOUNT_DAILY_CAP (50) env overrides
# ADR-0093: amends ADR-0091 enumeration-safety — accepts a bounded 202-vs-503 account-existence oracle in the degraded (new-bucket-exhausted) state; mitigates the #1357 shared-budget DoS by reserving a registered floor; OIDC unaffected, ADR-0032-alerted, env-tunable
ADR-0094  billing/**                                     Consumer-law posture: billing MAY store consent records + send its OWN transactional email (dedicated Brevo adapter, NO send-budget cap); receipt-not-facture; Chatel(annual)/price/CGV-change notices
ADR-0094  frontend/src/infrastructure/analytics/matomoTracker.ts  Cookieless CNIL-exempt audience measurement ⇒ NO cookie consent banner; adding a non-exempt/ad tracker re-opens this
ADR-0094  frontend/src/ui/v2/ConditionsAbonnementScreen.tsx  CGV page = the linked contract text (Art. 1/7 acceptance); checkout consent must link here
# ADR-0094: consumer-law conformity umbrella — extends ADR-0078/0082 billing PII posture (consent + billing-sent uncapped email); Chatel=annual only; no cookie banner; B2C receipt-not-facture (<25€ TTC tripwire), on-request factures + e-reporting via Qonto (registered Plateforme Agréée, not Mollie)
ADR-0095  grid/domain/src/main/kotlin/com/bliss/grid/domain/generation/LayoutAnchorer.kt  Low-density daily generation: anchored long runs (carve K targeted long horizontal runs, perturbation stays on so board stays fillable). Rejected LayoutDistiller (disables perturbation → unfillable). Daily config anchorCount=3 + best-of-N; depends on sigle short-word overlay
ADR-0095  grid/domain/src/main/kotlin/com/bliss/grid/domain/generation/GridConstraints.kt  Per-axis run caps lTargetHorizontal/lTargetVertical + anchorCount/anchorLength (default off; daily = 11/8, anchor 3). Do NOT re-add distillBudget (falsified: distiller disables perturbation)
ADR-0095  grid/application/src/main/kotlin/com/bliss/grid/application/puzzle/PuzzleConstraints.kt  Daily size split: dailyPuzzleConstraints() = 22×15 (re-scaled knobs anchor 3/len 10, lH 9/lV 6), distinct from defaultPuzzleConstraints() 28×20 API default
# ADR-0095: low-density daily generation — LayoutAnchorer carves K targeted long horizontal runs into fresh seeds so perturbation stays on and boards stay fillable; rejected LayoutDistiller (disables perturbation, Konsist-unsafe currentTimeMillis)
ADR-0096  grid/domain/src/main/kotlin/com/bliss/grid/domain/model/Word.kt  Word.separators: A-Z letter run + hyphen offset metadata (1..len-1, strictly increasing); compound display only, not cells/validation
ADR-0096  grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt  Ingest folds interior hyphens into separator offsets (was: drop non-A-Z); other non-A-Z chars still drop
ADR-0096  grid/api/openapi.yaml  DefinitionCell.separators (offsets, default []); Clue unchanged
ADR-0096  frontend/src/ui/components/grid/PuzzleBoard.tsx  Hyphen overlay drawn in the inter-cell GAP along the arrow axis
ADR-0097  grid/infrastructure/src/main/kotlin/com/bliss/grid/infrastructure/persistence/CsvWordRepository.kt  Corpus read path is Hetzner Object Storage via fromStream(), not the classpath CSV (supersedes ADR-0013 §8); startup fetch + cached-file fallback
ADR-0097  grid/infrastructure/src/main/resources/words/words-fr.csv  Corpus + themed overlays leave the public repo/image; source of truth is the private wordsparrow-clue-data repo, runtime copy is a private Hetzner bucket
ADR-0097  terraform/**  Private Hetzner Object Storage bucket + scoped read-only/write keys (OpenTofu); key inventoried in docs/secrets.md
ADR-0097  data/curated/**  Clue training/eval data moves to the private wordsparrow-clue-data repo; not a public artefact
ADR-0097  grid/api/deploy/chart/templates/**  fetch-corpus initContainer pulls the bucket via MC_HOST_store (no writable $HOME needed); emptyDir cache only, PVC resilience deferred (§4)
ADR-0097  grid/api/deploy/chart/values*.yaml  corpus.objectStore.* config surface; fetchCorpusImage pinned to digest via the chart's guard pattern
ADR-0098  game/application/src/main/kotlin/com/bliss/game/application/usecases/LobbyUseCases.kt  Quota = 1 active game (WAITING|IN_PROGRESS) by owner_user_id (findActiveByOwnerUser, supersedes findWaitingByOwnerUser); explicit relinquish nulls owner_user_id → ownerless; ClaimLobbyOwnershipUseCase quota-gated; LeaveLobbyUseCase must NOT touch owner_user_id (disconnect keeps ownership)
ADR-0098  game/application/src/main/kotlin/com/bliss/game/application/usecases/LobbyGarbageCollector.kt  GC gains ownerless (owner_user_id IS NULL) non-terminal idle>7d sweep via findIdleOwnerless (amends ADR-0055 matrix)
ADR-0098  game/domain/src/main/kotlin/com/bliss/game/domain/Lobby.kt  Ownership-lease transitions: isOwnerless()/relinquishOwner()/claimOwner(); owner_user_id null = ownerless
ADR-0098  game/api/src/main/kotlin/com/bliss/game/api/routes/LobbiesRoute.kt  Create counts active OWNED games; POST /v1/lobbies/{id}/ownership claim route (quota-gated, present-only)
ADR-0098  game/api/src/main/kotlin/com/bliss/game/api/routes/LobbyWebSocketRoute.kt  Explicit leaveLobby frame relinquishes ownership; disconnect grace path drops presence only, keeps owner_user_id
ADR-0098  game/infrastructure/src/main/kotlin/com/bliss/game/infrastructure/persistence/PostgresLobbyRepository.kt  findActiveByOwnerUser + findIdleOwnerless; eraseSession rule 2 vacates (owner_user_id NULL + owner_session_id sentinel) instead of transferring
ADR-0098  game/api/openapi.yaml  POST /v1/lobbies/{lobbyId}/ownership (claim): 200 lobby / 401 / 403 not-present-or-owned / 409 quota
ADR-0098  game/api/openapi.yaml  ownerless boolean on Lobby + LobbySummary (wire ownerless-ness, not inferred from ownershipChanged events); DELETE /v1/lobbies/{lobbyId}/ownership (relinquish): 200 ownerless-lobby / 401 / 403 not-owner / 404
ADR-0098  game/api/openapi.yaml  DELETE /v1/lobbies/{lobbyId}/membership (leaveLobby): drop caller's seat, relinquish-if-owner, destroy-if-ownerless-and-empty ⇒ delete-if-alone / leave-if-others from a list; 204 / 401 / 403 not-a-member / 404 (amendment 2026-07-08)
ADR-0098  frontend/src/ui/home/HomeScreen.tsx  handleCreateCoop → useCreateOrResume: IN_PROGRESS create-response ⇒ owned-game modal (rejoin / always-offered new / subtle subscribe hint), else navigate
ADR-0098  frontend/src/ui/routes/lobby.$lobbyId.tsx  handleClaim: guest (anon) tapping Reprendre → host sign-in flow first (ownership needs an account, ADR-0083); playing host-less game stays guest-open; start-new no longer occupant-gated — always offered (relinquish→host-less/claimable, not stranded) (2026-07-08 amendment)
# ADR-0098: Multiplayer lobby ownership as a claimable lease — 1 active game by owner_user_id (sticky across disconnect); explicit relinquish→ownerless→claim; RGPD rule 2 vacates not transfers; 7d ownerless GC; amends ADR-0055 & ADR-0083
ADR-0099  grid/api/openapi.yaml  New POST /v1/puzzles/{puzzleId}/verify: per-cell `correct` booleans for filled cells only (never the canonical letter), 429 on cooldown with no `cells` array
ADR-0099  grid/api/src/main/kotlin/com/bliss/grid/api/routes/PuzzleRoute.kt  /verify route, auth-gated like /hints; 429 within the 30-min cooldown, no positional data leaked on cooldown response
ADR-0099  grid/application/src/main/kotlin/com/bliss/grid/application/puzzle/**  VerifyCooldownCalculator: 30-min (1800s) per-(user_id, puzzle_id) server-authoritative cooldown, the named rate-limit mitigation against answer-key brute force; VerifyGridUseCase resolves canonical letters server-side, never returns them — only per-cell correctness
# ADR-0099: relates to / amends ADR-0076 AND ADR-0084 §2 — /verify is a second, narrower carve-out from the answers-off-the-wire posture alongside the §7 hint exception, and it reopens for solo the client-facing per-cell surface ADR-0084 §2 forbade (safe now because bounded by a 30-min per-puzzle cooldown, ~13h per uniform-letter alphabet sweep, a rate limit §2's uncapped internal validate-word never had). ADR-0076 §9's binary /validate, §§7-8's hint mechanic, and ADR-0084's internal validate-word are all unchanged; strictly less generous than the whole-word hint it replaces on solo.
ADR-0100  scripts/clue_generation/**               Unified corpus row schema (adds pos); normalize-then-merge assembler replaces the six in-place mutators; reconcile_lemmas is POS-aware derive/validate
ADR-0100  scripts/eval/**                          POS-aware runtime lemma guard: (surface,pos)->lemma must be deterministic, zero violations
ADR-0100  grid/infrastructure/**/CsvWordRepository.kt  Loader accepts the new optional pos column (same tolerance pattern as lemma); runtime doesn't use pos yet
ADR-0100  **/words/words-fr.csv                    Runtime corpus gains a pos column; lemma is never defaulted to the surface again
# ADR-0100: unified (surface,pos)->lemma authoring contract fixes the lia/lie/es/vue lemma-collision bugs that let WordAcceptor's same-lemma dedup miss inflections; extends ADR-0097 (private corpus) and ADR-0058 (per-source licensing unchanged)
ADR-0101  */api/deploy/db-chart/**                 CNPG HA/DR hardening tracker: set resource requests/limits (R2), billing instances:3 (R4); backups recurrence handled by ADR-0010 ScheduledBackups
ADR-0101  grid/api/deploy/chart/templates/postgres-cluster.yaml  Same R1-R5 remediation applies to grid's Cluster spec — grid uses a standalone chart, not the db-chart subchart layout, so the db-chart glob above doesn't route here
ADR-0101  */api/deploy/chart/templates/pdb.yaml   R5 PodDisruptionBudgets (minAvailable 1, gated on replicaCount>1); game exempt — single-replica by design (ADR-0018 §3)
ADR-0101  terraform/**                             Add worker node capacity (R1, worker_count 1→3) before tainting control-plane (R3); node count is the keystone for real CNPG failure-domain spread
# ADR-0101: cluster HA/DR audit + remediation tracker — 3-instance clusters that don't span nodes, empty resource specs (BestEffort), schedulable control-plane, single-instance billing; remediation ordered on node capacity (R1). Complements ADR-0009/0010/0011 (deploy/provisioning) and the 2026-07-11 backup fix.
ADR-0102  frontend/src/application/game/playerScores.ts   Co-op score = count of lockedPositions per lockedBy (ADR-0086 attribution); frontend-only derivation
ADR-0102  frontend/src/ui/v2/multiplayer/PlayerStrip.tsx   Live roster chip carries the player's validated-letter count (join-order, no re-sort)
ADR-0102  frontend/src/ui/v2/multiplayer/ResultatsScreen.tsx  Résultats ranks players by validated-letter score descending
# ADR-0102: co-op validated-letter score — per-player validated-letter count on roster chips (live) and a score-ranked Résultats leaderboard; frontend-only derivation from lockedPositions[].lockedBy (ADR-0086).
ADR-0103  survey/**/*Signalement*                   Player clue-report: optional-auth capture, maintainer queue
ADR-0103  survey/api/openapi.yaml                   POST /v1/signalements + ReportReason enum
ADR-0103  frontend/src/**/signalement*              Report sheet + /signalements triage (contribuer-gated)
ADR-0103  survey/**/db/migration/*player_reports*   player_reports table + dedup index; wordText optional, dedup keyed on (reporter, clue, puzzle) since V13
ADR-0104  .github/workflows/tofu-k8s.yml            Gated CI apply for terraform/k8s: workflow_dispatch plan/apply, apply behind prod-infra environment approval; secrets env-injected, non-secret vars from repo Variables
ADR-0104  terraform/k8s/**                          Provisioned either manually (ADR-0011) or via the gated tofu-k8s workflow; state/HCLOUD_TOKEN never leave Actions on the CI path
ADR-0105  frontend/src/domain/puzzle/gridFingerprint.ts  Pure deterministic hash of grid structure (cell kinds + positions + definition clues + dimensions), excludes typed letters; detects a regenerated grid under the same puzzleId
ADR-0105  frontend/src/application/progress/**       Solo-progress blobs carry a grid fingerprint (SoloStorePayload); pullAndMergeOne(fingerprint) discards local + remote progress typed on a now-regenerated grid and heals the server row. Amends ADR-0075
ADR-0105  frontend/src/infrastructure/session/localStorageSolo.ts  reconcileSoloFingerprint discards a stale/legacy (missing-fingerprint) blob on load and stamps the current grid; writes preserve the fingerprint
ADR-0106  terraform/k8s/providers/hetzner/server.tf              `fip_holder = count.index == 0` gates the DNAT + `bliss.io/fip-holder` label to worker[0]. (The "non-holders must alias NO FIP" rule is amended by ADR-0112: each non-holder now aliases its OWN assigned egress FIP — safe because the black hole only happened when the SHARED ingress FIP was aliased on a non-assigned node. DNAT/label stay holder-only.)
ADR-0106  terraform/k8s/providers/hetzner/cloud-init/worker.yaml.tftpl  `bliss.io/fip-holder=true` node-label set only when `fip_holder` is true
ADR-0106  terraform/k8s/providers/hetzner/floating-ip.tf          FIP assignment is worker[0] specifically, not "the worker node" — worker_count can be >1 (ADR-0101 R1)
ADR-0106  infra/platform/values-prod.yaml                        ingress-nginx.controller.nodeSelector must be `bliss.io/fip-holder: "true"`, not `bliss.io/role: worker` — pins the controller pod to the node that actually has the FIP aliased
ADR-0107  scripts/eval/inflect_clue.py             Inflater is the agreement engine (PyRealB rejected on the differential — see ADR revision). Relative-`qui` frame: `Qui + verbe` agrees the relative verb with the answer (number, 3rd person). Numerals are in the direct-object set so the pp-only-skip guard catches `Relier deux conduits`
ADR-0107  scripts/eval/test_inflect_clue.py         Head-selection regression tests: relative-`qui` agreement + ppas numeral-object skip. Verify any inflater change against a full-corpus differential (changes must stay in the intended class)
ADR-0108  grid/**/correction/**                     Clue-corrections: identity is old_clue_text (text-join, no FK); kinds replace/forbid_clue (blocklist_word deferred); forbidding a word's only clue is rejected
ADR-0108  grid/api/src/main/resources/db/migration/*clue_corrections*  clue_corrections table: audited rows (created_by) + backfill-progress columns; expand-and-contract, no puzzles FK
ADR-0108  grid/**/CorrectionAwareWordRepository*     Generation overlay: applies active corrections to each Word at gen time so future grids are clean without a corpus rebuild; export reconciles into data/curated/clue_overrides_fr.csv
ADR-0108  grid/worker/src/main/kotlin/com/bliss/grid/worker/Main.kt  --process-corrections backfill (durable/resumable, CronJob-driven) + --export-corrections; queue is "rows still matching old_clue_text"
ADR-0108  grid/api/**/routes/CorrectionRoute*        POST /v1/corrections (202) + GET /v1/corrections/{id}; gated by requireCapability("admin:signalements"); patches preserve puzzleId (progress kept)
ADR-0108  identity/domain/src/main/kotlin/com/bliss/identity/domain/user/Capability.kt  admin:signalements is maintainer-only; do not grant to PLAYER/tier (distinct from contribuer, ADR-0079)
ADR-0108  frontend/src/**/signalements/**           Maintainer "Corriger" action composes grid correction + survey action + progress poll; route gated on admin:signalements (was contribuer); tutoiement copy
ADR-0108  grid/api/openapi.yaml                     Amendment 2026-07-13: GET /v1/words/{word}/clues (admin:signalements, deny-by-default) → WordCluesResult, every clue the corpus carries for the word (Word.clues), cooldown-unfiltered; powers the Corriger alternate-definition picker
ADR-0108  grid/api/**/routes/CorrectionRoute*       listWordClues route: reads the word's Word.clues by folded surface, admin:signalements-gated; 404 word-not-found
ADR-0108  frontend/src/**/signalements/CorrectionForm* Corriger "replace" gains a "choose from other definitions" story: fetch the word's other clues, pick one as newClueText; graceful empty state when the word has no alternate clue
ADR-0109  infra/platform/templates/fip-egress-snat-daemonset.yaml  Self-healing DaemonSet asserting a POSTROUTING SNAT to the FIP for pod egress (extends ADR-0035's declarative-config preference where no declarative surface exists). Was holder-pinned + single hardcoded FIP; ADR-0112 made it per-node self-discovering (runs everywhere, SNATs to each node's own aliased FIP)
ADR-0109  infra/platform/values.yaml                                fipEgressSnat.* defaults (disabled, image tag/digest); floatingIp removed by ADR-0112 (discovered per-node)
ADR-0109  infra/platform/values-prod.yaml                           fipEgressSnat.enabled for prod; floatingIp removed by ADR-0112
ADR-0110  grid/**/correction/**                     blocklist_word: applyTo drops the word unconditionally (overlay already omits null-yielding words); record path skips the last-clue guard; identity is word_text (old_clue_text null)
ADR-0110  grid/api/src/main/resources/db/migration/*blocklist_word*  Expand-contract: kind CHECK += 'blocklist_word'; old_clue_text relaxed to nullable
ADR-0110  grid/**/persistence/*GridBackfill*        Blocklist backfill is a NEW strategy (patch-only can't remove a word): match stored grids on payload wordText; dailies → EnsureUpcomingDailiesUseCase.execute(date,force=true); solo → DELETE row (regen on next GET). Progress via ADR-0105
ADR-0110  grid/api/**/routes/CorrectionRoute*       POST /v1/corrections/blocklist-word (202, audited) + GET /v1/corrections/blocklist-preview (dry-run counts); admin:signalements. Destructive → impact preview + typed-word confirm client-side
ADR-0110  frontend/src/**/signalements/**           "Blacklister le mot": preview counts → typed-word confirm → blocklist + survey action + progress; hidden/disabled without wordText; tutoiement
ADR-0111  grid/api/openapi.yaml                     New internal `POST /v1/puzzles/{id}/resolve-word` {clueText} → {word}; serviceToken-gated + off public ingress; returns PLAINTEXT (stricter than ADR-0084's binary), ADR-0076 §9 preserved (word never to the player)
ADR-0111  grid/api/**/routes/PuzzleRoute.kt         resolve-word route: puzzleId+clueText → the one placement's wordText from the stored puzzle; service-token gate; 404 clue-not-on-puzzle
ADR-0111  survey/api/openapi.yaml                   SignalementRequest.wordText deprecated (server owns it); SignalementSummary gains surface + puzzleId and wordText becomes the server-resolved answer word
ADR-0111  survey/**/usecases/SubmitSignalementUseCase*  Resolve the word via grid at submit + persist on the report; accept + backfill when grid is unreachable
ADR-0111  survey/infrastructure/**/grid/GridWordResolver*  survey→grid resolve-word client (X-Service-Token), mirrors IdentityClient; surface-dispatched (puzzle now, mini-game corpus branch stubbed)
ADR-0111  survey/infrastructure/src/main/resources/db/migration/*  word_text now holds the resolved answer (repurposed from the player letters); puzzleId stays nullable
ADR-0111  frontend/src/**/signalements/**          Display the server-resolved word (reliable); stop sending player letters
ADR-0112  terraform/k8s/providers/hetzner/floating-ip.tf          Per-worker egress FIPs: worker[0] reuses the ingress FIP; each worker[i>0] gets hcloud_floating_ip.worker_egress[i-1] assigned to that server (assignment is what stops the ADR-0106 §1 black hole). All must be on the Brevo allowlist
ADR-0112  terraform/k8s/providers/hetzner/server.tf              worker_floating_ips local: every worker aliases exactly one FIP (holder=ingress, others=own egress FIP). Amends ADR-0106 §2 (non-holders no longer floating_ip="")
ADR-0112  terraform/k8s/providers/hetzner/cloud-init/worker.yaml.tftpl  Split gating: netplan FIP alias on `floating_ip != ""` (all workers); :6443 DNAT + floating-ip-config.service + bliss.io/fip-holder label on `fip_holder` (worker[0] only). Non-holder FIPs are egress-only
ADR-0112  infra/platform/templates/fip-egress-snat-daemonset.yaml  Amends ADR-0109: runs on every node (no holder nodeSelector), discovers the node's FIP (global eth0 addr that isn't the default-route source), SNATs to it; nodes with no FIP idle. Un-pins mail from the holder
```

## Adding entries

When adding a new ADR or making an existing one operationally binding for a
new path, append to the registry above. The CI gate enforces that any change
to `docs/adr/NNNN-*.md` is paired with a touch of this file in the same PR.
That doesn't mean the touch has to add a line — sometimes an ADR is purely
contextual and doesn't govern a specific path — but if the gate trips on an
ADR that genuinely doesn't bind any path, add an "# ADR-NNNN: contextual, no
binding paths" comment line below the table so the diff is explicit.
