from __future__ import annotations

import json
from pathlib import Path

# HTML marker on the ledger comment's first line; identifies the single running spend-ledger comment.
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
    """Seed the ledger under MARKER when empty, or append `line` to existing."""
    if not existing:
        return f"{MARKER}\n{line}"
    return existing.rstrip() + "\n" + line


def main(argv: list[str] | None = None) -> int:
    """Thin CLI: `line <stage> [exec_file]` or `body <line>` (existing ledger via stdin)."""
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
