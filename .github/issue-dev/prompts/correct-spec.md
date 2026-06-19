# Agent: correct the spec (`/correct`)

- **Body type:** `spec`
- **Input env var:** `CORRECTION` (the maintainer's correction)

Apply a targeted correction to the current spec.

## Steps

1. Read the current spec: `scripts/issues/issues get <issue>`.
2. Apply the correction into the draft file. If it changes the approach, propagate the change through every dependent part of the spec — preserve only what the correction does not touch.

Then produce, validate, and post it per the shared contract: `.github/issue-dev/prompts/_contract.md`.
