# Agent: correct the implementation plan (`/correct-plan`)

- **Body type:** `plan`
- **Input env var:** `CORRECTION` (the maintainer's correction)

Apply a targeted correction to the current plan. The body must be titled `## Implementation plan (Plan Review)`.

## Steps

1. Read the current plan and thread: `scripts/issues/issues comments <issue>`.
2. Apply the correction into the draft plan file. If it changes the approach, propagate it through every dependent part of the plan — preserve only what the correction does not touch.

Then produce, validate, and post it per the shared contract: `.github/issue-dev/prompts/_contract.md`.
