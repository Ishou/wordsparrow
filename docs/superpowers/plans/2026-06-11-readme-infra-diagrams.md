# README Infra Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render four auto-generated, drift-gated Mermaid diagrams (cluster topology, cloud/deploy, request/event flow, clue AI pipeline) into the README from parsed Helm charts plus a coherence-gated `docs/infra/topology.yaml` descriptor.

**Architecture:** A small Python package under `scripts/infra_diagrams/` parses Helm `Chart.yaml` files and `terraform/*.tf` for node facts, loads a hand-maintained descriptor for the semantic edges no chart contains, cross-checks the two (coherence gate), renders `flowchart LR` Mermaid, and injects each diagram between `<!-- INFRA-DIAGRAM:<id> START/END -->` markers in `README.md`. A CI workflow regenerates and fails on drift, mirroring `openapi-typescript-drift.yml`.

**Tech Stack:** Python 3.12 (CI) / 3.14 (local `.venv`), PyYAML 6.0.3 (already vendored), Mermaid (GitHub-native render), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-11-readme-infra-diagrams-design.md`

**Module layout:**
- `scripts/infra_diagrams/parse.py` — Helm chart + terraform + workflow parsing → dataclasses
- `scripts/infra_diagrams/descriptor.py` — load `topology.yaml`, coherence checks
- `scripts/infra_diagrams/render.py` — build Mermaid strings for the four diagrams
- `scripts/infra_diagrams/readme.py` — marker injection into README
- `scripts/infra_diagrams/generate.py` — CLI (`--check` for CI)
- `scripts/infra_diagrams/requirements.txt` — pinned PyYAML
- `scripts/infra_diagrams/test_generate.py` — pytest suite
- `docs/infra/topology.yaml` — the descriptor
- `.github/workflows/readme-diagrams-drift.yml` — drift gate
- `Makefile` — `diagrams` target
- `README.md` — marker pairs + generated blocks
- `CLAUDE.md`, `.claude/skills/dispatch/SKILL.md` — culture notes

**Import note:** modules import each other by bare name (`from parse import ...`). This works because Python puts the script dir on `sys.path[0]` when running `generate.py`, and pytest's default `prepend` import mode inserts the test file's dir (no `__init__.py` present) onto `sys.path`. Do **not** add an `__init__.py`.

**Suggested PR split** (each ≤400 lines): PR1 = Tasks 1–6 (package + descriptor + tests + Makefile, no README edit). PR2 = Tasks 7–10 (README markers + generated blocks + CI gate + culture notes).

---

### Task 1: Package scaffold + chart parsing

**Files:**
- Create: `scripts/infra_diagrams/requirements.txt`
- Create: `scripts/infra_diagrams/parse.py`
- Test: `scripts/infra_diagrams/test_generate.py`

- [ ] **Step 1: Pin the dependency**

Create `scripts/infra_diagrams/requirements.txt`:

```
PyYAML==6.0.3
```

- [ ] **Step 2: Write the failing test for chart parsing**

Create `scripts/infra_diagrams/test_generate.py`:

```python
from __future__ import annotations

from pathlib import Path

import parse


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def _fake_repo(tmp_path: Path) -> Path:
    # infra chart, no cnpg
    _write(tmp_path / "infra/nats/Chart.yaml", "name: bliss-nats\n")
    # api chart with inline cnpg postgres
    _write(tmp_path / "grid/api/deploy/chart/Chart.yaml", "name: wordsparrow-api\n")
    _write(
        tmp_path / "grid/api/deploy/chart/templates/pg.yaml",
        "apiVersion: postgresql.cnpg.io/v1\nkind: Cluster\n",
    )
    # api chart whose cnpg lives in a sibling db-chart
    _write(tmp_path / "game/api/deploy/chart/Chart.yaml", "name: bliss-game-api\n")
    _write(tmp_path / "game/api/deploy/db-chart/Chart.yaml", "name: bliss-game-api-db\n")
    _write(
        tmp_path / "game/api/deploy/db-chart/templates/cluster.yaml",
        "apiVersion: postgresql.cnpg.io/v1\nkind: Cluster\n",
    )
    # decoy: a ClusterIssuer must NOT count as a postgres
    _write(tmp_path / "infra/platform/Chart.yaml", "name: platform\n")
    _write(
        tmp_path / "infra/platform/templates/issuer.yaml",
        "apiVersion: cert-manager.io/v1\nkind: ClusterIssuer\n",
    )
    return tmp_path


def test_load_charts_discovers_names_and_kinds(tmp_path: Path) -> None:
    root = _fake_repo(tmp_path)
    charts = {c.name: c for c in parse.load_charts(root)}
    assert charts["wordsparrow-api"].kind == "api"
    assert charts["bliss-game-api-db"].kind == "db"
    assert charts["platform"].kind == "infra"


def test_cnpg_detection_excludes_clusterissuer(tmp_path: Path) -> None:
    root = _fake_repo(tmp_path)
    charts = {c.name: c for c in parse.load_charts(root)}
    assert charts["wordsparrow-api"].has_cnpg is True
    assert charts["platform"].has_cnpg is False  # ClusterIssuer is not CNPG


def test_derive_apps_attaches_db_from_sibling_db_chart(tmp_path: Path) -> None:
    root = _fake_repo(tmp_path)
    apps = {a.context: a for a in parse.derive_apps(parse.load_charts(root))}
    assert apps["grid"].has_db is True   # inline cnpg
    assert apps["game"].has_db is True   # cnpg in sibling db-chart
    assert apps["game"].kind == "api"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'parse'`.

- [ ] **Step 4: Implement `parse.py` (chart parsing)**

Create `scripts/infra_diagrams/parse.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]

CNPG_API_VERSION = "apiVersion: postgresql.cnpg.io"

CHART_GLOBS = (
    "infra/*/Chart.yaml",
    "*/api/deploy/chart/Chart.yaml",
    "*/api/deploy/db-chart/Chart.yaml",
)


@dataclass(frozen=True)
class Chart:
    name: str
    path: Path  # chart dir, relative to repo root
    kind: str   # "infra" | "api" | "db"
    has_cnpg: bool


@dataclass(frozen=True)
class AppNode:
    name: str      # chart name
    context: str   # grid/game/identity/survey, or infra chart name
    has_db: bool
    kind: str      # "api" | "infra"


def _classify(rel: str) -> str:
    if rel.startswith("infra/"):
        return "infra"
    if rel.endswith("/db-chart"):
        return "db"
    return "api"


def _has_cnpg(chart_dir: Path) -> bool:
    templates = chart_dir / "templates"
    if not templates.is_dir():
        return False
    return any(
        CNPG_API_VERSION in tpl.read_text(encoding="utf-8")
        for tpl in templates.rglob("*.yaml")
    )


def load_charts(root: Path = REPO_ROOT) -> list[Chart]:
    charts: list[Chart] = []
    for glob in CHART_GLOBS:
        for chart_yaml in sorted(root.glob(glob)):
            data = yaml.safe_load(chart_yaml.read_text(encoding="utf-8")) or {}
            name = data.get("name")
            if not name:
                raise ValueError(f"Chart without name: {chart_yaml}")
            chart_dir = chart_yaml.parent
            rel = chart_dir.relative_to(root).as_posix()
            charts.append(
                Chart(
                    name=name,
                    path=chart_dir.relative_to(root),
                    kind=_classify(rel),
                    has_cnpg=_has_cnpg(chart_dir),
                )
            )
    return charts


def derive_apps(charts: list[Chart]) -> list[AppNode]:
    db_contexts = {
        c.path.parts[0] for c in charts if c.kind == "db" and c.has_cnpg
    }
    apps: list[AppNode] = []
    for c in charts:
        if c.kind == "api":
            ctx = c.path.parts[0]
            apps.append(
                AppNode(
                    name=c.name,
                    context=ctx,
                    has_db=c.has_cnpg or ctx in db_contexts,
                    kind="api",
                )
            )
        elif c.kind == "infra":
            apps.append(
                AppNode(name=c.name, context=c.name, has_db=c.has_cnpg, kind="infra")
            )
    return apps
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/infra_diagrams/requirements.txt scripts/infra_diagrams/parse.py scripts/infra_diagrams/test_generate.py
git commit -s -m "feat(infra-diagrams): parse helm charts into app/db nodes"
```

---

### Task 2: Terraform + deploy-workflow parsing

**Files:**
- Modify: `scripts/infra_diagrams/parse.py`
- Test: `scripts/infra_diagrams/test_generate.py`

- [ ] **Step 1: Write the failing test**

Append to `scripts/infra_diagrams/test_generate.py`:

```python
def test_terraform_resource_types(tmp_path: Path) -> None:
    _write(
        tmp_path / "terraform/cf.tf",
        'resource "cloudflare_pages_project" "frontend" {}\n'
        'resource "cloudflare_dns_record" "v" {}\n',
    )
    types = parse.terraform_resource_types(tmp_path)
    assert types == {"cloudflare_pages_project", "cloudflare_dns_record"}


def test_deploy_workflows(tmp_path: Path) -> None:
    _write(tmp_path / ".github/workflows/deploy-frontend.yml", "name: x\n")
    _write(tmp_path / ".github/workflows/deploy-api-k8s.yml", "name: y\n")
    _write(tmp_path / ".github/workflows/ci.yml", "name: z\n")
    assert parse.deploy_workflows(tmp_path) == {"deploy-frontend", "deploy-api-k8s"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k "terraform or deploy_workflows" -v`
Expected: FAIL — `AttributeError: module 'parse' has no attribute 'terraform_resource_types'`.

- [ ] **Step 3: Implement the parsers**

Add to the top imports of `scripts/infra_diagrams/parse.py`:

```python
import re
```

Append to `scripts/infra_diagrams/parse.py`:

```python
TF_RESOURCE_TYPES = (
    "cloudflare_pages_project",
    "cloudflare_pages_domain",
    "cloudflare_dns_record",
)


def terraform_resource_types(root: Path = REPO_ROOT) -> set[str]:
    found: set[str] = set()
    tf_dir = root / "terraform"
    if not tf_dir.is_dir():
        return found
    for tf in sorted(tf_dir.glob("*.tf")):
        text = tf.read_text(encoding="utf-8")
        for rtype in TF_RESOURCE_TYPES:
            if re.search(rf'resource\s+"{re.escape(rtype)}"', text):
                found.add(rtype)
    return found


def deploy_workflows(root: Path = REPO_ROOT) -> set[str]:
    wf_dir = root / ".github/workflows"
    if not wf_dir.is_dir():
        return set()
    return {p.stem for p in wf_dir.glob("deploy-*.yml")}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k "terraform or deploy_workflows" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/infra_diagrams/parse.py scripts/infra_diagrams/test_generate.py
git commit -s -m "feat(infra-diagrams): parse terraform resource types and deploy workflows"
```

---

### Task 3: Descriptor + coherence checks

**Files:**
- Create: `docs/infra/topology.yaml`
- Create: `scripts/infra_diagrams/descriptor.py`
- Test: `scripts/infra_diagrams/test_generate.py`

- [ ] **Step 1: Write the descriptor**

Create `docs/infra/topology.yaml`:

```yaml
# Source of truth for infra-diagram EDGES and display grouping.
# NODES (apps, DBs) are parsed from Helm charts; this file declares the
# semantic edges and cloud nodes that no chart contains. Coherence-gated
# by scripts/infra_diagrams (every chart must be referenced here; every
# chart / tf-resource / workflow referenced here must exist). See
# docs/superpowers/specs/2026-06-11-readme-infra-diagrams-design.md.

# Display services. `chart` must match a real Chart.yaml `name:`. One
# chart may expand into several display nodes (platform bundles
# ingress-nginx + cert-manager). `id` is the Mermaid node id.
services:
  - { id: ingress,     label: ingress-nginx,  chart: platform,            group: Edge }
  - { id: certmanager, label: cert-manager,   chart: platform,            group: Edge }
  - { id: grid,        label: grid-api,       chart: wordsparrow-api,     group: APIs }
  - { id: game,        label: game-api,       chart: bliss-game-api,      group: APIs }
  - { id: identity,    label: identity-api,   chart: bliss-identity-api,  group: APIs }
  - { id: survey,      label: survey-api,     chart: bliss-survey-api,    group: APIs }
  - { id: nats,        label: NATS JetStream, chart: bliss-nats,          group: Messaging }
  - { id: signoz,      label: SigNoz,         chart: observability,       group: Observability }
  - { id: matomo,      label: Matomo,         chart: matomo,              group: Observability }

# Cloud nodes for the cloud/deploy diagram. `tf_resource` must match a
# resource type present in terraform/*.tf (grep-gated). Use null for
# nodes with no terraform resource (e.g. the k3s node concept).
cloud:
  - { id: pages,       label: Cloudflare Pages,    tf_resource: cloudflare_pages_project }
  - { id: pagesdomain, label: Pages custom domain, tf_resource: cloudflare_pages_domain }
  - { id: dns,         label: Cloudflare DNS,      tf_resource: cloudflare_dns_record }
  - { id: k3s,         label: Hetzner k3s,         tf_resource: null }

# Cluster-topology edges (event + telemetry edges no chart encodes).
cluster_edges:
  - { from: ingress,  to: grid,     label: HTTP }
  - { from: ingress,  to: game,     label: HTTP/WS }
  - { from: ingress,  to: identity, label: HTTP }
  - { from: ingress,  to: survey,   label: HTTP }
  - { from: grid,     to: nats,     label: publishes }
  - { from: identity, to: nats,     label: publishes }
  - { from: game,     to: nats,     label: subscribes }
  - { from: grid,     to: signoz,   label: otel }
  - { from: game,     to: signoz,   label: otel }
  - { from: identity, to: signoz,   label: otel }
  - { from: survey,   to: signoz,   label: otel }

# Request/event flow diagram: ordered runtime hops. `browser` is a literal.
flow_edges:
  - { from: browser, to: ingress, label: HTTPS }
  - { from: ingress, to: grid,    label: REST }
  - { from: ingress, to: game,    label: WSS }
  - { from: grid,    to: nats,    label: PuzzleReady event }
  - { from: nats,    to: game,    label: consumes }
  - { from: game,    to: signoz,  label: traces }

# Cloud/deploy diagram edges. `from` may be a deploy-*.yml workflow stem
# (gated against real workflows) or a cloud/service id.
deploy_edges:
  - { from: deploy-frontend, to: pages, label: wrangler }
  - { from: deploy-api-k8s,  to: k3s,   label: helm upgrade }
  - { from: pages,           to: dns,   label: served via }

# Clue AI pipeline stages, rendered as a linear chain.
clue_pipeline:
  - Curated FR corpus
  - mlx-lm LoRA / DPO generator
  - CamemBERT cross-encoder filter
  - validate_clue gates
  - versioned CSV
  - words-clues-worker
  - grid corpus
```

- [ ] **Step 2: Write the failing coherence tests**

Append to `scripts/infra_diagrams/test_generate.py`:

```python
import descriptor


def _topo(**overrides) -> descriptor.Topology:
    base = dict(
        services=[
            {"id": "grid", "label": "grid-api", "chart": "wordsparrow-api", "group": "APIs"},
            {"id": "ingress", "label": "ingress-nginx", "chart": "platform", "group": "Edge"},
        ],
        cloud=[{"id": "pages", "label": "Pages", "tf_resource": "cloudflare_pages_project"}],
        cluster_edges=[{"from": "ingress", "to": "grid", "label": "HTTP"}],
        flow_edges=[{"from": "browser", "to": "ingress", "label": "HTTPS"}],
        deploy_edges=[{"from": "deploy-frontend", "to": "pages", "label": "wrangler"}],
        clue_pipeline=["a", "b"],
    )
    base.update(overrides)
    return descriptor.Topology(**base)


def _charts() -> list[parse.Chart]:
    return [
        parse.Chart("wordsparrow-api", Path("grid/api/deploy/chart"), "api", True),
        parse.Chart("platform", Path("infra/platform"), "infra", False),
    ]


def test_coherence_passes_on_matching_sets() -> None:
    descriptor.check_coherence(
        _topo(), _charts(), {"cloudflare_pages_project"}, {"deploy-frontend"}
    )  # must not raise


def test_coherence_fails_on_chart_missing_from_descriptor() -> None:
    charts = _charts() + [parse.Chart("bliss-nats", Path("infra/nats"), "infra", False)]
    try:
        descriptor.check_coherence(_topo(), charts, {"cloudflare_pages_project"}, {"deploy-frontend"})
    except descriptor.CoherenceError as exc:
        assert "bliss-nats" in str(exc)
    else:
        raise AssertionError("expected CoherenceError")


def test_coherence_fails_on_descriptor_referencing_unknown_chart() -> None:
    topo = _topo(services=_topo().services + [
        {"id": "ghost", "label": "Ghost", "chart": "does-not-exist", "group": "APIs"}
    ])
    try:
        descriptor.check_coherence(topo, _charts(), {"cloudflare_pages_project"}, {"deploy-frontend"})
    except descriptor.CoherenceError as exc:
        assert "does-not-exist" in str(exc)
    else:
        raise AssertionError("expected CoherenceError")


def test_coherence_fails_on_undeclared_tf_resource() -> None:
    try:
        descriptor.check_coherence(
            _topo(), _charts(),
            {"cloudflare_pages_project", "cloudflare_dns_record"},  # dns not declared
            {"deploy-frontend"},
        )
    except descriptor.CoherenceError as exc:
        assert "cloudflare_dns_record" in str(exc)
    else:
        raise AssertionError("expected CoherenceError")


def test_coherence_fails_on_unknown_edge_endpoint() -> None:
    topo = _topo(cluster_edges=[{"from": "ingress", "to": "nope", "label": "x"}])
    try:
        descriptor.check_coherence(topo, _charts(), {"cloudflare_pages_project"}, {"deploy-frontend"})
    except descriptor.CoherenceError as exc:
        assert "nope" in str(exc)
    else:
        raise AssertionError("expected CoherenceError")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k coherence -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'descriptor'`.

- [ ] **Step 4: Implement `descriptor.py`**

Create `scripts/infra_diagrams/descriptor.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from parse import REPO_ROOT, Chart

DESCRIPTOR_PATH = REPO_ROOT / "docs/infra/topology.yaml"


class CoherenceError(Exception):
    """Raised when the descriptor drifts from parsed charts / terraform."""


@dataclass
class Topology:
    services: list[dict]
    cloud: list[dict]
    cluster_edges: list[dict]
    flow_edges: list[dict]
    deploy_edges: list[dict]
    clue_pipeline: list[str]

    def service_ids(self) -> set[str]:
        return {s["id"] for s in self.services}

    def cloud_ids(self) -> set[str]:
        return {c["id"] for c in self.cloud}


def load_topology(path: Path = DESCRIPTOR_PATH) -> Topology:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return Topology(
        services=raw.get("services") or [],
        cloud=raw.get("cloud") or [],
        cluster_edges=raw.get("cluster_edges") or [],
        flow_edges=raw.get("flow_edges") or [],
        deploy_edges=raw.get("deploy_edges") or [],
        clue_pipeline=raw.get("clue_pipeline") or [],
    )


def check_coherence(
    topo: Topology,
    charts: list[Chart],
    tf_types: set[str],
    workflow_ids: set[str],
) -> None:
    _check_chart_coverage(topo, charts)
    _check_tf_coverage(topo, tf_types)
    _check_edge_endpoints(topo, workflow_ids)


def _check_chart_coverage(topo: Topology, charts: list[Chart]) -> None:
    real = {c.name for c in charts if c.kind in ("api", "infra")}
    declared = {s["chart"] for s in topo.services}
    missing = real - declared
    extra = declared - real
    if missing:
        raise CoherenceError(
            f"charts not represented in topology.yaml services: {sorted(missing)}"
        )
    if extra:
        raise CoherenceError(
            f"topology.yaml services reference non-existent charts: {sorted(extra)}"
        )


def _check_tf_coverage(topo: Topology, tf_types: set[str]) -> None:
    declared = {c["tf_resource"] for c in topo.cloud if c.get("tf_resource")}
    missing = tf_types - declared
    extra = declared - tf_types
    if missing:
        raise CoherenceError(
            f"terraform resource types not declared in topology.yaml cloud: {sorted(missing)}"
        )
    if extra:
        raise CoherenceError(
            f"topology.yaml cloud declares tf resources absent from terraform/: {sorted(extra)}"
        )


def _check_edge_endpoints(topo: Topology, workflow_ids: set[str]) -> None:
    valid = topo.service_ids() | topo.cloud_ids() | {"browser"}
    for edge in topo.cluster_edges + topo.flow_edges:
        for end in (edge["from"], edge["to"]):
            if end not in valid:
                raise CoherenceError(f"edge endpoint not a known id: {end!r}")
    for edge in topo.deploy_edges:
        if edge["from"] not in valid | workflow_ids:
            raise CoherenceError(f"deploy edge 'from' unknown: {edge['from']!r}")
        if edge["to"] not in valid:
            raise CoherenceError(f"deploy edge 'to' unknown: {edge['to']!r}")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k coherence -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Verify the real descriptor is coherent with the real repo**

Run:
```bash
python -c "from pathlib import Path; import sys; sys.path.insert(0,'scripts/infra_diagrams'); import parse, descriptor as d; t=d.load_topology(); d.check_coherence(t, parse.load_charts(), parse.terraform_resource_types(), parse.deploy_workflows()); print('coherent')"
```
Expected: prints `coherent`. If it raises, fix `docs/infra/topology.yaml` to match the real charts/terraform.

- [ ] **Step 7: Commit**

```bash
git add docs/infra/topology.yaml scripts/infra_diagrams/descriptor.py scripts/infra_diagrams/test_generate.py
git commit -s -m "feat(infra-diagrams): add topology descriptor with coherence gate"
```

---

### Task 4: Mermaid rendering

**Files:**
- Create: `scripts/infra_diagrams/render.py`
- Test: `scripts/infra_diagrams/test_generate.py`

Mermaid node ids cannot contain `-` or `.`, so all ids pass through `_safe()`. Every diagram is `flowchart LR`. The cluster diagram groups service nodes into `subgraph`s (insertion order from the descriptor) plus a synthesized `Data` subgraph of Postgres cylinders for API contexts that have a DB.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/infra_diagrams/test_generate.py`:

```python
import render


def _apps() -> list[parse.AppNode]:
    return [
        parse.AppNode("wordsparrow-api", "grid", True, "api"),
        parse.AppNode("bliss-game-api", "game", True, "api"),
        parse.AppNode("platform", "platform", False, "infra"),
    ]


def test_render_cluster_has_subgraphs_and_db_cylinder() -> None:
    out = render.render_cluster(_topo(), _apps())
    assert out.startswith("flowchart LR")
    assert "subgraph Edge" in out
    assert "subgraph APIs" in out
    assert "subgraph Data" in out
    assert 'gridDB[("grid pg")]' in out      # cylinder shape for postgres
    assert "grid --> gridDB" in out
    assert "ingress -->|HTTP| grid" in out


def test_render_cloud_sanitizes_hyphenated_workflow_ids() -> None:
    out = render.render_cloud(_topo())
    assert out.startswith("flowchart LR")
    # deploy-frontend -> deploy_frontend as a node id, label keeps the .yml
    assert 'deploy_frontend["deploy-frontend.yml"]' in out
    assert "deploy_frontend -->|wrangler| pages" in out


def test_render_flow_declares_browser_and_edges() -> None:
    out = render.render_flow(_topo())
    assert out.startswith("flowchart LR")
    assert 'browser["Browser"]' in out
    assert "browser -->|HTTPS| ingress" in out


def test_render_clue_is_linear_chain() -> None:
    out = render.render_clue(_topo(clue_pipeline=["x", "y", "z"]))
    assert out.startswith("flowchart LR")
    assert 's0["x"]' in out and 's2["z"]' in out
    assert "s0 --> s1" in out and "s1 --> s2" in out


def test_render_is_deterministic() -> None:
    assert render.render_cluster(_topo(), _apps()) == render.render_cluster(_topo(), _apps())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k render -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'render'`.

- [ ] **Step 3: Implement `render.py`**

Create `scripts/infra_diagrams/render.py`:

```python
from __future__ import annotations

from parse import AppNode
from descriptor import Topology


def _safe(node_id: str) -> str:
    return node_id.replace("-", "_").replace(".", "_")


def _db_by_context(apps: list[AppNode]) -> dict[str, bool]:
    return {a.context: a.has_db for a in apps if a.kind == "api"}


def render_cluster(topo: Topology, apps: list[AppNode]) -> str:
    db = _db_by_context(apps)
    lines = ["flowchart LR"]

    groups: dict[str, list[dict]] = {}
    for s in topo.services:
        groups.setdefault(s["group"], []).append(s)
    for group, svcs in groups.items():
        lines.append(f"  subgraph {group}")
        for s in svcs:
            lines.append(f'    {_safe(s["id"])}["{s["label"]}"]')
        lines.append("  end")

    lines.append("  subgraph Data")
    for s in topo.services:
        if db.get(s["id"]):
            lines.append(f'    {_safe(s["id"])}DB[("{s["id"]} pg")]')
    lines.append("  end")

    for e in topo.cluster_edges:
        lines.append(f'  {_safe(e["from"])} -->|{e["label"]}| {_safe(e["to"])}')
    for s in topo.services:
        if db.get(s["id"]):
            lines.append(f'  {_safe(s["id"])} --> {_safe(s["id"])}DB')
    return "\n".join(lines)


def render_cloud(topo: Topology) -> str:
    lines = ["flowchart LR"]
    workflows = sorted(
        {e["from"] for e in topo.deploy_edges if e["from"].startswith("deploy-")}
    )
    if workflows:
        lines.append("  subgraph CI")
        for w in workflows:
            lines.append(f'    {_safe(w)}["{w}.yml"]')
        lines.append("  end")
    lines.append("  subgraph Cloud")
    for c in topo.cloud:
        lines.append(f'    {_safe(c["id"])}["{c["label"]}"]')
    lines.append("  end")
    for e in topo.deploy_edges:
        lines.append(f'  {_safe(e["from"])} -->|{e["label"]}| {_safe(e["to"])}')
    return "\n".join(lines)


def render_flow(topo: Topology) -> str:
    labels = {s["id"]: s["label"] for s in topo.services}
    labels["browser"] = "Browser"
    labels.update({c["id"]: c["label"] for c in topo.cloud})

    nodes: list[str] = []
    for e in topo.flow_edges:
        for end in (e["from"], e["to"]):
            if end not in nodes:
                nodes.append(end)

    lines = ["flowchart LR"]
    for n in nodes:
        lines.append(f'  {_safe(n)}["{labels.get(n, n)}"]')
    for e in topo.flow_edges:
        lines.append(f'  {_safe(e["from"])} -->|{e["label"]}| {_safe(e["to"])}')
    return "\n".join(lines)


def render_clue(topo: Topology) -> str:
    stages = topo.clue_pipeline
    lines = ["flowchart LR"]
    for i, stage in enumerate(stages):
        lines.append(f'  s{i}["{stage}"]')
    for i in range(len(stages) - 1):
        lines.append(f"  s{i} --> s{i + 1}")
    return "\n".join(lines)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k render -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/infra_diagrams/render.py scripts/infra_diagrams/test_generate.py
git commit -s -m "feat(infra-diagrams): render four flowchart LR mermaid diagrams"
```

---

### Task 5: README marker injection

**Files:**
- Create: `scripts/infra_diagrams/readme.py`
- Test: `scripts/infra_diagrams/test_generate.py`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/infra_diagrams/test_generate.py`:

```python
import readme as readme_mod


def test_inject_replaces_only_between_markers() -> None:
    text = (
        "Intro prose.\n"
        "<!-- INFRA-DIAGRAM:cluster START -->\n"
        "old\n"
        "<!-- INFRA-DIAGRAM:cluster END -->\n"
        "Outro prose.\n"
    )
    out = readme_mod.inject(text, "cluster", "flowchart LR\n  a --> b")
    assert "Intro prose." in out and "Outro prose." in out
    assert "old" not in out
    assert "```mermaid\nflowchart LR\n  a --> b\n```" in out
    # prose bytes around the block are untouched
    assert out.startswith("Intro prose.\n")
    assert out.endswith("Outro prose.\n")


def test_inject_raises_when_marker_absent() -> None:
    try:
        readme_mod.inject("no markers here", "cluster", "x")
    except ValueError as exc:
        assert "cluster" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_inject_is_idempotent() -> None:
    text = (
        "<!-- INFRA-DIAGRAM:cluster START -->\n"
        "<!-- INFRA-DIAGRAM:cluster END -->\n"
    )
    once = readme_mod.inject(text, "cluster", "flowchart LR\n  a --> b")
    twice = readme_mod.inject(once, "cluster", "flowchart LR\n  a --> b")
    assert once == twice
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k inject -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'readme'`.

- [ ] **Step 3: Implement `readme.py`**

Create `scripts/infra_diagrams/readme.py`:

```python
from __future__ import annotations

import re
from pathlib import Path

from parse import REPO_ROOT

README_PATH = REPO_ROOT / "README.md"

MARKER_IDS = ("cluster", "cloud", "flow", "clue-pipeline")


def _block(marker: str, mermaid: str) -> str:
    return (
        f"<!-- INFRA-DIAGRAM:{marker} START -->\n"
        f"```mermaid\n{mermaid}\n```\n"
        f"<!-- INFRA-DIAGRAM:{marker} END -->"
    )


def inject(text: str, marker: str, mermaid: str) -> str:
    start = f"<!-- INFRA-DIAGRAM:{marker} START -->"
    end = f"<!-- INFRA-DIAGRAM:{marker} END -->"
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if not pattern.search(text):
        raise ValueError(f"marker pair not found in README: {marker}")
    # lambda replacement avoids backreference interpretation in the mermaid body
    return pattern.sub(lambda _match: _block(marker, mermaid), text)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k inject -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/infra_diagrams/readme.py scripts/infra_diagrams/test_generate.py
git commit -s -m "feat(infra-diagrams): inject mermaid blocks between readme markers"
```

---

### Task 6: CLI entry point (`generate.py`) + Makefile target

**Files:**
- Create: `scripts/infra_diagrams/generate.py`
- Modify: `Makefile`
- Test: `scripts/infra_diagrams/test_generate.py`

- [ ] **Step 1: Write the failing test**

Append to `scripts/infra_diagrams/test_generate.py`:

```python
import generate


def test_build_readme_fills_all_markers_and_is_idempotent() -> None:
    skeleton = "\n".join(
        f"<!-- INFRA-DIAGRAM:{m} START -->\n<!-- INFRA-DIAGRAM:{m} END -->"
        for m in readme_mod.MARKER_IDS
    ) + "\n"
    once = generate.build_readme(skeleton)
    twice = generate.build_readme(once)
    assert once == twice                      # idempotent
    assert "flowchart LR" in once
    assert once.count("```mermaid") == len(readme_mod.MARKER_IDS)
```

This test runs against the **real** repo charts/descriptor (no tmp fixture), so it also proves the committed `docs/infra/topology.yaml` is coherent.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k build_readme -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'generate'`.

- [ ] **Step 3: Implement `generate.py`**

Create `scripts/infra_diagrams/generate.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest scripts/infra_diagrams/test_generate.py -k build_readme -v`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full suite**

Run: `python -m pytest scripts/infra_diagrams/ -v`
Expected: PASS (all tests across Tasks 1–6).

- [ ] **Step 6: Add the Makefile target**

In `Makefile`, add this target immediately before the `help:` target (keep the file's two-space-then-`##` comment style so it shows in `make help`):

```makefile
diagrams:          ## Regenerate README infra diagrams from charts + topology.yaml
	python3 scripts/infra_diagrams/generate.py
```

- [ ] **Step 7: Commit**

```bash
git add scripts/infra_diagrams/generate.py scripts/infra_diagrams/test_generate.py Makefile
git commit -s -m "feat(infra-diagrams): add generate CLI and make diagrams target"
```

---

### Task 7: Add README markers and generate the diagrams

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Insert the three infra markers**

In `README.md`, inside the `## Infrastructure (IaC)` section, immediately after the line `clicked in a console.` (the paragraph that ends the section intro, currently around line 50), insert a blank line then these three marker pairs separated by blank lines:

```markdown
<!-- INFRA-DIAGRAM:cluster START -->
<!-- INFRA-DIAGRAM:cluster END -->

<!-- INFRA-DIAGRAM:cloud START -->
<!-- INFRA-DIAGRAM:cloud END -->

<!-- INFRA-DIAGRAM:flow START -->
<!-- INFRA-DIAGRAM:flow END -->
```

- [ ] **Step 2: Insert the clue-pipeline marker**

In `README.md`, inside the `## Local AI pipeline (clue generation)` section, immediately after the paragraph ending `...consumes and produces a versioned CSV the JVM worker consumes. Pipeline lives in [scripts/clue_generation/]...` (the intro paragraph, before the `- **Generator**` bullet list, currently around line 115), insert a blank line then:

```markdown
<!-- INFRA-DIAGRAM:clue-pipeline START -->
<!-- INFRA-DIAGRAM:clue-pipeline END -->
```

- [ ] **Step 3: Generate the diagrams**

Run: `python3 scripts/infra_diagrams/generate.py`
Expected: prints `README infra diagrams regenerated.` and fills all four marker blocks with `flowchart LR` Mermaid.

- [ ] **Step 4: Verify drift mode is now clean**

Run: `python3 scripts/infra_diagrams/generate.py --check`
Expected: prints `README infra diagrams up to date.` and exits 0.

- [ ] **Step 5: Visually sanity-check the rendered Mermaid**

Open `README.md` in a Markdown previewer that renders Mermaid (e.g. the GitHub web UI on the pushed branch, or an IDE preview). Confirm all four diagrams render without Mermaid syntax errors and the cluster diagram shows the Edge/APIs/Data/Messaging/Observability subgraphs. If a diagram fails to parse, fix the offending label in `docs/infra/topology.yaml` (avoid characters Mermaid treats specially in labels; wrap in the descriptor if needed) and re-run Step 3.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -s -m "docs(infra): embed auto-generated infra diagrams in README"
```

---

### Task 8: CI drift gate

**Files:**
- Create: `.github/workflows/readme-diagrams-drift.yml`

This mirrors `openapi-typescript-drift.yml`: regenerate, then fail if the working tree changed. A `CoherenceError` makes `generate.py` exit non-zero, failing the regenerate step with a clear message. Actions are SHA-pinned per the manifesto's deterministic-builds rule (`actions/checkout` reuses the SHA already used elsewhere in this repo; verify the `setup-python` SHA resolves to v5 before merging — Renovate will keep it current thereafter).

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/readme-diagrams-drift.yml`:

```yaml
name: README Diagrams Drift

# Regenerates the README infra diagrams from the Helm charts + topology
# descriptor and fails if the committed README is out of sync. Mirrors
# openapi-typescript-drift.yml. Contributors regenerate locally with
# `make diagrams`. See
# docs/superpowers/specs/2026-06-11-readme-infra-diagrams-design.md.

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  drift:
    name: regen-and-diff
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        with:
          fetch-depth: 1

      - name: Set up Python
        uses: actions/setup-python@0b93645e9fea7318ecaed2b359559ac225c90a2b # v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install -r scripts/infra_diagrams/requirements.txt

      - name: Regenerate diagrams (fails on coherence error)
        run: python scripts/infra_diagrams/generate.py

      - name: Fail on drift
        run: git diff --exit-code -- README.md
```

- [ ] **Step 2: Validate the workflow YAML locally**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/readme-diagrams-drift.yml')); print('valid yaml')"`
Expected: prints `valid yaml`.

- [ ] **Step 3: Confirm the gate would pass on a clean tree**

Run: `python3 scripts/infra_diagrams/generate.py && git diff --exit-code -- README.md && echo "gate green"`
Expected: prints `gate green` (no diff, since Task 7 already committed the generated README).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/readme-diagrams-drift.yml
git commit -s -m "ci(infra-diagrams): add readme diagrams drift gate"
```

---

### Task 9: Culture notes (CLAUDE.md + dispatch skill)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/skills/dispatch/SKILL.md`

- [ ] **Step 1: Document the descriptor as a registry in CLAUDE.md**

In `CLAUDE.md`, find the bullet beginning **"Registries cannot lag the things they register."** At the end of that bullet's prose (after the sentence ending `...apply it as a habit, not just where the gate forces it.`), append:

```markdown
  The README infra diagrams are a registry too: `docs/infra/topology.yaml`
  declares the diagram edges and cloud nodes, and
  `scripts/infra_diagrams/` regenerates the Mermaid into `README.md`. The
  `readme-diagrams-drift.yml` gate fails if a new Helm chart, terraform
  cloud resource, or deploy workflow is added without updating the
  descriptor, or if `README.md` is stale. Regenerate with `make diagrams`.
```

- [ ] **Step 2: Add `readme-diagrams-drift` to the CI gates list**

In `CLAUDE.md`, in the `## CI gates (must be green to merge)` section, add to the line listing `openapi-lint`, `openapi-typescript-drift`, ... the new gate. Change:

```markdown
- `openapi-lint`, `openapi-typescript-drift`, `helm-lint`, `api-chart-lint`.
```

to:

```markdown
- `openapi-lint`, `openapi-typescript-drift`, `helm-lint`, `api-chart-lint`,
  `readme-diagrams-drift`.
```

- [ ] **Step 3: Add a one-line note to the dispatch skill**

In `.claude/skills/dispatch/SKILL.md`, locate the section that lists per-path obligations for implementers (the same place the ADR pre-read and CORS pre-flags live — search for `topology.yaml` is absent, search for `scripts/adr-context.sh` to find the preflag block). Add this single bullet to that obligations list:

```markdown
- Touching `infra/**`, `terraform/**`, a `*/api/deploy/**` chart, or
  adding a bounded context? Update `docs/infra/topology.yaml` so the
  README infra diagrams regenerate — `readme-diagrams-drift` gates it.
  Run `make diagrams` and commit the README change in the same PR.
```

- [ ] **Step 4: Verify nothing else references the gate inconsistently**

Run: `grep -rn "readme-diagrams-drift\|infra_diagrams\|topology.yaml" CLAUDE.md .claude/skills/dispatch/SKILL.md`
Expected: shows the three references just added, all spelled consistently.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .claude/skills/dispatch/SKILL.md
git commit -s -m "docs(infra-diagrams): register topology descriptor in CLAUDE.md and dispatch skill"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `python -m pytest scripts/infra_diagrams/ -v`
Expected: all tests pass.

- [ ] **Confirm the drift gate is green end-to-end**

Run: `make diagrams && git diff --exit-code -- README.md && echo "clean"`
Expected: prints `clean`.

- [ ] **Confirm coherence fails loudly on a simulated new chart** (sanity check the gate has teeth)

Run:
```bash
mkdir -p /tmp/cov && cp -r infra/nats infra/_tmpchart 2>/dev/null; \
sed -i.bak 's/^name:.*/name: zzz-temp-chart/' infra/_tmpchart/Chart.yaml; \
python3 scripts/infra_diagrams/generate.py --check; echo "exit=$?"; \
rm -rf infra/_tmpchart
```
Expected: prints a coherence error naming `zzz-temp-chart` and `exit=2`. (Cleanup removes the temp chart.)

---

## Notes for the implementer

- **Why no `__init__.py`:** see the Import note in the header. Adding one breaks pytest's bare-name imports.
- **Determinism:** every render iterates the descriptor's lists in file order and the charts via `sorted(glob(...))`. Do not introduce set-iteration into rendered output (sets are fine for coherence *checks*, never for emitted lines).
- **Mermaid label safety:** node *ids* are sanitized by `_safe()`; node *labels* and edge labels come straight from the descriptor. Keep descriptor labels free of characters Mermaid treats specially (`[`, `]`, `(`, `)`, `|`, `{`, `}`). The current descriptor labels are all safe; if a future label needs one, quote it in the descriptor and adjust `render` to wrap labels in quotes.
- **PR split:** if landing as two PRs, Tasks 1–6 form a self-contained PR (generator + tests + Makefile, README untouched), and Tasks 7–9 the second (README + CI gate + culture). Each stays under the 400-line cap.
