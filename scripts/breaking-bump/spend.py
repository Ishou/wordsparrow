"""Render a per-stage cost (USD) line and maintain a running spend-ledger body.

Spec #13: spend observability, not a hard budget — log per-stage, surface
per-bump cost on the spine issue. The pipeline keeps ONE marker-tagged ledger
comment and each stage appends its line to it (the jobs run sequentially, so the
in-place edit has no lost-update race). claude-code-action@v1 exposes no direct
token/cost step output; instead it writes an execution_file (a JSON array
execution log) whose single type=="result" entry carries total_cost_usd (a USD
float). A STUB run produces no execution_file, so a missing/unparseable path must
degrade to 'cost unavailable' rather than crash the workflow step.

This module is pure (no gh/network I/O): format_spend renders one line,
upsert_body builds the ledger body, and the CLI is a thin shell entrypoint so the
workflow does only the gh I/O — all content flows via stdin/argv, never shell
interpolation.
"""
from __future__ import annotations

import json
from pathlib import Path

# Hidden HTML marker on the ledger comment's first line; used to find the single
# running spend-ledger comment on the spine issue (so each stage edits it in place).
MARKER = "<!-- breaking-bump-spend-ledger -->"


def _result_cost_usd(execution_file: str | None) -> float | None:
    """Read total_cost_usd from the execution log's type=='result' entry; None if absent."""
    if not execution_file:
        return None
    try:
        entries = json.loads(Path(execution_file).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(entries, list):
        return None
    for entry in entries:
        if isinstance(entry, dict) and entry.get("type") == "result":
            cost = entry.get("total_cost_usd")
            if isinstance(cost, (int, float)):
                return float(cost)
    return None


def format_spend(stage: str, execution_file: str | None) -> str:
    """One-line cost summary for `stage`; 'cost unavailable' when no cost can be read."""
    cost = _result_cost_usd(execution_file)
    if cost is None:
        return f"breaking-bump spend · {stage}: cost unavailable"
    return f"breaking-bump spend · {stage}: ${cost:.4f}"


def upsert_body(existing: str | None, line: str) -> str:
    """Build the running ledger body: seed it under MARKER, or append `line`.

    Pure string function — no I/O. If `existing` is empty/None there is no ledger
    yet, so seed `MARKER` + the first line; otherwise append `line` under the
    existing ledger (the marker stays exactly once at the top).
    """
    if not existing:
        return f"{MARKER}\n{line}"
    return existing.rstrip() + "\n" + line


def main(argv: list[str] | None = None) -> int:
    """Thin CLI the workflow shells to (so the workflow does only gh I/O).

    `spend.py line <stage> [execution_file]` -> print format_spend(stage, execution_file).
    `spend.py body <line>`                   -> print upsert_body(<existing from stdin>, line).
    """
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        print("usage: spend.py {line <stage> [execution_file] | body <line>}", file=sys.stderr)
        return 2
    cmd, rest = args[0], args[1:]
    if cmd == "line":
        stage = rest[0] if rest else "unknown"
        execution_file = rest[1] if len(rest) > 1 and rest[1] else None
        print(format_spend(stage, execution_file))
        return 0
    if cmd == "body":
        line = rest[0] if rest else ""
        existing = sys.stdin.read()
        print(upsert_body(existing if existing.strip() else None, line))
        return 0
    print(f"unknown command: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
