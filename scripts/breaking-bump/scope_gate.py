"""Post-D diff scope gate (ADR-0068 hardening): bound Agent D's diff to the approved plan + block sensitive paths."""
from __future__ import annotations

import json
import os
import re
import sys

# Paths an automated dependency migration must never touch — a structural backstop
# independent of whether any agent recognised the change as malicious.
_SENSITIVE = [
    re.compile(r"(^|/)\.github/workflows/"),
    re.compile(r"(^|/)\.env(\.|$)"),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"credential", re.IGNORECASE),
    re.compile(r"htpasswd", re.IGNORECASE),
]
_PATH_TOKEN = re.compile(r"[A-Za-z0-9_./-]+\.[A-Za-z0-9]+")


def is_sensitive(path: str) -> bool:
    return any(p.search(path) for p in _SENSITIVE)


def referenced_paths(plan: dict) -> set[str]:
    """File/path tokens named in the approved plan's (a)+(b) items."""
    text = " ".join((plan.get("a") or []) + (plan.get("b") or []))
    # Strip a trailing `:line` suffix from tokens like `otelTracer.ts:219`.
    return {t.split(":", 1)[0] for t in _PATH_TOKEN.findall(text)}


def _in_scope(path: str, tokens: set[str]) -> bool:
    base = os.path.basename(path)
    return any(
        path == t
        or path.endswith("/" + t)
        or ("/" not in t and base == t)
        for t in tokens
    )


def evaluate(changed: list[str], plan: dict) -> dict:
    """Classify each changed file; gate fails on any sensitive or out-of-plan path."""
    tokens = referenced_paths(plan)
    sensitive = [f for f in changed if is_sensitive(f)]
    out_of_scope = [f for f in changed if f not in sensitive and not _in_scope(f, tokens)]
    return {"sensitive": sensitive, "out_of_scope": out_of_scope, "ok": not sensitive and not out_of_scope}


def main() -> int:
    """CLI: --plan <plan.json>; changed files on stdin (one per line). Exit 1 on violation."""
    plan_path = sys.argv[sys.argv.index("--plan") + 1] if "--plan" in sys.argv else None
    plan = json.loads(open(plan_path).read()) if plan_path else {}
    changed = [ln.strip() for ln in sys.stdin if ln.strip()]
    result = evaluate(changed, plan)
    if result["ok"]:
        print("scope-gate: OK — all changes are in-plan and non-sensitive")
        return 0
    for f in result["sensitive"]:
        print(f"::error::scope-gate: Agent D's diff touches a SENSITIVE path: {f}")
    for f in result["out_of_scope"]:
        print(f"::error::scope-gate: Agent D's diff touches an OUT-OF-PLAN path: {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
