# Helm Bump Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich Renovate's internal-tool bump PRs with version deltas, migration notes synthesized from official release docs, and (for subcharts) an upstream `values.yaml` diff flagged against the repo's overrides — so the maintainer reviews and merges with full context. Deploy stays manual.

**Architecture:** A GitHub Actions workflow runs a deterministic Python `detect` step (pure functions over fixtures — classify the bump, diff upstream default values, cross-reference overrides, look up the release-notes source) then a scoped `claude-code-action` `enrich` step that web-fetches the real release notes and splices one Markdown block into the PR body between idempotent markers. `helm`/`git` stay in workflow shell; the Python is pure and unit-tested. Two enrichment modes share the core: Mode A (subchart deps, with values diff) and Mode B (image tags in `values.yaml`, app release notes, no values diff). Ships as two PRs.

**Tech Stack:** Python 3.11 + pytest + PyYAML for the deterministic core (matches `scripts/**/test_*.py` convention); GitHub Actions + `anthropics/claude-code-action@v1` (reusing `CLAUDE_CODE_OAUTH_TOKEN`); Renovate (`renovate.json`); Helm CLI.

---

## Reference spec

`docs/superpowers/specs/2026-06-11-helm-bump-enrich-design.md`. Read it before starting — this plan implements it.

## Local prerequisite

Commands below invoke `python` (CI's `setup-python` provides it). On macOS the binary is `python3` — alias it or run the test commands as `python3 -m pytest ...`. First: `pip install -r scripts/helm-enrich/requirements.txt` (PyYAML + pytest). The deterministic core was verified end-to-end (16 tests pass) while writing this plan.

## ADR pre-read (do this first, once)

This plan touches `.github/workflows/`, `infra/`, `renovate.json`, `scripts/`, and adds an ADR. Run:

```bash
scripts/adr-context.sh .github/workflows/helm-bump-enrich.yml infra/observability/Chart.yaml infra/platform/Chart.yaml renovate.json
```

Read every ADR it emits in full before writing code (per CLAUDE.md). Landmarks: ADR-0009 (k3s deploy / charts), ADR-0001 (workflow, 400-line cap, §6a), ADR-0027/0028 (observability), ADR-0058 (data licence — not triggered here but be aware).

## File structure (locked decisions)

Mode A (PR 1):
- Create `scripts/helm-enrich/classify.py` — parse the single bumped unit from old/new file text. One responsibility: bump extraction.
- Create `scripts/helm-enrich/valuesdiff.py` — flatten + leaf-diff two values trees, mark overridden keys. One responsibility: the values diff.
- Create `scripts/helm-enrich/registry.py` — load `tools-upgrade-sources.yaml`, look up a source, render the `{version}` URL.
- Create `scripts/helm-enrich/detect.py` — argparse CLI gluing the three modules into JSON output. No business logic of its own.
- Create `scripts/helm-enrich/requirements.txt` — `pyyaml`, `pytest`.
- Create `scripts/helm-enrich/test_classify.py`, `test_valuesdiff.py`, `test_registry.py`.
- Create `infra/tools-upgrade-sources.yaml` — Mode A entries.
- Create `.github/workflows/helm-bump-enrich.yml` — `detect` + `enrich` jobs (Chart.yaml trigger).
- Create `.github/workflows/helm-bump-enrich-sweep.yml` — daily cron safety net.
- Create `.github/workflows/helm-enrich-tests.yml` — pytest CI for the core.
- Modify `renovate.json` — remove the `helm subcharts` group.
- Create `docs/adr/0066-internal-tool-upgrade-enrichment.md`; modify `docs/adr/INDEX.md`.

Mode B (PR 2):
- Modify `scripts/helm-enrich/classify.py` — add `parse_image_bump`.
- Modify `scripts/helm-enrich/detect.py` — Mode B branch.
- Modify `scripts/helm-enrich/test_classify.py` — image-bump cases.
- Modify `infra/tools-upgrade-sources.yaml` — Mode B image entries.
- Modify `.github/workflows/helm-bump-enrich.yml` — add `values*.yaml` trigger path.
- Modify `renovate.json` — add `customManagers` for image tags.
- Modify `docs/adr/0066-...md` — note Mode B is now live (status update).

---

> The tasks follow in subsequent sections. Each task is bite-sized (one action, 2–5 min) with complete code, exact commands, expected output, and a commit. Do not batch commits.

# PR 1 — Mode A (subchart enrichment)

### Task 1: `classify.py` — chart bump parsing

**Files:**
- Create: `scripts/helm-enrich/classify.py`
- Test: `scripts/helm-enrich/test_classify.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/helm-enrich/test_classify.py`:

```python
"""Unit tests for classify — bump extraction from old/new file text."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import classify  # noqa: E402

CHART_OLD = """\
apiVersion: v2
name: observability
dependencies:
  - name: signoz
    version: "0.122.0"
    repository: "https://charts.signoz.io"
  - name: k8s-infra
    version: "0.15.1"
    repository: "https://charts.signoz.io"
"""

CHART_NEW = CHART_OLD.replace('version: "0.122.0"', 'version: "0.128.0"')


def test_parse_chart_bump_finds_single_changed_dep():
    bumps = classify.classify("infra/observability/Chart.yaml", CHART_OLD, CHART_NEW)
    assert bumps == [classify.Bump(mode="A", name="signoz", old="0.122.0", new="0.128.0")]


def test_parse_chart_bump_no_change_returns_empty():
    bumps = classify.classify("infra/observability/Chart.yaml", CHART_OLD, CHART_OLD)
    assert bumps == []


def test_mode_for_path():
    assert classify.mode_for_path("infra/platform/Chart.yaml") == "A"
    assert classify.mode_for_path("infra/matomo/values.yaml") == "B"
    assert classify.mode_for_path("infra/nats/values-prod.yaml") == "B"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/helm-enrich && python -m pytest test_classify.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'classify'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/helm-enrich/classify.py`:

```python
"""Classify a Renovate PR's bump and parse the single (name, old, new).

Mode A = a subchart dependency version changed in a Chart.yaml.
Mode B = a container image tag changed in a values.yaml (added in PR 2).

Pure functions over file text; no git/helm/network here so they stay
unit-testable against fixtures.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

import yaml

_VERSION_RE = re.compile(r"^v?(?P<ver>\d+(?:\.\d+){0,2})(?P<suffix>-.+)?$")


@dataclass(frozen=True)
class Bump:
    mode: str  # "A" (subchart dep) or "B" (image tag)
    name: str  # chart dependency name, or image repository
    old: str   # old version, suffix stripped
    new: str   # new version, suffix stripped


def strip_suffix(tag: str) -> str:
    """`5.2.1-apache` -> `5.2.1`, `v0.128.0` -> `0.128.0`, `2.10-alpine` -> `2.10`."""
    cleaned = tag.strip().strip('"').strip("'")
    m = _VERSION_RE.match(cleaned)
    return m.group("ver") if m else cleaned


def mode_for_path(path: str) -> str:
    """Chart.yaml -> Mode A; any values*.yaml -> Mode B."""
    return "A" if os.path.basename(path) == "Chart.yaml" else "B"


def parse_chart_bump(old: dict, new: dict) -> list[Bump]:
    """Compare two parsed Chart.yaml docs; emit a Bump per changed dependency version."""
    old_versions = {d["name"]: str(d["version"]) for d in (old or {}).get("dependencies", [])}
    bumps: list[Bump] = []
    for dep in (new or {}).get("dependencies", []):
        name = dep["name"]
        new_v = str(dep["version"])
        old_v = old_versions.get(name)
        if old_v is not None and old_v != new_v:
            bumps.append(Bump(mode="A", name=name, old=strip_suffix(old_v), new=strip_suffix(new_v)))
    return bumps


def classify(path: str, old_text: str, new_text: str) -> list[Bump]:
    """Dispatch on path; return the bumped units (expected: exactly one)."""
    mode = mode_for_path(path)
    if mode == "A":
        return parse_chart_bump(yaml.safe_load(old_text), yaml.safe_load(new_text))
    raise NotImplementedError("Mode B (image bump) is added in PR 2")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/helm-enrich && python -m pytest test_classify.py -v`
Expected: PASS (3 passed). If `yaml` is missing: `pip install pyyaml` first.

- [ ] **Step 5: Commit**

```bash
git add scripts/helm-enrich/classify.py scripts/helm-enrich/test_classify.py
git commit -s -m "feat(infra): add helm-enrich chart bump classifier"
```

### Task 2: `valuesdiff.py` — key-path diff + override cross-reference

**Files:**
- Create: `scripts/helm-enrich/valuesdiff.py`
- Test: `scripts/helm-enrich/test_valuesdiff.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/helm-enrich/test_valuesdiff.py`:

```python
"""Unit tests for valuesdiff — leaf diff + override cross-reference."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import valuesdiff as vd  # noqa: E402

OLD = {"clickhouse": {"replicas": 1, "image": "old"}, "removedKey": True}
NEW = {"clickhouse": {"replicas": 2, "image": "old"}, "addedKey": "x"}


def test_flatten_dots_nested_keys():
    assert vd.flatten({"a": {"b": 1}}) == {"a.b": 1}


def test_diff_values_reports_added_removed_changed():
    changes = {(c.path, c.kind) for c in vd.diff_values(OLD, NEW)}
    assert changes == {
        ("clickhouse.replicas", "changed"),
        ("removedKey", "removed"),
        ("addedKey", "added"),
    }


def test_diff_values_ignores_unchanged_leaf():
    paths = {c.path for c in vd.diff_values(OLD, NEW)}
    assert "clickhouse.image" not in paths


def test_mark_overrides_flags_repo_pinned_keys():
    changes = vd.diff_values(OLD, NEW)
    overrides = [{"clickhouse": {"replicas": 1}}]  # repo pins clickhouse.replicas
    marked = {c.path: c.overridden for c in vd.mark_overrides(changes, overrides)}
    assert marked["clickhouse.replicas"] is True
    assert marked["addedKey"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/helm-enrich && python -m pytest test_valuesdiff.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'valuesdiff'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/helm-enrich/valuesdiff.py`:

```python
"""Key-path-aware diff of two Helm default-values trees, with override flags.

Leaves are non-dict values (lists compared whole). Paths are dotted.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_MISSING = object()


@dataclass(frozen=True)
class KeyChange:
    path: str
    kind: str  # "added" | "removed" | "changed"
    old: Any
    new: Any
    overridden: bool = False


def flatten(tree: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten a dict to {dotted.path: leaf}. Non-dicts (incl. lists) are leaves."""
    if not isinstance(tree, dict):
        return {prefix: tree}
    out: dict[str, Any] = {}
    for key, value in tree.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        out.update(flatten(value, path))
    return out


def diff_values(old: dict, new: dict) -> list[KeyChange]:
    """Emit one KeyChange per added/removed/changed leaf. Overridden defaults False."""
    old_flat = flatten(old or {})
    new_flat = flatten(new or {})
    changes: list[KeyChange] = []
    for path in sorted(set(old_flat) | set(new_flat)):
        ov = old_flat.get(path, _MISSING)
        nv = new_flat.get(path, _MISSING)
        if ov is _MISSING:
            changes.append(KeyChange(path, "added", None, nv))
        elif nv is _MISSING:
            changes.append(KeyChange(path, "removed", ov, None))
        elif ov != nv:
            changes.append(KeyChange(path, "changed", ov, nv))
    return changes


def mark_overrides(changes: list[KeyChange], override_docs: list[dict]) -> list[KeyChange]:
    """Set overridden=True for any change whose path is pinned in an override doc."""
    pinned: set[str] = set()
    for doc in override_docs:
        pinned |= set(flatten(doc or {}))
    return [
        KeyChange(c.path, c.kind, c.old, c.new, overridden=c.path in pinned)
        for c in changes
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/helm-enrich && python -m pytest test_valuesdiff.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/helm-enrich/valuesdiff.py scripts/helm-enrich/test_valuesdiff.py
git commit -s -m "feat(infra): add helm-enrich values diff + override cross-ref"
```

### Task 3: `registry.py` — source lookup + URL templating

**Files:**
- Create: `scripts/helm-enrich/registry.py`
- Test: `scripts/helm-enrich/test_registry.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/helm-enrich/test_registry.py`:

```python
"""Unit tests for registry — load, lookup, render."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import registry  # noqa: E402

REG_YAML = """\
modeA:
  - name: signoz
    repo: "https://charts.signoz.io"
    releaseNotes: "https://github.com/SigNoz/charts/releases/tag/v{version}"
    extraDocs: "https://signoz.io/docs/operate/"
modeB:
  - image: matomo
    releaseNotes: "https://matomo.org/changelog/"
    priority: high
"""


def _reg(tmp_path: Path) -> dict:
    p = tmp_path / "sources.yaml"
    p.write_text(REG_YAML, encoding="utf-8")
    return registry.load_registry(p)


def test_lookup_mode_a_by_name(tmp_path):
    src = registry.lookup(_reg(tmp_path), "A", "signoz")
    assert src.release_notes == "https://github.com/SigNoz/charts/releases/tag/v{version}"


def test_lookup_mode_b_by_image(tmp_path):
    src = registry.lookup(_reg(tmp_path), "B", "matomo")
    assert src.priority == "high"


def test_lookup_missing_returns_none(tmp_path):
    assert registry.lookup(_reg(tmp_path), "A", "nope") is None


def test_render_url_substitutes_version():
    pattern = "https://github.com/SigNoz/charts/releases/tag/v{version}"
    assert registry.render_url(pattern, "0.128.0") == "https://github.com/SigNoz/charts/releases/tag/v0.128.0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/helm-enrich && python -m pytest test_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'registry'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/helm-enrich/registry.py`:

```python
"""Load and query the upstream-source registry (infra/tools-upgrade-sources.yaml)."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Source:
    name: str
    release_notes: str
    extra_docs: str | None = None
    priority: str | None = None


def load_registry(path: str | Path) -> dict[str, dict[str, Source]]:
    """Return {"A": {name: Source}, "B": {image: Source}}."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    out: dict[str, dict[str, Source]] = {"A": {}, "B": {}}
    for entry in data.get("modeA", []) or []:
        out["A"][entry["name"]] = Source(
            name=entry["name"],
            release_notes=entry["releaseNotes"],
            extra_docs=entry.get("extraDocs"),
            priority=entry.get("priority"),
        )
    for entry in data.get("modeB", []) or []:
        out["B"][entry["image"]] = Source(
            name=entry["image"],
            release_notes=entry["releaseNotes"],
            extra_docs=entry.get("extraDocs"),
            priority=entry.get("priority"),
        )
    return out


def lookup(reg: dict[str, dict[str, Source]], mode: str, name: str) -> Source | None:
    return reg.get(mode, {}).get(name)


def render_url(pattern: str, version: str) -> str:
    return pattern.replace("{version}", version)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/helm-enrich && python -m pytest test_registry.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/helm-enrich/registry.py scripts/helm-enrich/test_registry.py
git commit -s -m "feat(infra): add helm-enrich source registry loader"
```

### Task 4: `detect.py` — CLI glue producing the JSON bundle

**Files:**
- Create: `scripts/helm-enrich/detect.py`
- Test: `scripts/helm-enrich/test_detect.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/helm-enrich/test_detect.py`:

```python
"""Unit tests for detect.build_bundle — the assembled context bundle."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import detect  # noqa: E402
from classify import Bump  # noqa: E402
from registry import Source  # noqa: E402
from valuesdiff import KeyChange  # noqa: E402


def test_build_bundle_mode_a_includes_url_and_diff():
    bump = Bump(mode="A", name="signoz", old="0.122.0", new="0.128.0")
    src = Source(name="signoz", release_notes="https://x/releases/tag/v{version}", extra_docs="https://docs")
    changes = [KeyChange("clickhouse.replicas", "changed", 1, 2, overridden=True)]
    bundle = detect.build_bundle(bump, src, changes)
    assert bundle["mode"] == "A"
    assert bundle["name"] == "signoz"
    assert bundle["releaseNotesUrl"] == "https://x/releases/tag/v0.128.0"
    assert bundle["extraDocs"] == "https://docs"
    assert bundle["sourceMissing"] is False
    assert bundle["valuesDiff"] == [
        {"path": "clickhouse.replicas", "kind": "changed", "old": 1, "new": 2, "overridden": True}
    ]


def test_build_bundle_missing_source_flags_it():
    bump = Bump(mode="A", name="orphan", old="1.0.0", new="1.1.0")
    bundle = detect.build_bundle(bump, None, [])
    assert bundle["sourceMissing"] is True
    assert bundle["releaseNotesUrl"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/helm-enrich && python -m pytest test_detect.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'detect'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/helm-enrich/detect.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/helm-enrich && python -m pytest test_detect.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Run the whole suite once**

Run: `cd scripts/helm-enrich && python -m pytest -v`
Expected: PASS (13 passed: 3 classify + 4 valuesdiff + 4 registry + 2 detect).

- [ ] **Step 6: Commit**

```bash
git add scripts/helm-enrich/detect.py scripts/helm-enrich/test_detect.py
git commit -s -m "feat(infra): add helm-enrich detect CLI"
```

### Task 5: registry data file + requirements

**Files:**
- Create: `infra/tools-upgrade-sources.yaml`
- Create: `scripts/helm-enrich/requirements.txt`

- [ ] **Step 1: Create the requirements file**

Create `scripts/helm-enrich/requirements.txt`:

```
pyyaml>=6.0
pytest>=8.0
```

- [ ] **Step 2: Create the Mode-A registry (verified 2026-06-11)**

Create `infra/tools-upgrade-sources.yaml`:

```yaml
# Upstream release-notes sources for the helm-bump enrichment workflow
# (.github/workflows/helm-bump-enrich.yml). {version} = the new chart or
# image version. Registry coherence: adding a subchart dependency or a
# pinned image means adding its entry here in the same PR (ADR-0066).
modeA:
  - name: signoz
    repo: "https://charts.signoz.io"
    releaseNotes: "https://github.com/SigNoz/charts/releases/tag/v{version}"
    extraDocs: "https://signoz.io/docs/operate/migration/"
  - name: k8s-infra
    repo: "https://charts.signoz.io"
    releaseNotes: "https://github.com/SigNoz/charts/releases"
  - name: cert-manager
    repo: "https://charts.jetstack.io"
    releaseNotes: "https://github.com/cert-manager/cert-manager/releases/tag/v{version}"
    extraDocs: "https://cert-manager.io/docs/installation/upgrade/"
  - name: ingress-nginx
    repo: "https://kubernetes.github.io/ingress-nginx"
    releaseNotes: "https://github.com/kubernetes/ingress-nginx/releases/tag/helm-chart-{version}"
  - name: external-dns
    repo: "https://kubernetes-sigs.github.io/external-dns/"
    releaseNotes: "https://github.com/kubernetes-sigs/external-dns/releases/tag/external-dns-helm-chart-{version}"
  - name: cloudnative-pg
    repo: "https://cloudnative-pg.github.io/charts"
    releaseNotes: "https://github.com/cloudnative-pg/charts/releases"
    extraDocs: "https://github.com/cloudnative-pg/cloudnative-pg/releases"
  - name: hcloud-csi
    repo: "https://charts.hetzner.cloud"
    releaseNotes: "https://github.com/hetznercloud/csi-driver/blob/main/CHANGELOG.md"
modeB: []
```

- [ ] **Step 3: Validate it loads**

Run: `cd scripts/helm-enrich && python -c "import registry; r=registry.load_registry('../../infra/tools-upgrade-sources.yaml'); print(sorted(r['A']))"`
Expected: `['cert-manager', 'cloudnative-pg', 'external-dns', 'hcloud-csi', 'ingress-nginx', 'k8s-infra', 'signoz']`

- [ ] **Step 4: Commit**

```bash
git add infra/tools-upgrade-sources.yaml scripts/helm-enrich/requirements.txt
git commit -s -m "feat(infra): add upstream-source registry for helm enrichment"
```

### Task 6: CI job to run the Python core tests

There is no existing Python CI in this repo, so the core's tests would never run in CI without this. Small, focused workflow gated on the script path.

**Files:**
- Create: `.github/workflows/helm-enrich-tests.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/helm-enrich-tests.yml`:

```yaml
name: helm-enrich-tests

on:
  pull_request:
    paths:
      - 'scripts/helm-enrich/**'
      - '.github/workflows/helm-enrich-tests.yml'

permissions:
  contents: read

jobs:
  pytest:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install deps
        run: pip install -r scripts/helm-enrich/requirements.txt
      - name: Run tests
        run: cd scripts/helm-enrich && python -m pytest -v
```

- [ ] **Step 2: Validate YAML locally (if actionlint available)**

Run: `actionlint .github/workflows/helm-enrich-tests.yml || echo "actionlint not installed — review by eye"`
Expected: no errors (or the skip message).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/helm-enrich-tests.yml
git commit -s -m "ci(infra): run helm-enrich python tests on PRs"
```

### Task 7: the enrichment workflow (`detect` + `enrich`)

**Files:**
- Create: `.github/workflows/helm-bump-enrich.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/helm-bump-enrich.yml`:

```yaml
name: helm-bump-enrich

# Enriches Renovate's internal-tool bump PRs (advisory; never a required
# check). Mode A: subchart deps in infra/**/Chart.yaml. Mode B (PR 2) adds
# image tags in values.yaml. Deploy stays manual (ADR-0066).

on:
  pull_request:
    types: [opened, reopened]
    paths:
      - 'infra/**/Chart.yaml'
  workflow_dispatch:
    inputs:
      pr:
        description: 'PR number to enrich'
        required: true

concurrency:
  group: helm-bump-enrich-pr-${{ github.event.pull_request.number || github.event.inputs.pr }}
  cancel-in-progress: false

permissions:
  contents: read
  pull-requests: write
  id-token: write

jobs:
  detect:
    # Only Renovate-authored PRs (head ref starts with renovate/).
    if: >-
      github.event_name == 'workflow_dispatch' ||
      startsWith(github.event.pull_request.head.ref, 'renovate/')
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR: ${{ github.event.pull_request.number || github.event.inputs.pr }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 0

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r scripts/helm-enrich/requirements.txt

      - uses: azure/setup-helm@1a275c3b69536ee54be43f2070a358922e12c8d4 # v4.3.1
        with:
          version: v3.16.3

      - name: Resolve PR refs
        id: refs
        run: |
          set -euo pipefail
          BASE_SHA=$(gh pr view "$PR" --json baseRefOid --jq .baseRefOid)
          HEAD_SHA=$(gh pr view "$PR" --json headRefOid --jq .headRefOid)
          echo "base=$BASE_SHA" >> "$GITHUB_OUTPUT"
          echo "head=$HEAD_SHA" >> "$GITHUB_OUTPUT"

      - name: Find bumped Chart.yaml + build bundle
        id: bundle
        run: |
          set -euo pipefail
          BASE=${{ steps.refs.outputs.base }}
          HEAD=${{ steps.refs.outputs.head }}
          REG=infra/tools-upgrade-sources.yaml
          FILE=$(git diff --name-only "$BASE" "$HEAD" -- 'infra/**/Chart.yaml' | head -n1)
          if [ -z "${FILE:-}" ]; then
            echo "::notice::no Chart.yaml change; nothing to enrich"
            echo "skip=true" >> "$GITHUB_OUTPUT"; exit 0
          fi
          git show "$BASE:$FILE" > /tmp/old.yaml
          git show "$HEAD:$FILE" > /tmp/new.yaml
          python scripts/helm-enrich/detect.py classify \
            --path "$FILE" --old /tmp/old.yaml --new /tmp/new.yaml > /tmp/bumps.json
          COUNT=$(jq 'length' /tmp/bumps.json)
          if [ "$COUNT" != "1" ]; then
            echo "::warning::expected 1 bump, got $COUNT; skipping"
            echo "skip=true" >> "$GITHUB_OUTPUT"; exit 0
          fi
          jq -c '.[0]' /tmp/bumps.json > /tmp/bump.json
          NAME=$(jq -r '.name' /tmp/bump.json)
          OLD=$(jq -r '.old' /tmp/bump.json)
          NEW=$(jq -r '.new' /tmp/bump.json)
          CHART_DIR=$(dirname "$FILE")
          # Values passed as argv (never interpolated into the code string) to avoid injection.
          REPO=$(python -c 'import sys,yaml; d=yaml.safe_load(open(sys.argv[1])); print(next(x["repository"] for x in d["dependencies"] if x["name"]==sys.argv[2]))' "$FILE" "$NAME")
          helm repo add up "$REPO" >/dev/null 2>&1 || helm repo add up "$REPO"
          helm repo update up >/dev/null
          helm show values "up/$NAME" --version "$OLD" > /tmp/vold.yaml || : > /tmp/vold.yaml
          helm show values "up/$NAME" --version "$NEW" > /tmp/vnew.yaml || : > /tmp/vnew.yaml
          OVERRIDES=$(ls "$CHART_DIR"/values*.yaml 2>/dev/null | tr '\n' ' ')
          python scripts/helm-enrich/detect.py bundle \
            --bump /tmp/bump.json --registry "$REG" \
            --values-old /tmp/vold.yaml --values-new /tmp/vnew.yaml \
            --overrides $OVERRIDES > bundle.json
          echo "skip=false" >> "$GITHUB_OUTPUT"
          cat bundle.json

      - name: Upload bundle
        if: steps.bundle.outputs.skip == 'false'
        uses: actions/upload-artifact@v4
        with:
          name: enrich-bundle
          path: bundle.json
          retention-days: 1

    outputs:
      skip: ${{ steps.bundle.outputs.skip }}
      pr: ${{ env.PR }}

  enrich:
    needs: detect
    if: needs.detect.outputs.skip == 'false'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUMBER: ${{ needs.detect.outputs.pr }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 1
      - uses: actions/download-artifact@v4
        with:
          name: enrich-bundle

      - name: Enrich the PR body
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: '--allowed-tools "Read,WebFetch,Bash(gh pr view:*),Bash(gh pr edit:*),Bash(cat:*),Bash(python:*)"'
          prompt: |
            You are enriching a Renovate dependency-bump PR. The deterministic
            context bundle is in ./bundle.json (read it first). The target PR
            number is in env var PR_NUMBER.

            Steps:
            1. Read ./bundle.json. Fields: mode, name, old, new,
               releaseNotesUrl, extraDocs, sourceMissing, valuesDiff (a list
               of {path,kind,old,new,overridden}).
            2. If releaseNotesUrl is set, WebFetch it (and extraDocs if present)
               and extract the migration-relevant changes between version `old`
               and `new`: breaking changes, required config/CRD/DB actions,
               deprecations. Do NOT invent notes — only report what the fetched
               pages state. If sourceMissing is true or the fetch fails, write
               "Release notes unavailable — review manually" and continue.
            3. Render ONE Markdown block, exactly between these markers:
                 <!-- helm-enrich:start -->
                 ## Upgrade context (automated, advisory)
                 **<name>: <old> -> <new>**
                 ### Migration notes
                 ...(bulleted; cite the source URL)...
                 ### Upstream default values changed
                 ...(a table from valuesDiff: path | kind | old -> new |
                    overridden. Put OVERRIDDEN rows first and bold them — these
                    are the keys the repo pins in values-prod.yaml and may need
                    reconciliation. Omit this section entirely if valuesDiff is
                    empty.)...
                 <!-- helm-enrich:end -->
            4. Get the current PR body: `gh pr view "$PR_NUMBER" --json body --jq .body > /tmp/body.md`
            5. Remove any existing block between the markers (idempotent), then
               append the fresh block. Write the result to /tmp/newbody.md.
            6. `gh pr edit "$PR_NUMBER" --body-file /tmp/newbody.md`

            Keep it concise. This is advisory context for a human reviewer.
```

- [ ] **Step 2: Lint**

Run: `actionlint .github/workflows/helm-bump-enrich.yml || echo "actionlint not installed — review by eye"`
Expected: no errors. Verify by eye: `if:` guards, `needs.detect.outputs`, marker block.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/helm-bump-enrich.yml
git commit -s -m "feat(infra): add helm-bump enrichment workflow (Mode A)"
```

### Task 8: cron safety-net sweep

Re-enriches open Renovate PRs that missed their `pull_request` event. Finds un-enriched PRs and dispatches the main workflow per PR.

**Files:**
- Create: `.github/workflows/helm-bump-enrich-sweep.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/helm-bump-enrich-sweep.yml`:

```yaml
name: helm-bump-enrich-sweep

# Daily safety net: dispatch helm-bump-enrich for any open Renovate infra
# PR that has no enrichment marker yet (e.g. its opened-event was missed).

on:
  schedule:
    - cron: '17 5 * * *'
  workflow_dispatch: {}

permissions:
  contents: read
  pull-requests: read
  actions: write  # to dispatch the enrich workflow

jobs:
  sweep:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 1
      - name: Dispatch enrichment for un-enriched renovate PRs
        run: |
          set -euo pipefail
          gh pr list --state open --search "head:renovate/" \
            --json number,body,files \
            --jq '.[] | select((.files[].path // "") | startswith("infra/"))
                       | select((.body // "") | contains("<!-- helm-enrich:start -->") | not)
                       | .number' \
            | sort -u \
            | while read -r n; do
                [ -n "$n" ] || continue
                echo "dispatching enrich for PR #$n"
                gh workflow run helm-bump-enrich.yml -f pr="$n"
              done
```

- [ ] **Step 2: Lint + commit**

Run: `actionlint .github/workflows/helm-bump-enrich-sweep.yml || echo "review by eye"`

```bash
git add .github/workflows/helm-bump-enrich-sweep.yml
git commit -s -m "feat(infra): add daily sweep for un-enriched renovate PRs"
```

### Task 9: un-group Renovate's helm subcharts (one PR per tool)

**Files:**
- Modify: `renovate.json` (the `"helm subcharts"` packageRule)

- [ ] **Step 1: Edit the rule**

In `renovate.json`, find:

```json
    {
      "description": "Helm subcharts under infra/ — dependency map but unconditional review.",
      "matchManagers": ["helmv3"],
      "groupName": "helm subcharts",
      "schedule": ["before 6am on monday"]
    },
```

Replace with (drop `groupName` so each dependency opens its own PR; keep the Monday schedule):

```json
    {
      "description": "Helm subcharts under infra/ — one PR per tool (no grouping) so each bump is reviewed and enriched on its own (ADR-0066).",
      "matchManagers": ["helmv3"],
      "schedule": ["before 6am on monday"]
    },
```

- [ ] **Step 2: Validate JSON**

Run: `python -c "import json;json.load(open('renovate.json'));print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add renovate.json
git commit -s -m "chore(infra): one PR per helm subchart (drop grouping)"
```

### Task 10: ADR-0066 + registry index

**Files:**
- Create: `docs/adr/0066-internal-tool-upgrade-enrichment.md`
- Modify: `docs/adr/INDEX.md`

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0066-internal-tool-upgrade-enrichment.md`:

```markdown
# ADR-0066: Internal-tool upgrade-PR enrichment

## Status
Accepted

## Context
In-cluster internal tools (SigNoz + k8s-infra, the platform operators;
matomo and nats via image tags) need to stay current. Renovate opens bare
version-bump PRs for the Helm subcharts but nothing synthesizes the upgrade
homework — release-note breaking changes, required config actions, and how
the upstream default values moved relative to our `values-prod.yaml`
overrides. Image-pinned tools (matomo, nats) had no update PR at all.

## Decision
Add an advisory enrichment workflow that augments each Renovate bump PR with
a generated context block (version delta, migration notes fetched from the
official release docs, and — for subcharts — a key-path values diff with
overridden keys flagged). Two modes share one workflow, registry, and
deterministic Python core: Mode A (subchart deps, with values diff) and
Mode B (image tags in values.yaml, app release notes, no values diff). Mode B
adds Renovate `customManagers` so those tools get bump PRs at all.

Posture:
- **Advise, do not decide.** The agent enriches; a human merges; deploy stays
  a manual `helm upgrade` (no prod access in this workflow).
- **Ground every note in a source-of-truth URL** from
  `infra/tools-upgrade-sources.yaml`; never synthesize release notes from
  model memory (see the 2026-05-21 SigNoz-alerts incident).
- **Registry coherence.** Adding a subchart dependency or a pinned image
  requires adding its source entry in the same PR.

## Consequences
Easier: upgrades arrive review-ready; image-pinned tools finally get PRs.
Harder/different: the source registry must be maintained alongside new tools;
the workflow consumes tokens per bump PR. The enrichment is non-blocking — a
failure never blocks a merge.
```

- [ ] **Step 2: Add registry index entries**

In `docs/adr/INDEX.md`, inside the `## Registry` code block (keep the glob column aligned), add:

```
ADR-0066  .github/workflows/helm-bump-enrich*.yml   Enrichment workflow: advisory, ground notes in source registry
ADR-0066  scripts/helm-enrich/**                     Deterministic enrichment core; pure functions, pytest
ADR-0066  infra/tools-upgrade-sources.yaml           Source registry; add an entry when adding a subchart/image
```

- [ ] **Step 3: Verify the helper resolves the new ADR**

Run: `scripts/adr-context.sh scripts/helm-enrich/detect.py | grep -q 'ADR-0066' && echo ok`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0066-internal-tool-upgrade-enrichment.md docs/adr/INDEX.md
git commit -s -m "docs(adr): ADR-0066 internal-tool upgrade enrichment"
```

- [ ] **Step 5: Open PR 1**

```bash
git push -u origin HEAD
gh pr create --title "feat(infra): helm-bump enrichment (Mode A — subcharts)" \
  --body "Implements Mode A of the helm-bump enrichment design (docs/superpowers/specs/2026-06-11-helm-bump-enrich-design.md). Enriches Renovate subchart-bump PRs with migration notes + upstream values diff. Advisory, non-blocking. ADR-0066."
```

---

# PR 2 — Mode B (image-tag enrichment)

> Branch from `main` after PR 1 merges (the shared core lands in PR 1). If stacking before merge, branch from PR 1's head.

### Task 11: `classify.py` — image bump parsing

**Files:**
- Modify: `scripts/helm-enrich/classify.py`
- Modify: `scripts/helm-enrich/test_classify.py`

- [ ] **Step 1: Add the failing tests**

Append to `scripts/helm-enrich/test_classify.py`:

```python
VALUES_OLD = """\
matomo:
  image:
    repository: matomo
    pullPolicy: IfNotPresent
    tag: "5.2.1-apache"
mariadb:
  image:
    repository: mariadb
    tag: "11.4.4-noble"
"""

VALUES_NEW = VALUES_OLD.replace('5.2.1-apache', '5.3.0-apache')


def test_parse_image_bump_finds_changed_tag():
    bumps = classify.classify("infra/matomo/values.yaml", VALUES_OLD, VALUES_NEW)
    assert bumps == [classify.Bump(mode="B", name="matomo", old="5.2.1", new="5.3.0")]


def test_parse_image_bump_no_change_returns_empty():
    bumps = classify.classify("infra/matomo/values.yaml", VALUES_OLD, VALUES_OLD)
    assert bumps == []


def test_strip_suffix_variants():
    assert classify.strip_suffix("11.4.4-noble") == "11.4.4"
    assert classify.strip_suffix("2.10-alpine") == "2.10"
    assert classify.strip_suffix('"v0.128.0"') == "0.128.0"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts/helm-enrich && python -m pytest test_classify.py -v`
Expected: FAIL — `NotImplementedError: Mode B (image bump) is added in PR 2`.

- [ ] **Step 3: Implement `parse_image_bump` and wire dispatch**

In `scripts/helm-enrich/classify.py`, add (after `parse_chart_bump`):

```python
def _walk_image_blocks(tree, acc: dict[str, str]) -> None:
    """Collect {repository: tag} for every dict carrying both keys."""
    if not isinstance(tree, dict):
        return
    if "repository" in tree and "tag" in tree:
        acc[str(tree["repository"])] = str(tree["tag"])
    for value in tree.values():
        _walk_image_blocks(value, acc)


def parse_image_bump(old: dict, new: dict) -> list[Bump]:
    """Compare two parsed values docs; emit a Bump per changed image tag."""
    old_imgs: dict[str, str] = {}
    new_imgs: dict[str, str] = {}
    _walk_image_blocks(old or {}, old_imgs)
    _walk_image_blocks(new or {}, new_imgs)
    bumps: list[Bump] = []
    for repo, new_tag in new_imgs.items():
        old_tag = old_imgs.get(repo)
        if old_tag is not None and old_tag != new_tag:
            bumps.append(Bump(mode="B", name=repo, old=strip_suffix(old_tag), new=strip_suffix(new_tag)))
    return bumps
```

Then replace the `raise NotImplementedError` line in `classify()` with:

```python
    return parse_image_bump(yaml.safe_load(old_text), yaml.safe_load(new_text))
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts/helm-enrich && python -m pytest -v`
Expected: PASS (all green, including the 3 new cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/helm-enrich/classify.py scripts/helm-enrich/test_classify.py
git commit -s -m "feat(infra): add helm-enrich image bump classifier (Mode B)"
```

### Task 12: register Mode-B image sources

**Files:**
- Modify: `infra/tools-upgrade-sources.yaml`

- [ ] **Step 1: Replace `modeB: []`**

In `infra/tools-upgrade-sources.yaml`, replace the `modeB: []` line with:

```yaml
modeB:
  - image: matomo
    releaseNotes: "https://matomo.org/changelog/"
    extraDocs: "https://github.com/matomo-org/matomo/releases"
    priority: high
  - image: mariadb
    releaseNotes: "https://mariadb.com/docs/release-notes/community-server/{version}"
    priority: high
  - image: nats
    releaseNotes: "https://github.com/nats-io/nats-server/releases/tag/v{version}"
    extraDocs: "https://docs.nats.io/release-notes/whats_new"
    priority: high
  - image: natsio/nats-box
    releaseNotes: "https://github.com/nats-io/nats-box/releases"
    priority: low
  - image: natsio/prometheus-nats-exporter
    releaseNotes: "https://github.com/nats-io/prometheus-nats-exporter/releases"
    priority: low
```

- [ ] **Step 2: Validate load**

Run: `cd scripts/helm-enrich && python -c "import registry; r=registry.load_registry('../../infra/tools-upgrade-sources.yaml'); print(sorted(r['B']))"`
Expected: `['mariadb', 'matomo', 'nats', 'natsio/nats-box', 'natsio/prometheus-nats-exporter']`

- [ ] **Step 3: Commit**

```bash
git add infra/tools-upgrade-sources.yaml
git commit -s -m "feat(infra): register Mode-B image release sources"
```

### Task 13: Renovate image-tag coverage

Use Renovate's comment-annotation customManager (robust vs multiline regex). Annotate each image tag, then add the manager.

**Files:**
- Modify: `infra/matomo/values.yaml`, `infra/nats/values.yaml`
- Modify: `renovate.json`

- [ ] **Step 1: Annotate the matomo tags**

In `infra/matomo/values.yaml`, add a single-line annotation directly above each `tag:`:

```yaml
    # renovate: datasource=docker depName=matomo
    tag: "5.2.1-apache"
```
```yaml
    # renovate: datasource=docker depName=mariadb
    tag: "11.4.4-noble"
```

- [ ] **Step 2: Annotate the nats tags**

In `infra/nats/values.yaml`, above each `tag:`:

```yaml
  # renovate: datasource=docker depName=nats
  tag: "2.10-alpine"
```
```yaml
    # renovate: datasource=docker depName=natsio/nats-box
    tag: "0.19.5"
```
```yaml
    # renovate: datasource=docker depName=natsio/prometheus-nats-exporter
    tag: "0.15.0"
```

- [ ] **Step 3: Add the customManager to `renovate.json`**

Add a top-level `"customManagers"` array (next to `"gradle"`, `"helmv3"`, etc.):

```json
  "customManagers": [
    {
      "customType": "regex",
      "managerFilePatterns": ["/infra/(matomo|nats)/values\\.yaml$/"],
      "matchStrings": [
        "# renovate: datasource=(?<datasource>.*?) depName=(?<depName>.*?)\\s+tag:\\s*[\"'](?<currentValue>.*?)[\"']"
      ],
      "versioningTemplate": "docker"
    }
  ],
```

Docker versioning preserves the `-apache`/`-noble`/`-alpine` suffix when bumping the numeric part; the detect parser strips the suffix for the registry URL.

- [ ] **Step 4: Validate Renovate config**

Run: `npx --yes --package renovate -- renovate-config-validator renovate.json`
Expected: `INFO: Config validated successfully`. (If `npx` is unavailable, validate JSON with `python -c "import json;json.load(open('renovate.json'))"` and review the regex by eye.)

- [ ] **Step 5: Commit**

```bash
git add renovate.json infra/matomo/values.yaml infra/nats/values.yaml
git commit -s -m "feat(infra): renovate image-tag coverage for matomo + nats"
```

### Task 14: extend the workflow for Mode B

**Files:**
- Modify: `.github/workflows/helm-bump-enrich.yml`

- [ ] **Step 1: Add the values trigger path**

In the `on.pull_request.paths` list, add the values path so image-tag PRs fire the workflow:

```yaml
    paths:
      - 'infra/**/Chart.yaml'
      - 'infra/**/values*.yaml'
```

- [ ] **Step 2: Generalize the "Find bumped file + build bundle" step**

Replace the body of the `Find bumped Chart.yaml + build bundle` step (rename it to `Find bumped file + build bundle`) so it handles both modes:

```bash
          set -euo pipefail
          BASE=${{ steps.refs.outputs.base }}
          HEAD=${{ steps.refs.outputs.head }}
          REG=infra/tools-upgrade-sources.yaml
          FILE=$(git diff --name-only "$BASE" "$HEAD" -- 'infra/**/Chart.yaml' 'infra/**/values*.yaml' | head -n1)
          if [ -z "${FILE:-}" ]; then
            echo "::notice::no chart/values change; nothing to enrich"
            echo "skip=true" >> "$GITHUB_OUTPUT"; exit 0
          fi
          git show "$BASE:$FILE" > /tmp/old.yaml
          git show "$HEAD:$FILE" > /tmp/new.yaml
          python scripts/helm-enrich/detect.py classify \
            --path "$FILE" --old /tmp/old.yaml --new /tmp/new.yaml > /tmp/bumps.json
          COUNT=$(jq 'length' /tmp/bumps.json)
          if [ "$COUNT" != "1" ]; then
            echo "::warning::expected 1 bump, got $COUNT; skipping"
            echo "skip=true" >> "$GITHUB_OUTPUT"; exit 0
          fi
          jq -c '.[0]' /tmp/bumps.json > /tmp/bump.json
          MODE=$(jq -r '.mode' /tmp/bump.json)
          if [ "$MODE" = "A" ]; then
            NAME=$(jq -r '.name' /tmp/bump.json)
            OLD=$(jq -r '.old' /tmp/bump.json)
            NEW=$(jq -r '.new' /tmp/bump.json)
            CHART_DIR=$(dirname "$FILE")
            # Values passed as argv (never interpolated into the code string) to avoid injection.
            REPO=$(python -c 'import sys,yaml; d=yaml.safe_load(open(sys.argv[1])); print(next(x["repository"] for x in d["dependencies"] if x["name"]==sys.argv[2]))' "$FILE" "$NAME")
            helm repo add up "$REPO" >/dev/null 2>&1 || helm repo add up "$REPO"
            helm repo update up >/dev/null
            helm show values "up/$NAME" --version "$OLD" > /tmp/vold.yaml || : > /tmp/vold.yaml
            helm show values "up/$NAME" --version "$NEW" > /tmp/vnew.yaml || : > /tmp/vnew.yaml
            OVERRIDES=$(ls "$CHART_DIR"/values*.yaml 2>/dev/null | tr '\n' ' ')
            python scripts/helm-enrich/detect.py bundle \
              --bump /tmp/bump.json --registry "$REG" \
              --values-old /tmp/vold.yaml --values-new /tmp/vnew.yaml \
              --overrides $OVERRIDES > bundle.json
          else
            # Mode B: no upstream chart -> no values diff.
            python scripts/helm-enrich/detect.py bundle \
              --bump /tmp/bump.json --registry "$REG" > bundle.json
          fi
          echo "skip=false" >> "$GITHUB_OUTPUT"
          cat bundle.json
```

- [ ] **Step 3: Lint + commit**

Run: `actionlint .github/workflows/helm-bump-enrich.yml || echo "review by eye"`

```bash
git add .github/workflows/helm-bump-enrich.yml
git commit -s -m "feat(infra): handle image-tag bumps in enrichment workflow (Mode B)"
```

### Task 15: ADR status note + open PR 2

**Files:**
- Modify: `docs/adr/0066-internal-tool-upgrade-enrichment.md`

- [ ] **Step 1: Note Mode B live**

In ADR-0066's `## Consequences`, append:

```markdown

Mode B (image-tag enrichment for matomo + nats) went live in the follow-up PR;
those tools now receive Renovate bump PRs (previously none) and enrichment.
```

- [ ] **Step 2: Commit + open PR 2**

```bash
git add docs/adr/0066-internal-tool-upgrade-enrichment.md
git commit -s -m "docs(adr): note Mode B enrichment is live"
git push -u origin HEAD
gh pr create --title "feat(infra): helm-bump enrichment (Mode B — images)" \
  --body "Implements Mode B of docs/superpowers/specs/2026-06-11-helm-bump-enrich-design.md: image-tag bump PRs for matomo + nats (new Renovate coverage) plus app-release-note enrichment. Builds on PR 1's shared core."
```
