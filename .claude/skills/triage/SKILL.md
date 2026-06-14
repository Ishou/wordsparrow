---
name: triage
description: Triage and prioritize open GitHub issues — assign `priority:high|medium|low` labels, dedupe, and consolidate. Use when the user asks to "prioritize the issues", "triage the backlog", "add priority on the gh issues", "rank the open issues", or whenever there is a pile of open issues to sort. Works on ANY open issue except the Renovate "Dependency Dashboard" (bot-managed). Carries three lenses: human-authored issues (value/severity), `ai-driven` / `post-bump-enhancement` issues (synthesized bodies are hypotheses, dedupe by spine), and `breaking-bump` spines (`needs-human` ⇒ high). Encodes the priority-label scheme and the auto-label / confirm-before-close mutation policy.
---

# GitHub issue triage playbook

Sort a pile of open issues into priority tiers, dedupe what overlaps, and label
them — without blindly executing any of them. This skill is the human-judgment
pass over the backlog.

If the user just wants one specific issue *worked*, don't invoke this — go do the
work. This is for sorting a *pile*.

## Scope: what gets triaged

Triage **every open issue except** the Renovate **"Dependency Dashboard"** issue
— that one is a bot-maintained checklist with its own lifecycle, not a unit of
work. It is authored by `renovate[bot]` and titled "Dependency Dashboard"; skip
it by that signal, not by a hard-coded number (the number changes if it's ever
recreated).

If the user names specific issues (`/triage #944 #943`), triage only those.

## Three lenses (classify each issue first)

An issue's labels tell you which caution applies. Read the labels before the
body.

### Lens A — human-authored issues (the default)

`bug`, `enhancement`, `documentation`, `question`, or any issue with no
machine-origin label. The body is authored by a person, so its claims are
trustworthy. Rank by **value × severity ÷ scope**: a small fix to a real
user-facing break outranks a large speculative refactor.

### Lens B — AI-synthesized issues (`ai-driven`, `post-bump-enhancement`)

The ADR-0068 breaking-bump pipeline opens these as opportunistic follow-ups
("now that helm is on v4, you *could* also…"). Two properties change how you
treat them:

1. **The bodies are synthesized, not authored.** Agents write these from release
   notes + LLM inference, not from reading our code (Agent A "never reads code").
   Their technical claims — key names, "existing releases keep CSA automatically",
   file/line references — are *plausible*, not *verified*. Treat every factual
   claim as a hypothesis to check before acting. (See the memory note
   [[project-breaking-bump-live-signoz]] — synthesized parsers shipped real
   format bugs for exactly this reason.) Every triage comment on one of these
   must carry a **verify-before-acting caveat** naming which claim to check.

2. **The same bump can run several times.** Each run has its own "spine" issue
   and emits its own follow-ups. A helm v3→v4 migration that ran four times
   produced four near-identical "update the `--atomic` comments" issues citing
   spines #872 / #876 / #879 / #882. **Most apparent duplication is this** — so
   the spine reference in each body is your primary dedupe key.

These are "do later, separately" by construction (the label says so) — none is
urgent. The triage question is "which few are worth a PR cycle, which collapse
together, which just close."

### Lens C — `breaking-bump` spine/tracking issues

These are pipeline-managed tracking issues for a supervised dependency bump, not
discrete tasks. Priority follows their status, not their body:

- **`needs-human` present ⇒ `priority:high`.** The label means a human must act
  (escalation/failure). That *is* "do next."
- **No `needs-human` ⇒ rank by blast radius.** A bump to an auth/data-path chart
  (oauth2-proxy, cloudnative-pg) outranks a CSI/driver patch. Most sit at
  `medium`.

Don't dedupe or close spines — the pipeline owns their lifecycle. Just label.

## The procedure

### 1. Gather

```sh
gh issue list --state open \
  --json number,title,labels,author,createdAt --limit 200
```

Drop the Renovate Dependency Dashboard (author `renovate[bot]` + title
"Dependency Dashboard"). For the issues that survive, read every body in one
batch (don't round-trip per issue):

```sh
for n in <numbers>; do
  echo "==== #$n ===="
  gh issue view "$n" --json title,body,labels,comments \
    --template '{{.title}}{{"\n---\n"}}{{.body}}{{"\n"}}'
done
```

For each issue, note its **lens** (A/B/C from its labels), and — for Lens B — the
**spine issue** it cites and whether it asks for a *change* or an *investigation*.

### 2. Group by underlying work, not by issue (Lens B mainly)

Collapse the list into actual units of work:

- **Exact-duplicate task across spine runs** → one canonical issue, the rest are
  duplicates. Keep the most complete body as canonical.
- **Several angles on one investigation** → one umbrella issue with a checklist
  absorbing the other angles. A single local-cluster session should answer all of
  them; three separate PR cycles is waste. (Helm SSA is the canonical case:
  "existing releases" + "rollback-on-failure trade-off" + "net-new installs" are
  one `make deploy-local` session, not three.)
- **Genuinely distinct, standalone work** → leave as its own unit.

Lens A and Lens C issues rarely collapse — only merge them on a clear, literal
duplicate. State any collapse explicitly to the user, e.g. "6 issues → 3 units."

### 3. Rank into tiers

Map each surviving unit to a priority label:

- **`priority:high`** — clear value, bounded scope, real benefit. A user-facing
  bug; a `needs-human` bump spine; friction we *deliberately* took on during a
  migration (a setting pinned to the old default to land it safely). Do it next.
- **`priority:medium`** — worth doing but either investigation-shaped (likely
  outcome "validated, no change needed, close with a note") or a non-urgent
  improvement. Umbrella investigations and most bump spines live here.
- **`priority:low`** — cosmetic (comment text, doc wording) or purely prospective
  (only bites under a future condition like onboarding a new chart). Often best
  folded into the next edit of the same file rather than a standalone PR — call
  that out.

For AI-synthesized issues (Lens B), favour collapsing over keeping: the pipeline
over-produces; your job is to under-keep.

### 4. Apply the triage to GitHub

**Mutation policy (confirmed with the maintainer 2026-06-14):**

- **Labels and comments — apply automatically.** They're additive and trivially
  reversible. Don't ask first.
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
stating its tier and a one-line rationale. For **Lens B** issues, the comment
*must* also name which synthesized claim to verify before anyone implements it
(key name, file/line, upstream-changelog assertion). For the umbrella issue, the
comment carries the consolidated checklist so absorbed angles aren't lost when
their issues close.

After confirmation, close duplicates/consolidations with `--reason "not planned"`
and a linking comment naming the survivor and the duplicate spine run:

```sh
gh issue close <dup> --reason "not planned" \
  --comment "Duplicate of #<canonical> — same task from a separate run of the bump (spine #<n>). Tracking on #<canonical>."
```

### 5. Report

Give the maintainer a compact table: issue → lens → tier → status (open /
closed-as) → one-line note. For any Lens B issues in the run, add the two
standing flags: the duplication count (how many pipeline re-runs caused it) and
the reminder that those bodies are synthesized.

## Worked example (the 2026-06-14 run this skill was extracted from)

Six open `post-bump-enhancement` issues (#883, #880, #877, #873, #869, #851) →
**3 units of work**:

| Unit | Issues | Tier | Outcome |
|---|---|---|---|
| OTLP HTTP/4318 migration | #851 | high | kept open, only non-helm one |
| Helm 4 SSA validation | #880 ← #877, #869 | medium | #880 umbrella; #877/#869 consolidated in |
| `--atomic` comment update | #883 ← #873 | low | #883 canonical; #873 closed as dup |

Duplication source: the helm v3→v4 bump ran 4× (spines #872/#876/#879/#882).
~$0 of real work was lost by closing three. All three were Lens B — every
triage comment named the claim to verify before implementing.
