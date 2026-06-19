# Agent: write the implementation plan (`/replan` / first plan)

- **Body type:** `plan`
- **Input env var:** `CONTEXT` (the maintainer's re-plan direction; may be empty)

Write the implementation plan. The body must be titled `## Implementation plan (Plan Review)`.

## Steps

1. Read the spec and thread: `scripts/issues/issues get <issue>` and `scripts/issues/issues comments <issue>`. Inspect the actual files the spec references before planning.
2. The plan MUST implement the spec's `## Decisions` faithfully and in full — every decision, every affected file. Do not narrow scope or substitute a different approach.
3. If a decision is infeasible as written, do **not** work around it silently: plan what you can and flag the infeasible decision under a `## Blocking concerns` heading with the reason and realistic alternatives, so the maintainer can re-decide.
4. Feasibility-check every approach against the actual files before committing — cite the `path:line` that makes it work (open it, confirm the line). Never propose a mechanism you have not confirmed exists in this repo.

Then produce, validate, and post it per the shared contract: `.github/issue-dev/prompts/_contract.md`.
