"""`python -m issues <verb>` — the single surface skills and CI call."""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import pathlib
import sys

from auditing import AuditingTracker
from github import GitHubTracker, _FIELD_OPTIONS
from models import Priority, Status
from proofs import run_all
from tracker import IssueTracker


# status lives in the native board field now; only priority is label-driven
_WORKFLOW_LABELS: tuple[tuple[str, str, str], ...] = (
    ("priority:high", "E11D21", "Triage: do next — clear value, bounded scope"),
    ("priority:medium", "FBCA04", "Triage: worth doing — schedule after high-priority work"),
    ("priority:low", "C5DEF5", "Triage: cosmetic/prospective — do opportunistically or close"),
)


def _default_tracker() -> IssueTracker:
    backend = os.environ.get("ISSUE_TRACKER", "github")
    if backend != "github":
        raise SystemExit(f"unknown ISSUE_TRACKER={backend!r} (only 'github' so far)")
    actor = os.environ.get("ISSUE_ACTOR", "claude-session")
    return AuditingTracker(GitHubTracker(), actor=actor)


def _body_arg(args) -> str:
    """Body text from exactly one of --body / --body-file."""
    if (args.body is None) == (args.body_file is None):
        raise SystemExit("provide exactly one of --body / --body-file")
    return pathlib.Path(args.body_file).read_text() if args.body_file else args.body


def _check_source(args, tracker, plan: bool) -> str:
    """Body to proof: a local --file (pre-post draft) or the posted content."""
    if args.file is None and args.id is None:
        raise SystemExit("provide either --file <path> or a positional issue id")
    if args.file is not None:
        return pathlib.Path(args.file).read_text()
    if plan:
        plans = [c.body for c in tracker.comments(args.id) if "Implementation plan" in c.body]
        if not plans:
            print("PROBLEM [missing] no 'Implementation plan' comment found", file=sys.stderr)
            raise SystemExit(1)
        return plans[-1]
    return tracker.get(args.id).body


def _proof_or_die(problems, what: str) -> None:
    for pr in problems:
        print(f"PROBLEM [{pr.kind}] {pr.detail}", file=sys.stderr)
    if problems:
        raise SystemExit(1)
    print(f"OK: {what} passes all proofs")


def _emit(obj) -> None:
    def conv(o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        raise TypeError
    print(json.dumps(obj, default=conv, indent=2))


def main(argv: list[str], tracker: IssueTracker | None = None) -> None:
    t = tracker or _default_tracker()
    p = argparse.ArgumentParser(prog="issues")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create"); c.add_argument("--title", required=True)
    c.add_argument("--body", default=""); c.add_argument("--label", action="append", default=[])
    g = sub.add_parser("get"); g.add_argument("id", type=int)
    li = sub.add_parser("list"); li.add_argument("--label", action="append", default=[])
    li.add_argument("--state", default="open")
    li.add_argument("--status", choices=[s.name.lower() for s in Status], default=None)
    ub = sub.add_parser("update-body"); ub.add_argument("id", type=int)
    ub.add_argument("--body"); ub.add_argument("--body-file")
    cm = sub.add_parser("comment"); cm.add_argument("id", type=int)
    cm.add_argument("--body"); cm.add_argument("--body-file")
    cs = sub.add_parser("comments"); cs.add_argument("id", type=int)
    ck = sub.add_parser("check"); ck.add_argument("id", type=int, nargs="?"); ck.add_argument("--file")
    ckp = sub.add_parser("check-plan"); ckp.add_argument("id", type=int, nargs="?"); ckp.add_argument("--file")
    ss = sub.add_parser("set-status"); ss.add_argument("id", type=int); ss.add_argument("status", choices=[s.name.lower() for s in Status])
    sp = sub.add_parser("set-priority"); sp.add_argument("id", type=int); sp.add_argument("priority", choices=[p.name.lower() for p in Priority])
    al = sub.add_parser("add-label"); al.add_argument("id", type=int); al.add_argument("label")
    rl = sub.add_parser("remove-label"); rl.add_argument("id", type=int); rl.add_argument("label")
    cl = sub.add_parser("close"); cl.add_argument("id", type=int); cl.add_argument("--reason", default="completed")
    sub.add_parser("bootstrap")

    a = p.parse_args(argv)
    if a.cmd == "create": _emit(t.create(a.title, a.body, tuple(a.label)))
    elif a.cmd == "get": _emit(t.get(a.id))
    elif a.cmd == "list": _emit(t.list(tuple(a.label), a.state, Status[a.status.upper()] if a.status else None))
    elif a.cmd == "update-body": t.update_body(a.id, _body_arg(a))
    elif a.cmd == "comment": t.comment(a.id, _body_arg(a))
    elif a.cmd == "comments": _emit(t.comments(a.id))
    elif a.cmd == "check":
        _proof_or_die(run_all(_check_source(a, t, plan=False)), "spec")
    elif a.cmd == "check-plan":
        _proof_or_die(run_all(_check_source(a, t, plan=True)), "plan")
    elif a.cmd == "set-status": t.set_status(a.id, Status[a.status.upper()])
    elif a.cmd == "set-priority": t.set_priority(a.id, Priority[a.priority.upper()])
    elif a.cmd == "add-label": t.add_label(a.id, a.label)
    elif a.cmd == "remove-label": t.remove_label(a.id, a.label)
    elif a.cmd == "close": t.close(a.id, a.reason)
    elif a.cmd == "bootstrap":
        for name, color, desc in _WORKFLOW_LABELS:
            t.ensure_label(name, color, desc)
        t.ensure_status_field(_FIELD_OPTIONS)
        print(json.dumps({
            "ensured_labels": [name for name, _, _ in _WORKFLOW_LABELS],
            "status_field": list(_FIELD_OPTIONS),
        }))


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv[1:])
