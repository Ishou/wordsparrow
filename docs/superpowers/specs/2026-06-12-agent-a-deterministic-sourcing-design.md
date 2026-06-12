# Agent A — deterministic sourcing + provenance — design (DRAFT)

> A reliability redesign of **Agent A** (the doc gatherer) in the
> `breaking-bump` migration pipeline. ADR-0068 governs the pipeline; this spec
> does not change that decision, it hardens one stage of it.

**Date:** 2026-06-12
**Status:** DRAFT — pending maintainer review before the implementation plan.
**Branch:** `docs/breaking-bump-agent-a-reliability`
**Governing ADR:** ADR-0068 (AI-driven breaking-bump migration pipeline).
**Touched artifacts:** `.github/breaking-bump/prompts/agent-a.md`,
`.github/workflows/breaking-bump.yml` (the `agent-a` job),
`scripts/breaking-bump/schema/ab_contract.schema.json`,
`scripts/breaking-bump/abparse.py`, `infra/tools-upgrade-sources.yaml`,
and new `scripts/breaking-bump/` helpers + tests.

---

## Problem

Agent A's job is to fetch the official upstream docs for a version transition
and emit a grounded, project-agnostic A→B contract (`abschema.json`). It is the
*root* of the whole pipeline: B plans against A's findings, C reviews against
them, D implements them. If A misses a breaking change, the miss propagates all
the way to the claude PR — and the only safety net left is the human merge.

On 2026-06-12 a live run (verified via SigNoz) produced a **false negative**: A
**missed a real breaking change**. SigNoz's bundled `k8s-infra-0.16` sub-chart
**flips the default OTLP exporter from gRPC `:4317` to HTTP `:4318`**,
documented at `signoz.io/docs/.../upgrade-k8s-infra-v0-16/`. Two runs on
*identical input* diverged: one found it, one did not. That non-determinism is
the headline defect — a doc-sourcing stage that gives different answers on the
same bump cannot be trusted as a gate.

Tracing the run surfaced four compounding root causes, all in `agent-a.md`'s
**"Sourcing order"**, which is **discovery-first**:

1. **The deterministic registry is the lowest-priority input.** The order is
   (1) read Renovate PR-body links, (2) WebFetch them, (3) WebSearch for guides,
   (4) consult `infra/tools-upgrade-sources.yaml` **last**, framed as a
   "verified override … use if present." So the one input we *control and
   trust* is consulted only after the LLM has already led with PR-body +
   open-ended WebFetch/WebSearch. Whether the registry entry is even reached
   depends on how the model felt the discovery phase went — hence the
   divergence.

2. **The agent invents URLs.** The run guessed release URLs
   (`upgrade-0-124 … 0-128`) that all 404'd. The prompt says "do NOT
   speculatively invent URLs," but a discovery-first flow with WebSearch as a
   primary tool makes constructed URLs the path of least resistance.

3. **The agent fetched the wrong repo.** It pulled `SigNoz/signoz` *application*
   releases, not the registered `SigNoz/charts` *chart* releases — even though
   `tools-upgrade-sources.yaml` already pins `SigNoz/charts` for both `signoz`
   and `k8s-infra`. The registry knew; the agent didn't lead with it.

4. **The agent never traversed to the bundled sub-chart.** The breaking change
   lives in `k8s-infra`, a sub-chart bundled by the `signoz` umbrella chart.
   Nothing in A's flow says "resolve the umbrella chart's `dependencies:` and
   source docs for each sub-chart too," so the sub-chart where the break
   actually lives was never visited.

Underlying all four: **A leads with AI discovery and treats the deterministic
registry as a fallback.** Reliability requires the inversion.

A secondary, structural defect compounds the above: **Gate A's confidence
signal is self-reported by the LLM.** Today `sourceConfidence` is rated by A
itself ("rate by evidence, not feeling") and the consumer-side gate is *B*
rating A (`/tmp/abrating.txt`). A "no breaking changes found, confidence high"
verdict can therefore rest entirely on discovered, unverified, or even 404'd
sources, and nothing deterministic catches it. Self-certified reliability is
worthless — a miss reports the same `high` a clean run does.

### Non-goals

- Re-architecting B/C/D, the B↔C loop, or the spine-issue mechanics.
- Changing Step-0 dispatch routing or the allowlist.
- Touching the helm values-diff carryover (it stays a human-readable
  attachment on the issue, out of the A→B schema).
- Any data-source/licence change — see the ADR-0058 note in §6.4.

---

## Goals

1. **Determinism.** Identical input → identical set of *authoritative* sources
   fetched. The registry, not the model's discovery mood, decides the floor.
2. **Registry-first sourcing.** The registered URLs for the dep *and its
   bundled sub-charts*, across the full `$FROM`→`$TO` range, are resolved and
   fetched **by the workflow**, before the LLM runs. AI discovery only fills
   gaps; the agent never invents URLs.
3. **Machine-stamped provenance.** Every source carries where it came from
   (`registry | pr-body | websearch | constructed`). The `registry` label is
   stamped *by the workflow* (which knows what it handed the agent), never
   self-reported.
4. **Deterministic confidence gate.** A breaking-relevant verdict resting only
   on non-registry/discovered or `!fetchedOk` sources is **capped below
   high/medium** by a deterministic post-check — not by the LLM's self-rating.
   For a breaking-eligible bump, "no breaking changes found" requires the
   registered authoritative sources to have been fetched cleanly.
5. **Registry coverage.** `k8s-infra`'s upgrade-guide `extraDocs` is registered,
   and the signoz↔k8s-infra sub-chart relationship is explicit (or derived from
   `Chart.yaml dependencies`).

---

## Design

The redesign has four parts, in dependency order: the **schema** gains
provenance; a **deterministic pre-step** resolves+fetches registered URLs and
hands them to an **inverted prompt**; a **deterministic confidence gate**
derives Gate-A strength from provenance; and the **registry** gains the missing
coverage. Each is a bounded change to a named artifact.

### §1. Schema — add machine-stampable provenance (`ab_contract.schema.json`)

Add a `provenance` field to each `sources[]` entry, alongside the existing
`url`, `type`, `fetchedOk`:

```jsonc
"sources": {
  "items": {
    "required": ["url", "type", "fetchedOk", "provenance"],
    "properties": {
      "url":        { "type": "string", "minLength": 1 },
      "type":       { "enum": ["changelog", "migration-guide", "llms-txt", "release"] },
      "fetchedOk":  { "type": "boolean" },
      "provenance": { "enum": ["registry", "pr-body", "websearch", "constructed"] }
    }
  }
}
```

Provenance semantics:

| value         | meaning                                                              | who sets it |
|---------------|---------------------------------------------------------------------|-------------|
| `registry`    | the URL came from `tools-upgrade-sources.yaml` (incl. sub-charts)   | **workflow** (machine-stamped) |
| `pr-body`     | the URL was linked in the Renovate PR body                          | agent       |
| `websearch`   | the URL was found via WebSearch                                     | agent       |
| `constructed` | the agent built/guessed the URL itself (e.g. range-walking a tag)   | agent       |

**`registry` is reserved to the workflow.** The pre-step (§2) writes the
registry-sourced entries into the contract with `provenance: registry` and the
true `fetchedOk` it observed. The agent **must not** label anything `registry`;
it only labels the sources it discovered itself (`pr-body | websearch |
constructed`). This is the load-bearing trust boundary: the gate (§3) extends
trust *only* to entries it can verify the workflow stamped.

> **Open question OQ-1 (enforcement of the trust boundary).** Self-stamping by
> the agent is "forbidden by prompt" but not mechanically prevented — the agent
> *could* emit `provenance: registry` on a hallucinated URL. Options: (a) the
> gate cross-checks every `registry`-stamped entry against the pre-step's
> emitted manifest (`/tmp/registry-sources.json`) and **rejects/relabels** any
> `registry` entry the workflow didn't produce; (b) the workflow *owns* the
> sources array entirely (agent emits findings keyed by `sourceUrl`, workflow
> assembles `sources[]`). (a) is lower-blast-radius and recommended; (b) is
> cleaner but a bigger contract change. Defaulting to (a) below.

This is a **schema change** → per ADR-0003 it ships **schema-first** as its own
wave before any producer/consumer edit (see §7, W1).

### §2. The deterministic pre-step (`agent-a` job in `breaking-bump.yml`)

A new workflow step runs **before** the `claude-code-action` step, with no AI.
It is the heart of the inversion. Steps:

1. **Resolve registry entries for `$DEP`.** Look up `$DEP` in
   `tools-upgrade-sources.yaml` (`modeA`). Read `releaseNotes` and `extraDocs`
   templates.
2. **Resolve bundled sub-charts.** For a helm umbrella chart, fetch/read the
   chart's `Chart.yaml` `dependencies:` to enumerate sub-charts (e.g. `signoz`
   bundles `k8s-infra`). For each sub-chart that *also* has a registry entry,
   include its templates too. (Source for `Chart.yaml`: the Renovate PR's
   changed chart dir, mirroring the existing values-diff step's chart
   discovery; fallback to the pinned upstream chart archive.)
3. **Expand `{version}` across the range.** For each registry template,
   substitute every release version across `$FROM`→`$TO` (not just `$TO`). The
   range-walk is deterministic version arithmetic, not URL guessing — and only
   over *registered* templates, so a 404 means "this registered release tag
   doesn't exist," a real signal (§5), not a hallucination.
4. **Fetch each resolved URL.** HTTP GET; record `fetchedOk` (200 vs not) and
   stash the body for the agent to read (e.g. `/tmp/registry-docs/<slug>.md`).
5. **Emit the registry manifest** to `/tmp/registry-sources.json`: the list of
   `{url, type, fetchedOk, provenance: "registry"}` entries the workflow
   resolved + fetched, plus pointers to the fetched bodies.

The pre-step then hands Agent A: (i) the resolved URL list, (ii) the fetched
content on disk, (iii) the manifest. The agent's job becomes **"read what the
workflow already fetched; extract verbatim findings; only WebFetch/WebSearch to
fill gaps the registry didn't cover; never invent URLs."**

**Where the logic lives:** a new pure-Python module
`scripts/breaking-bump/sources.py` (resolution + range-walk + manifest
assembly), unit-testable without network, plus a thin fetch wrapper. The
workflow step shells into it. Keeping resolution in Python (not inline bash)
makes it testable against fixtures (§5).

> **Open question OQ-2 (range-walk for charts with no per-patch tag).** Some
> registry entries already note "floating minor pin … link to releases
> listing" (e.g. `nats`). For those, range expansion is undefined — fetch the
> releases-listing URL once and let the agent read the range from it, vs. skip.
> Recommend: if the template has no `{version}`, fetch it verbatim once,
> `provenance: registry`, and let the agent enumerate. Confirm.

> **Open question OQ-3 (`Chart.yaml dependencies` vs explicit registry links).**
> Two ways to know `signoz` bundles `k8s-infra`: derive it live from
> `Chart.yaml`, or add an explicit `subcharts:` key in the registry. Live
> derivation is always-correct but adds a chart-archive fetch + parse to the
> pre-step; an explicit key is simpler but is a registry that can lag. Recommend
> **derive from `Chart.yaml`** (the chart is the source of truth) and treat the
> registry as *which docs* per sub-chart, not *which sub-charts exist*. Confirm.

### §3. Deterministic confidence gate (`abparse.py` + `agent-a` job)

Today Gate A is `bool(errors) or abparse.zero_docs(doc)` — it only catches
"zero usable sources / invalid schema." It does **not** catch "found sources,
but none authoritative, and reported a clean bill of health." Add a
provenance-derived confidence floor.

New pure function in `abparse.py` (or a sibling `confidence.py`):

```python
def registry_confidence(doc, *, breaking_eligible) -> str:
    """Deterministic confidence floor derived from provenance + fetchedOk.

    Returns the MAX confidence the contract is allowed to claim, independent
    of the LLM's self-rated sourceConfidence. The gate takes min(self, floor).
    """
    reg_ok = any(s["provenance"] == "registry" and s["fetchedOk"]
                 for s in doc.get("sources", []))
    no_breaks = not (doc.get("breakingChanges") or doc.get("removals"))
    if breaking_eligible and no_breaks and not reg_ok:
        return "low"          # "nothing found" must rest on fetched registry docs
    return "high" if reg_ok else "medium"
```

The gate then computes the **effective** confidence as
`min(self_reported, floor)` over the ordered scale `none < low < medium < high`,
and routes on the *effective* value, not the self-reported one. Specifically:

- A `major`/`0.x` (breaking-eligible) "no breaking changes found" verdict that
  has **no cleanly-fetched `registry` source** is capped at `low` → tightens
  Gate A: it forces a **human pre-flight** (route to `needs-human` / `escalate`,
  reusing `routing.nodoc_route`'s escalate path) rather than letting the clean
  bill of health flow to B.
- A verdict backed by ≥1 cleanly-fetched `registry` source keeps its
  self-rating (capped at the floor).

This makes "the registered authoritative sources were fetched cleanly" a
**precondition** for a high/medium clean verdict on a breaking-eligible bump.
Crucially this is computed **by the workflow over machine-stamped provenance**,
never trusting the LLM's self-rating or self-stamped `registry` labels (OQ-1).

> **Open question OQ-4 (escalate vs hard-fail).** When the floor caps a clean
> verdict to `low` on a breaking-eligible bump, do we (a) hard-fail Gate A
> (`exit 1`, run dies, human notified via the spine issue), or (b) let the
> pipeline proceed but flag the contract `needs-human` so B plans cautiously and
> a human pre-flights the plan? (a) is safest; (b) preserves the cheap-attempt
> value. Recommend **(a) for breaking-eligible**, since A is the root and a
> false-negative there is the exact failure we're fixing. Confirm.

> **Open question OQ-5 (interaction with B-rates-A Gate A).** Two Gate-A signals
> now exist: this deterministic floor and B's `/tmp/abrating.txt`. They should
> compose as **AND** (both must pass). Confirm the deterministic floor runs in
> the `agent-a` job's tripwire step (failing before B even spins up) rather than
> deferring to B's rating.

### §4. Inverted prompt contract (`agent-a.md`)

Rewrite the **"Sourcing order"** section to be registry-first:

1. **Read the registry-fetched docs the workflow handed you.** The workflow has
   already resolved and fetched the registered authoritative URLs for `$DEP`
   *and its bundled sub-charts*, across the whole `$FROM`→`$TO` range, into
   `/tmp/registry-docs/` (manifest at `/tmp/registry-sources.json`). These are
   your **primary** sources. Extract verbatim findings from them first.
2. **Fill gaps with PR-body links** (`pr-body`), then **WebSearch**
   (`websearch`) — only for transitions/sub-charts the registry didn't cover.
3. **Never invent URLs.** If you build a URL yourself, label it `constructed`
   and expect the gate to discount it. Do not emit `provenance: registry` —
   that label is the workflow's alone.
4. **Sub-charts are first-class.** A breaking change in a bundled sub-chart
   (e.g. `k8s-infra` under the `signoz` umbrella) is in scope; the workflow has
   already fetched its registered docs.

Plus: the agent stamps `provenance` on every source it *discovered*; it does
**not** author the `registry` entries (the workflow merges those in). Update the
schema example block and the `sourceConfidence` rubric to reference the
provenance-derived floor rather than feeling.

This is a **prompt + contract** change → producer wave (§7, W2), after the
schema wave.

---

## Data flow

```
read-context  ──▶  agent-a job
                     │
                     ├─[PRE-STEP, deterministic, no AI]──────────────┐
                     │   sources.py:                                 │
                     │     resolve $DEP + sub-charts (Chart.yaml deps)│
                     │     range-walk {version} over $FROM→$TO        │
                     │     fetch each registered URL  ──▶ fetchedOk   │
                     │   writes: /tmp/registry-docs/*, manifest.json  │
                     │           (every entry provenance=registry)    │
                     ▼                                                │
                   [claude-code-action: Agent A]                      │
                     reads registry docs + manifest                  │
                     fills gaps via PR-body / WebSearch              │
                     stamps provenance on DISCOVERED sources only    │
                     writes ./abschema.json (findings + sources[])   │
                     ▼                                                │
                   [merge step] workflow injects manifest's          │
                     registry entries into abschema.sources[] ◀──────┘
                     ▼
                   [tripwire step, deterministic]
                     validate schema  +  zero_docs  +  registry_confidence floor
                     gate_a_failed = invalid || zero_docs || (breaking_eligible
                                     && no_breaks && !reg_ok)
                     ▼
                   Gate A: pass → b_round1 ; fail → escalate/needs-human
```

Key inversion: **fetch happens in the deterministic pre-step**, before the LLM.
The LLM reads pre-fetched authoritative content and *extracts*; it no longer
*decides what to fetch first*.

---

## Where each change lives (exact files)

| Change | File | Wave |
|---|---|---|
| `provenance` enum on `sources[]` | `scripts/breaking-bump/schema/ab_contract.schema.json` | W1 |
| Stub fixture gains `provenance` | `scripts/breaking-bump/stub_fixtures/abschema.json` | W1 |
| Schema/fixture tests | `scripts/breaking-bump/test_schema.py`, `test_stub_chain.py` | W1 |
| Registry resolution + range-walk + manifest | **new** `scripts/breaking-bump/sources.py` | W2 |
| Pre-step + merge step | `.github/workflows/breaking-bump.yml` (`agent-a` job) | W2 |
| Inverted sourcing order + provenance rules | `.github/breaking-bump/prompts/agent-a.md` | W2 |
| `registry_confidence` floor + effective-confidence | `scripts/breaking-bump/abparse.py` (or new `confidence.py`) | W3 |
| Tripwire step wires the floor into `gate_a_failed` | `.github/workflows/breaking-bump.yml` (tripwire step) | W3 |
| Confidence-floor unit tests | `scripts/breaking-bump/test_abparse.py` (or `test_confidence.py`) | W3 |
| `k8s-infra` `extraDocs` + sub-chart relationship | `infra/tools-upgrade-sources.yaml` | W4 |
| `sources.py` resolution/range-walk tests | `scripts/breaking-bump/test_sources.py` | W2 |

---

## Error handling

- **Registered URL 404 is a real signal, not noise.** Because the pre-step only
  range-walks *registered* templates, a 404 means a registered release tag
  doesn't exist (or the registry rotted) — surfaced as
  `fetchedOk: false, provenance: registry` in the manifest. This is exactly the
  signal the old "agent invents URLs → all 404 → shrugs" flow swallowed. The
  confidence floor (§3) reads it: a breaking-eligible "nothing found" with no
  *cleanly-fetched* registry source is capped to `low`.
- **Registry entry missing entirely for `$DEP`.** Pre-step emits an empty
  manifest; the agent falls back to PR-body/WebSearch (`pr-body`/`websearch`
  provenance); the floor caps a breaking-eligible clean verdict to `low`
  → escalate. (This is the "we forgot to register this dep" case, and it should
  hurt, loudly.)
- **`Chart.yaml` unreadable / no sub-chart deps.** Pre-step proceeds with the
  top-level dep only, logs a `::notice::`; not fatal (a non-helm dep simply has
  no sub-charts).
- **Pre-step crash.** Must not silently zero out sources. If `sources.py`
  raises, the step fails the job (the manifest is load-bearing) — distinct from
  "registry empty" which is a valid, handled state.
- **Spend ledger / issue-comment failures** stay non-fatal as today
  (observability never fails the migration).

---

## Testing (no live LLM calls)

The existing harness already proves the deterministic spine without LLM calls
via `BREAKING_BUMP_STUB=true` (copies `stub_fixtures/*` in place of agent
output) and pytest over the pure modules. We extend both:

1. **`sources.py` (pre-step) — pure unit tests, no network.**
   `test_sources.py` feeds a fixture registry + a fixture `Chart.yaml` and
   asserts: (a) `signoz` resolves to the `SigNoz/charts` templates **and**
   discovers `k8s-infra` from `Chart.yaml dependencies`; (b) range-walk over
   `$FROM`→`$TO` emits one URL per release (and the listing-URL fallback for
   no-`{version}` templates, OQ-2); (c) the manifest stamps every entry
   `provenance: registry`. Fetch is injected (a fake fetcher returning canned
   200/404) so 404-handling is asserted without network.

2. **Confidence floor — pure unit tests.** `test_abparse.py` (or
   `test_confidence.py`) asserts the truth table: breaking-eligible + no breaks
   + no cleanly-fetched registry source → `low` (→ escalate); same but with a
   `registry`+`fetchedOk` source → keeps rating; non-eligible bump → unaffected;
   self-stamped `registry` on an entry absent from the manifest → discounted
   (OQ-1). Prove the **false-negative case fails the buggy gate first**: a
   fixture mirroring the 2026-06-12 miss (clean verdict, only `constructed`/404
   sources) must make `gate_a_failed=true` — a regression gate on the exact
   metric that diverged (per the repo's "gate cross-engine divergence" habit).

3. **Stub-chain guard.** `test_stub_chain.py` updates: the stub `abschema.json`
   gains a `provenance: registry, fetchedOk: true` source so the chain still
   passes Gate A end-to-end. Add a *second* stub fixture
   (`abschema.lownoreg.json`) representing the false-negative shape, asserted to
   **fail** the floor — the stub harness now covers both the pass and the
   newly-guarded fail.

4. **Workflow smoke (stub mode).** The `agent-a` job under
   `BREAKING_BUMP_STUB=true` exercises pre-step → merge → tripwire with the
   fake fetcher, no `claude-code-action`. A fixture manifest stands in for live
   fetches so CI asserts the wiring (manifest → merged `sources[]` → floor)
   without network or LLM.

No change requires a live LLM or live network in CI — every deterministic
boundary (resolution, range-walk, 404 handling, provenance merge, confidence
floor) is fixture-driven.

---

## Wave decomposition

Ordered, each wave fully reviewed + **merged** before the next starts (per the
repo's "plan as waves of PRs" convention). W1 is schema-first per ADR-0003.

- **W1 — schema + provenance (schema-first).**
  Add the `provenance` enum to `ab_contract.schema.json`; update the stub
  fixture + schema/stub tests to carry it. No producer/consumer behaviour
  change yet — purely the contract widening, landed alone so producer/consumer
  waves can build on a merged schema (ADR-0003 §3). `chore(api-…)`-style scope
  is inapplicable (no OpenAPI); scope `docs`/`chore(breaking-bump)`.
  *Gate:* `openapi-lint` is N/A (this is an internal JSON schema, not the
  bounded-context OpenAPI); the schema's own draft-2020-12 validity + the
  pytest suite are the gate.

- **W2 — deterministic pre-step + prompt inversion (producer).**
  New `sources.py` (resolution + sub-chart discovery + range-walk + manifest) +
  `test_sources.py`; the `agent-a` job pre-step + merge step; the inverted
  `agent-a.md`. This is the bulk of the change and the behavioural inversion.
  *Cap watch:* likely near/over the 400-line cap (new module + workflow steps +
  prompt rewrite + tests) — flag a cap-override at dispatch with justification,
  or split `sources.py`+tests from the workflow/prompt wiring if it diverges
  cleanly.

- **W3 — confidence gate (consumer of provenance).**
  `registry_confidence` floor + effective-confidence in `abparse.py`; wire it
  into the tripwire step's `gate_a_failed`; the regression test reproducing the
  2026-06-12 miss. Lands after W2 so the floor reads real machine-stamped
  provenance.

- **W4 — registry coverage.**
  Add `k8s-infra` `extraDocs` (the `upgrade-k8s-infra-v0-16` guide family) to
  `tools-upgrade-sources.yaml`; make the signoz↔k8s-infra relationship explicit
  or rely on W2's `Chart.yaml` derivation (per OQ-3). Smallest wave; could fold
  into W2 if OQ-3 lands on "explicit registry key," but kept separate so the
  derivation decision doesn't block the registry edit.

> **Sequencing note.** W4's content (the missing `k8s-infra` upgrade-guide URL)
> is the *data* that would have caught the 2026-06-12 miss; W2's pre-step +
> sub-chart traversal is the *mechanism* that fetches it; W3 is the *gate* that
> fails loudly when it's absent. All three are needed to close the incident; W1
> is the contract they share. Landing order W1→W2→W3→W4 keeps each PR
> green-on-merge, but W4's registry entry could land as early as W1 (it's inert
> data until W2 reads it) if the maintainer prefers the fix-data-first ordering.

---

## Open questions for the maintainer

- **OQ-1 — trust-boundary enforcement.** Prompt-forbid self-stamped `registry`,
  or have the gate cross-check every `registry` entry against the pre-step
  manifest and relabel/reject impostors? (Recommend the cross-check; §1.)
- **OQ-2 — no-`{version}` registry templates.** For floating-pin entries (e.g.
  `nats` releases-listing), fetch the listing once and let the agent enumerate,
  vs. skip the range-walk? (Recommend fetch-once; §2.)
- **OQ-3 — sub-chart discovery source.** Derive bundled sub-charts live from
  `Chart.yaml dependencies`, or add an explicit `subcharts:` key to the
  registry? (Recommend `Chart.yaml`; §2.)
- **OQ-4 — capped-confidence action.** Hard-fail Gate A vs. proceed-with-
  `needs-human` when the floor caps a breaking-eligible clean verdict?
  (Recommend hard-fail for breaking-eligible; §3.)
- **OQ-5 — compose with B-rates-A.** Confirm the deterministic floor runs in the
  `agent-a` tripwire (before B), AND-composed with B's later rating. (§3.)
- **OQ-6 — pre-step network in CI.** The live pre-step fetches real upstream
  URLs. In CI (non-stub) this is a network dependency on flaky upstreams. Cache
  by `(dep, from, to)`? Tolerate transient 5xx as `fetchedOk: false`
  (conflating with "missing")? Or distinguish `fetchedFail`/`notFound`?
  (Flagging; a transient 502 read as "no docs → escalate" would be a false
  escalation.)
- **OQ-7 — scope of registry-first rollout.** Apply the pre-step to all `modeA`
  deps at once, or signoz-only first (mirroring ADR-0068's incremental
  allowlist)? (Recommend signoz-first, consistent with the lab posture.)

---

## ADR-0058 licence posture

Unaffected. The registry holds **documentation URLs** (release notes, upgrade
guides), not data sources ingested into training/filter paths. Fetching a
SigNoz upgrade guide to extract a verbatim breaking-change quote is reading
docs, not licensing data. No `data/` entry, no matrix row. The ADR-0058 tell
("adding a path under `data/external/`, importing a TSV/CSV") does not trigger
here.
