# Issue board setup

Per ADR-0069 (amended 2026-06-14) the lifecycle is **adapter-native**, not
label-driven. The port keeps an abstract `Status` enum
(`idea|needs_input|ready|plan_review|planned|building`, plus Done = closed); each
adapter maps it to the platform's real board column. **Priority stays a label**
(`priority:high|medium|low`) on every platform, and `needs-human` flags a
*launched* issue that hit a wall. `bootstrap` provisions the priority labels and,
on GitHub, the native status field's options.

## Lifecycle

Two symmetric draft → review → approve cycles — one for the **spec** (the *what*),
one for the **plan** (the *how*), each human-gated:

```
Idea → Needs Input → Ready → Plan Review → Planned → Building → Done(closed)
```

- **Idea** — captured; the agent drafts the spec.
- **Needs Input** — spec awaiting you; back-and-forth in comments (`/refine`).
  Approve → Ready, or `/rework` → Idea. The first human gate.
- **Ready** — spec approved; the agent is **writing the implementation plan**
  (parking slot).
- **Plan Review** — the plan awaits you; same back-and-forth. Approve → Planned,
  or `/rework` to redo the plan (back to Needs Input only if the spec is wrong).
  The second human gate.
- **Planned** — plan approved, queued. `/launch` → Building.
- **Building** — implementer launched, PR(s) in flight.
- **Done** — the issue is closed (the merge closes it).

## GitHub

The board column is the **built-in Projects v2 `Status` single-select field** —
single-select gives mutual exclusion for free and keeps the issue's labels free of
board noise. Because the *default* board view already groups by `Status`, the
columns are correct with **no view configuration**.

1. Provision the priority labels and set the `Status` field's options once
   (idempotent — updates the default `Todo/In Progress/Done` to the lifecycle):

   ```sh
   python -m issues bootstrap
   ```

2. Open the GitHub Project (v2). The default board already groups by `Status`, so
   the columns are `Idea → Needs Input → Ready → Plan Review → Planned → Building
   → Done`. `set-status <id> ready` (or `needs_input`, `plan_review`, `planned`,
   `building`, …) moves the issue's card; no label is touched. `close` moves it to
   Done and closes the issue.

Config (env, read by the GitHub adapter): `ISSUE_PROJECT_OWNER` (default
`Ishou`), `ISSUE_PROJECT_NUMBER` (default `4`), `ISSUE_STATUS_FIELD` (default
`Status`).

Drag-rank within a column is a visual cue only; it is not machine-read. Use the
`priority:*` labels for the rank that automation honors.

## GitLab (forward-looking)

Once a `GitLabTracker` (glab) adapter exists, the same abstract `Status` maps to
**scoped labels** `status::idea|needs_input|ready|plan_review|planned|building` —
GitLab boards treat
a scoped label family as mutually-exclusive columns, the native equivalent of
GitHub's single-select field. Run the same command once:

```sh
python -m issues bootstrap
```

Then create an Issue Board with one list per `status::*` scoped label; the Closed
list is Done. The `priority:*` labels provide the same in-column ranking.
