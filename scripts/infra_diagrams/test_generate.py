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
