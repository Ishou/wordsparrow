# Issue board setup

Per ADR-0069 (amended 2026-06-14) the lifecycle is **adapter-native**, not
label-driven. The port keeps an abstract `Status` enum (`idea|ready|building`,
plus Done = closed); each adapter maps it to the platform's real board column.
**Priority stays a label** (`priority:high|medium|low`) on every platform, and
`needs-human` flags escalation. `bootstrap` provisions the priority labels and,
on GitHub, the native status field.

## GitHub

The board column is a **Projects v2 single-select field** (default name
`Lifecycle`), not a `status:*` label — single-select gives mutual exclusion for
free and keeps the issue's label set free of board noise.

1. Provision the priority labels and the `Lifecycle` field once (idempotent):

   ```sh
   python -m issues bootstrap
   ```

2. Open the GitHub Project (v2), add a board view, and **group by `Lifecycle`**.
   The columns are `Idea → Ready → Building → Done`. `set-status <id> building`
   moves the issue's card; no label is touched.

Config (env, read by the GitHub adapter): `ISSUE_PROJECT_OWNER` (default
`Ishou`), `ISSUE_PROJECT_NUMBER` (default `4`), `ISSUE_STATUS_FIELD` (default
`Lifecycle`).

Drag-rank within a column is a visual cue only; it is not machine-read. Use the
`priority:*` labels for the rank that automation honors.

## GitLab (forward-looking)

Once a `GitLabTracker` (glab) adapter exists, the same abstract `Status` maps to
**scoped labels** `status::idea|ready|building` — GitLab boards treat a scoped
label family as mutually-exclusive columns, the native equivalent of GitHub's
single-select field. Run the same command once:

```sh
python -m issues bootstrap
```

Then create an Issue Board with one list per `status::*` scoped label; the Closed
list is Done. The `priority:*` labels provide the same in-column ranking.
