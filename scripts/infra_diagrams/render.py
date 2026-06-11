from __future__ import annotations

from parse import AppNode
from descriptor import Topology


def _safe(node_id: str) -> str:
    return node_id.replace("-", "_").replace(".", "_")


def _db_by_context(apps: list[AppNode]) -> dict[str, bool]:
    return {a.context: a.has_db for a in apps if a.kind == "api"}


def render_cluster(topo: Topology, apps: list[AppNode]) -> str:
    db = _db_by_context(apps)
    contexts = {a.context for a in apps if a.kind == "api"}
    lines = ["flowchart LR"]

    # Shared infra only; observability group is owned by the dedicated observability diagram.
    shared: dict[str, list[dict]] = {}
    for s in topo.services:
        if s["id"] in contexts or s["group"] == "Observability":
            continue
        shared.setdefault(s["group"], []).append(s)
    for group, svcs in shared.items():
        lines.append(f"  subgraph {group}")
        for s in svcs:
            lines.append(f'    {_safe(s["id"])}["{s["label"]}"]')
        lines.append("  end")

    # One subgraph per bounded context, holding its api + its Postgres.
    for s in topo.services:
        if s["id"] not in contexts:
            continue
        ctx = _safe(s["id"])
        lines.append(f'  subgraph ctx_{ctx}["{s["id"]}"]')
        lines.append(f'    {ctx}["{s["label"]}"]')
        if db.get(s["id"]):
            lines.append(f'    {ctx}DB[("{s["id"]} pg")]')
            lines.append(f"    {ctx} --> {ctx}DB")
        lines.append("  end")

    for e in topo.cluster_edges:
        lines.append(f"  {_edge(e)}")
    return "\n".join(lines)


def _edge(e: dict) -> str:
    label = e.get("label")
    arrow = f"-->|{label}|" if label else "-->"
    return f'{_safe(e["from"])} {arrow} {_safe(e["to"])}'


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


def render_observability(topo: Topology) -> str:
    nodes = topo.observability.get("nodes") or []
    edges = topo.observability.get("edges") or []
    lines = ["flowchart LR"]
    groups: dict[str, list[dict]] = {}
    for n in nodes:
        groups.setdefault(n["group"], []).append(n)
    for group, ns in groups.items():
        lines.append(f"  subgraph {group}")
        for n in ns:
            lines.append(f'    {_safe(n["id"])}["{n["label"]}"]')
        lines.append("  end")
    for e in edges:
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
