from __future__ import annotations

import re
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
