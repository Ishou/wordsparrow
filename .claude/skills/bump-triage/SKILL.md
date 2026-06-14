---
name: bump-triage
description: Triage and prioritize the AI-generated `post-bump-enhancement` issues that the ADR-0068 breaking-bump pipeline opens after a dependency migration. Use when the user asks to "prioritize the enhancement issues", "triage the post-bump issues", "clean up the bump follow-ups", "rank the enhancement backlog on GitHub", or whenever there is a pile of open `post-bump-enhancement` / `ai-driven` issues to sort. Encodes the dedupe-across-spine-runs heuristic, the "synthesized bodies are not load-bearing" caution, the priority-label scheme, and the auto-label / confirm-before-close mutation policy.
---

# post-bump-enhancement triage playbook

The ADR-0068 `breaking-bump` pipeline opens GitHub issues labelled
`post-bump-enhancement` as opportunistic follow-ups to a dependency migration
("now that helm is on v4, you *could* also…"). They accumulate, they overlap,
and their bodies are **machine-synthesized** — so they need a human-judgment
triage pass, not blind execution. This skill is that pass.

If the user just wants one specific issue worked, don't invoke this — go do the
work. This skill is for sorting a *pile* of follow-ups.

## Why these issues need triage (read this first)

Three properties of the pipeline shape everything below:

1. **The same bump can run several times.** Each run has its own "spine" issue
   and emits its own follow-ups. A helm v3→v4 migration that ran four times
   produced four near-identical "update the `--atomic` comments" issues citing
   spine issues #872 / #876 / #879 / #882. **Most apparent duplication is this**,
   not four real opportunities — so the spine reference in each body is your
   primary dedupe key.

2. **The bodies are synthesized, not authored.** ADR-0068 agents write these
   from release notes and LLM inference, not from reading our code (Agent A
   "never reads code"). Their technical claims — key names, "existing releases
   keep CSA automatically", file/line references — are *plausible*, not
   *verified*. Treat every factual claim as a hypothesis to check before acting,
   never as ground truth. (See the memory note
   [[project-breaking-bump-live-signoz]] — synthesized parsers shipped real
   format bugs for exactly this reason.)

3. **They are explicitly "do later, separately."** The label description says so.
   None is urgent by construction. The triage question is never "do all of
   these" — it's "which few are worth a PR cycle, which collapse together, and
   which should just close."

## The procedure

### 1. Gather

```sh
gh issue list --label post-bump-enhancement --state open \
  --json number,title,labels,createdAt --limit 100
```

Then read every body in one batch (don't round-trip per issue):

```sh
for n in <numbers>; do
  echo "==== #$n ===="
  gh issue view "$n" --json title,body,comments \
    --template '{{.title}}{{"\n---\n"}}{{.body}}{{"\n"}}'
done
```

For each issue, extract: the **spine issue** it cites, the **target file(s)**,
and whether it asks for a *change* or an *investigation*.

### 2. Group by underlying work, not by issue

Collapse the list into actual units of work:

- **Exact-duplicate task across spine runs** → one canonical issue, the rest are
  duplicates. Keep the most complete body as canonical.
- **Several angles on one investigation** → one umbrella issue with a checklist
  absorbing the other angles. A single local-cluster session should answer all
  of them; three separate PR cycles is waste. (Helm SSA is the canonical case:
  "existing releases" + "rollback-on-failure trade-off" + "net-new installs" are
  one `make deploy-local` session, not three.)
- **Genuinely distinct, standalone work** → leave as its own unit.

State the collapse explicitly to the user, e.g. "6 issues → 3 units of work."

### 3. Rank into tiers

Map each surviving unit to a priority label:

- **`priority:high`** — clear value, bounded scope, real benefit. Resolves
  friction we *deliberately* took on during the bump (e.g. a setting we pinned
  to the old default to land the migration safely). Do it next.
- **`priority:medium`** — worth doing but investigation-shaped: the likely
  outcome is "validated, no change needed, close with a note." Umbrella
  investigations live here.
- **`priority:low`** — cosmetic (comment text, doc wording) or purely
  prospective (only bites under a future condition like onboarding a new chart).
  Often best folded into the next edit of the same file rather than a standalone
  PR — call that out.

Favour collapsing over keeping. The pipeline over-produces; your job is to
under-keep.

### 4. Apply the triage to GitHub

**Mutation policy (confirmed with the maintainer 2026-06-14):**

- **Labels and comments — apply automatically.** They're additive and
  trivially reversible. Don't ask first.
- **Closing / consolidating issues — always confirm first.** Closing is visible
  shared-state and merges information; get a yes before doing it. Present the
  close list ("close #873 as dup of #883; close #877 + #869 into #880") and wait.

Create the labels if missing (idempotent — ignore "already exists"):

```sh
gh label create "priority:high"   --color E11D21 --description "Triage: do next — clear value, bounded scope."
gh label create "priority:medium" --color FBCA04 --description "Triage: worth doing — schedule after high-priority work."
gh label create "priority:low"    --color C5DEF5 --description "Triage: cosmetic/prospective — do opportunistically or close."
```

For each kept issue: add its priority label and post a short triage comment
stating its tier, the one-line rationale, and — critically — a **verify-before-
acting caveat** naming which synthesized claim to check (key name, file/line,
upstream-changelog assertion) before anyone implements it.

For the umbrella issue, the comment should carry the consolidated checklist so
the absorbed angles aren't lost when their issues close.

After confirmation, close duplicates/consolidations with `--reason "not planned"`
and a linking comment that names the survivor and the duplicate spine run, so the
trail is legible:

```sh
gh issue close <dup> --reason "not planned" \
  --comment "Duplicate of #<canonical> — same task from a separate run of the bump (spine #<n>). Tracking on #<canonical>."
```

### 5. Report

Give the maintainer a compact table: issue → tier → status (open / closed-as) →
one-line note, plus the two standing flags — the duplication count (how many
pipeline re-runs caused it) and the reminder that bodies are synthesized.

## Worked example (the 2026-06-14 run this skill was extracted from)

Six open issues (#883, #880, #877, #873, #869, #851) → **3 units of work**:

| Unit | Issues | Tier | Outcome |
|---|---|---|---|
| OTLP HTTP/4318 migration | #851 | high | kept open, only non-helm one |
| Helm 4 SSA validation | #880 ← #877, #869 | medium | #880 umbrella; #877/#869 consolidated in |
| `--atomic` comment update | #883 ← #873 | low | #883 canonical; #873 closed as dup |

Duplication source: the helm v3→v4 bump ran 4× (spines #872/#876/#879/#882).
~$0 of real work was lost by closing three.
