"""CLI glue: classify a bump and assemble the JSON context bundle for the agent.

Subcommands:
  classify  --path --old --new            -> {"mode","name","old","new"}
  bundle    --bump --registry [--values-old --values-new --overrides ...]
                                           -> full context bundle JSON

helm/git stay in the workflow shell; this module only transforms text/JSON.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

import classify as _classify
import registry as _registry
import valuesdiff as _vd


def build_bundle(bump, source, values_changes):
    """Assemble the bundle dict the enrich agent consumes."""
    url = _registry.render_url(source.release_notes, bump.new) if source else None
    return {
        "mode": bump.mode,
        "name": bump.name,
        "old": bump.old,
        "new": bump.new,
        "releaseNotesUrl": url,
        "extraDocs": source.extra_docs if source else None,
        "sourceMissing": source is None,
        "valuesDiff": [
            {"path": c.path, "kind": c.kind, "old": c.old, "new": c.new, "overridden": c.overridden}
            for c in (values_changes or [])
        ],
    }


def _cmd_classify(args) -> int:
    old = Path(args.old).read_text(encoding="utf-8")
    new = Path(args.new).read_text(encoding="utf-8")
    bumps = _classify.classify(args.path, old, new)
    if len(bumps) != 1:
        print(f"::warning::expected 1 bump, found {len(bumps)} in {args.path}", file=sys.stderr)
    print(json.dumps([b.__dict__ for b in bumps]))
    return 0


def _cmd_bundle(args) -> int:
    raw = json.loads(Path(args.bump).read_text(encoding="utf-8"))
    bump = _classify.Bump(**raw)
    reg = _registry.load_registry(args.registry)
    source = _registry.lookup(reg, bump.mode, bump.name)
    changes = []
    if args.values_old and args.values_new:
        old = yaml.safe_load(Path(args.values_old).read_text(encoding="utf-8"))
        new = yaml.safe_load(Path(args.values_new).read_text(encoding="utf-8"))
        overrides = [yaml.safe_load(Path(p).read_text(encoding="utf-8")) for p in (args.overrides or [])]
        changes = _vd.mark_overrides(_vd.diff_values(old, new), overrides)
    print(json.dumps(build_bundle(bump, source, changes)))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="detect")
    sub = parser.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("classify")
    c.add_argument("--path", required=True)
    c.add_argument("--old", required=True)
    c.add_argument("--new", required=True)
    c.set_defaults(func=_cmd_classify)

    b = sub.add_parser("bundle")
    b.add_argument("--bump", required=True)
    b.add_argument("--registry", required=True)
    b.add_argument("--values-old")
    b.add_argument("--values-new")
    b.add_argument("--overrides", nargs="*")
    b.set_defaults(func=_cmd_bundle)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
