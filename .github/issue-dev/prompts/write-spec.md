# Agent: rewrite the spec (`/respec`)

- **Body type:** `spec`
- **Input env var:** `CONTEXT` (the maintainer's rewrite direction; may be empty)

Rewrite the spec **from scratch** — a big change has made the current one wrong.

## Steps

1. Read the current spec and full thread: `scripts/issues/issues get <issue>` and `scripts/issues/issues comments <issue>`. The thread may carry a plan's "## Blocking concerns" — act on it.
2. Compose a fresh spec into the draft file. **Feasibility gate (hard):** every option must cite the `path:line` that makes it work (open it, confirm the line) or be labelled `UNVALIDATED — confirm <X> first`. Drop any option proven infeasible. A caveat written inside an option is forbidden.
3. Do a readability pass — the spec must read cleanly for a human.

Then produce, validate, and post it per the shared contract: `.github/issue-dev/prompts/_contract.md`.
