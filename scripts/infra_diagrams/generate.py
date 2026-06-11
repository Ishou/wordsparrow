from __future__ import annotations

import argparse
import sys

from parse import (
    deploy_workflows,
    derive_apps,
    load_charts,
    terraform_resource_types,
)
from descriptor import CoherenceError, check_coherence, load_topology
from render import render_cloud, render_cluster, render_clue, render_flow
from readme import README_PATH, inject


def build_readme(text: str) -> str:
    charts = load_charts()
    apps = derive_apps(charts)
    topo = load_topology()
    check_coherence(
        topo, charts, terraform_resource_types(), deploy_workflows()
    )
    text = inject(text, "cluster", render_cluster(topo, apps))
    text = inject(text, "cloud", render_cloud(topo))
    text = inject(text, "flow", render_flow(topo))
    text = inject(text, "clue-pipeline", render_clue(topo))
    return text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate infra diagrams into README.md."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if README would change (CI drift gate)",
    )
    args = parser.parse_args(argv)

    original = README_PATH.read_text(encoding="utf-8")
    try:
        updated = build_readme(original)
    except CoherenceError as exc:
        print(f"coherence error: {exc}", file=sys.stderr)
        return 2

    if args.check:
        if updated != original:
            print(
                "README infra diagrams are stale — run `make diagrams`.",
                file=sys.stderr,
            )
            return 1
        print("README infra diagrams up to date.")
        return 0

    README_PATH.write_text(updated, encoding="utf-8")
    print("README infra diagrams regenerated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
