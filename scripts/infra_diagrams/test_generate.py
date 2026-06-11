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
    assert charts["bliss-nats"].kind == "infra"


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
    assert apps["bliss-nats"].kind == "infra"
    assert apps["bliss-nats"].has_db is False
