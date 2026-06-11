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
        clue_pipeline={},
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


def test_coherence_fails_when_api_service_id_mismatches_context() -> None:
    topo = _topo(services=[
        {"id": "grid-svc", "label": "grid-api", "chart": "wordsparrow-api", "group": "APIs"},
        {"id": "ingress", "label": "ingress-nginx", "chart": "platform", "group": "Edge"},
    ])
    try:
        descriptor.check_coherence(topo, _charts(), {"cloudflare_pages_project"}, {"deploy-frontend"})
    except descriptor.CoherenceError as exc:
        assert "grid-svc" in str(exc) and "grid" in str(exc)
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


def test_render_cluster_groups_each_context_with_its_db() -> None:
    out = render.render_cluster(_topo(), _apps())
    assert out.startswith("flowchart LR")
    assert "subgraph Edge" in out                 # shared infra kept
    assert 'subgraph ctx_grid["grid"]' in out     # one box per bounded context
    assert 'gridDB[("grid pg")]' in out           # cylinder shape for postgres
    assert "grid --> gridDB" in out               # api -> pg, inside the context box
    assert "ingress -->|HTTP| grid" in out


def test_render_cluster_unlabeled_edge_is_plain_arrow() -> None:
    out = render.render_cluster(
        _topo(cluster_edges=[{"from": "ingress", "to": "grid"}]), _apps()
    )
    assert "ingress --> grid" in out
    assert "ingress -->|" not in out


def test_render_cluster_dashed_external_edge() -> None:
    out = render.render_cluster(
        _topo(
            cluster_external=[{"id": "cluepipeline", "label": "clue AI pipeline (local)"}],
            cluster_edges=[
                {"from": "grid", "to": "cluepipeline", "label": "manual export", "style": "dashed"}
            ],
        ),
        _apps(),
    )
    assert 'cluepipeline["clue AI pipeline (local)"]' in out
    assert "grid -. manual export .-> cluepipeline" in out


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


def test_render_clue_renders_nodes_and_loop_edge() -> None:
    out = render.render_clue(_topo(clue_pipeline={
        "nodes": [{"id": "gen", "label": "Generate"}, {"id": "sft", "label": "SFT"}],
        "edges": [
            {"from": "gen", "to": "sft"},
            {"from": "sft", "to": "gen", "label": "next round", "style": "dashed"},
        ],
    }))
    assert out.startswith("flowchart LR")
    assert 'gen["Generate"]' in out
    assert "gen --> sft" in out
    assert "sft -. next round .-> gen" in out


def test_render_is_deterministic() -> None:
    assert render.render_cluster(_topo(), _apps()) == render.render_cluster(_topo(), _apps())


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


def test_inject_emits_centered_caption() -> None:
    text = (
        "<!-- INFRA-DIAGRAM:cluster START -->\n"
        "<!-- INFRA-DIAGRAM:cluster END -->\n"
    )
    out = readme_mod.inject(text, "cluster", "flowchart LR", "<b>Figure 1.</b> A caption")
    assert '<p align="center"><sub><b>Figure 1.</b> A caption</sub></p>' in out
    assert out.index("```") < out.index("<p align")  # caption sits below the diagram


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


def test_build_readme_emits_styling() -> None:
    skeleton = "\n".join(
        f"<!-- INFRA-DIAGRAM:{m} START -->\n<!-- INFRA-DIAGRAM:{m} END -->"
        for m in readme_mod.MARKER_IDS
    ) + "\n"
    out = generate.build_readme(skeleton)
    assert "classDef data fill:#c8945633,stroke:#a87538;" in out
    assert "style ctx_grid fill:#6a93581f,stroke:#6a9358;" in out
    assert "style Cloud fill:#b8554020,stroke:#b85540;" in out


_OBS = {
    "nodes": [
        {"id": "grid", "label": "grid-api", "group": "Sources"},
        {"id": "collector", "label": "OTel collector", "group": "Ingest"},
        {"id": "signoz", "label": "SigNoz", "group": "Backend"},
    ],
    "edges": [
        {"from": "grid", "to": "collector", "label": "otel"},
        {"from": "collector", "to": "signoz", "label": "ingest"},
    ],
}


def test_render_observability_groups_sources_and_edges() -> None:
    out = render.render_observability(_topo(observability=_OBS))
    assert out.startswith("flowchart LR")
    assert "subgraph Sources" in out and "subgraph Backend" in out
    assert 'grid["grid-api"]' in out
    assert "grid -->|otel| collector" in out


def test_observability_coherence_fails_on_dangling_endpoint() -> None:
    bad = {"nodes": _OBS["nodes"], "edges": [{"from": "grid", "to": "ghost", "label": "x"}]}
    try:
        descriptor.check_coherence(
            _topo(observability=bad), _charts(),
            {"cloudflare_pages_project"}, {"deploy-frontend"},
        )
    except descriptor.CoherenceError as exc:
        assert "ghost" in str(exc)
    else:
        raise AssertionError("expected CoherenceError")


def test_clue_coherence_fails_on_dangling_endpoint() -> None:
    bad = {"nodes": [{"id": "gen", "label": "G"}], "edges": [{"from": "gen", "to": "ghost"}]}
    try:
        descriptor.check_coherence(
            _topo(clue_pipeline=bad), _charts(),
            {"cloudflare_pages_project"}, {"deploy-frontend"},
        )
    except descriptor.CoherenceError as exc:
        assert "ghost" in str(exc)
    else:
        raise AssertionError("expected CoherenceError")


def test_render_escapes_quote_in_label() -> None:
    out = render.render_clue(_topo(clue_pipeline={
        "nodes": [{"id": "x", "label": 'a "quoted" label'}],
        "edges": [],
    }))
    assert "#quot;quoted#quot;" in out
    assert '"quoted"' not in out  # raw quote did not leak into the fence


def test_safe_is_injective_over_real_descriptor() -> None:
    topo = descriptor.load_topology()
    ids = {s["id"] for s in topo.services}
    ids |= {c["id"] for c in topo.cloud}
    ids |= {n["id"] for n in topo.cluster_external}
    ids |= {n["id"] for n in topo.observability.get("nodes") or []}
    ids |= {n["id"] for n in topo.clue_pipeline.get("nodes") or []}
    assert len({render._safe(i) for i in ids}) == len(ids)


import style


def test_node_classdefs_emit_in_fixed_order() -> None:
    assert style.node_classdefs({"data", "context"}) == [
        "  classDef context fill:#6a935826,stroke:#6a9358;",
        "  classDef data fill:#c8945633,stroke:#a87538;",
    ]


def test_node_classdefs_skips_roles_without_node_fill() -> None:
    assert style.node_classdefs({"infra"}) == []  # infra has zone fill only


def test_zone_uses_translucent_fill_and_stroke() -> None:
    assert style.zone("Edge", "infra") == "  style Edge fill:#5a655a1f,stroke:#8b9488;"


def test_assign_joins_ids() -> None:
    assert style.assign(["a", "b"], "data") == "  class a,b data;"


def test_flat_node_styles_groups_by_role_deterministically() -> None:
    out = style.flat_node_styles(
        ["grid", "game", "nats"],
        {"grid": "context", "game": "context", "nats": "messaging"},
    )
    assert out == [
        "  classDef context fill:#6a935826,stroke:#6a9358;",
        "  classDef messaging fill:#a8753826,stroke:#c89456;",
        "  class grid,game context;",
        "  class nats messaging;",
    ]


def test_group_role_covers_known_groups() -> None:
    assert style.GROUP_ROLE["Sources"] == "context"
    assert style.GROUP_ROLE["Cloud"] == "external"
    assert style.GROUP_ROLE["Edge"] == "infra"


def test_render_cluster_styles_db_and_context_zone() -> None:
    out = render.render_cluster(_topo(), _apps())
    assert "  classDef data fill:#c8945633,stroke:#a87538;" in out
    assert "  class gridDB data;" in out
    assert "  style ctx_grid fill:#6a93581f,stroke:#6a9358;" in out
    assert "  style Edge fill:#5a655a1f,stroke:#8b9488;" in out


def test_render_cluster_external_node_gets_terracotta() -> None:
    out = render.render_cluster(
        _topo(
            cluster_external=[{"id": "cluepipeline", "label": "clue AI (local)"}],
            cluster_edges=[
                {"from": "grid", "to": "cluepipeline", "label": "x", "style": "dashed"}
            ],
        ),
        _apps(),
    )
    assert "  classDef external fill:#b8554022,stroke:#b85540;" in out
    assert "  class cluepipeline external;" in out


def test_render_cloud_zones_ci_and_cloud() -> None:
    out = render.render_cloud(_topo())
    assert "  style Cloud fill:#b8554020,stroke:#b85540;" in out
    assert "  style CI fill:#5a655a1f,stroke:#8b9488;" in out


def test_render_flow_role_tints() -> None:
    out = render.render_flow(_topo(flow_edges=[
        {"from": "ingress", "to": "grid"},
        {"from": "grid", "to": "nats", "label": "PuzzleReady event"},
        {"from": "nats", "to": "game", "label": "consumed by"},
    ]))
    assert "  classDef context fill:#6a935826,stroke:#6a9358;" in out
    assert "  class grid,game context;" in out
    assert "  class nats messaging;" in out


def test_render_observability_zones_and_clickhouse_data() -> None:
    obs = {
        "nodes": _OBS["nodes"]
        + [{"id": "clickhouse", "label": "ClickHouse", "group": "Backend"}],
        "edges": _OBS["edges"],
    }
    out = render.render_observability(_topo(observability=obs))
    assert "  style Sources fill:#6a93581f,stroke:#6a9358;" in out
    assert "  style Backend fill:#5a655a1f,stroke:#8b9488;" in out
    assert "  classDef data fill:#c8945633,stroke:#a87538;" in out
    assert "  class clickhouse data;" in out


def test_render_clue_role_tints() -> None:
    out = render.render_clue(_topo(clue_pipeline={
        "nodes": [
            {"id": "gen", "label": "G"}, {"id": "sft", "label": "S"},
            {"id": "human", "label": "H"}, {"id": "grid", "label": "C"},
        ],
        "edges": [],
    }))
    assert "  class gen,sft context;" in out
    assert "  class human messaging;" in out
    assert "  class grid data;" in out
