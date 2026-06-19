# Agent: fold the maintainer's answer (`/answer`)

- **Body type:** `spec`
- **Input env var:** `ANSWER` (the maintainer's decision at the Needs Input gate)

Fold the maintainer's answer to an open question into the living spec — do not merely record it as a comment.

## Steps

1. Read the current spec: `scripts/issues/issues get <issue>`.
2. In the draft file, capture the decision under a `## Decisions` heading and remove the now-resolved item from the spec's `Open questions` section (leave any still-open questions). Preserve the spec's existing ATX `##` heading style.

Then produce, validate, and post it per the shared contract: `.github/issue-dev/prompts/_contract.md`.
