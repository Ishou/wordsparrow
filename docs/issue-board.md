# Issue board setup

The lifecycle is label-driven (ADR-0069): `status:idea|ready|building` are the
board columns (Done = closed issue), `priority:high|medium|low` rank issues
within a column, and `needs-human` flags escalation. Because the substrate is
plain labels, the same `bootstrap` output renders the same board on GitHub or
GitLab.

## GitHub

1. Create the workflow labels once:

   ```sh
   python -m issues bootstrap
   ```

2. Then either:
   - **(a) Issues list** — filter by `status:*` and sort by `priority:*`, or
   - **(b) GitHub Project (v2)** — add a board view whose columns are the
     `status:*` labels (label-backed). The Done column maps to Closed issues.

Drag-rank within a column is a visual cue only; it is not machine-read. Use the
`priority:*` labels for the rank that automation honors.

## GitLab (forward-looking)

Once a `GitLabTracker` (glab) adapter exists, run the same command once:

```sh
python -m issues bootstrap
```

Then create an Issue Board with one list per `status:*` label; the Closed list
is Done. The `priority:*` labels provide the same in-column ranking.
