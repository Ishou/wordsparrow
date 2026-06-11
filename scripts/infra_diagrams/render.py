from __future__ import annotations

from parse import AppNode
from descriptor import Topology
import style


def _safe(node_id: str) -> str:
    return node_id.replace("-", "_").replace(".", "_")


def _label(text: str) -> str:
    # `"` would close the Mermaid node-label quote; #quot; is its entity escape.
    return text.replace('"', "#quot;")


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
            lines.append(f'    {_safe(s["id"])}["{_label(s["label"])}"]')
        lines.append("  end")

    # One subgraph per bounded context, holding its api + its Postgres.
    for s in topo.services:
        if s["id"] not in contexts:
            continue
        ctx = _safe(s["id"])
        lines.append(f'  subgraph ctx_{ctx}["{_label(s["id"])}"]')
        lines.append(f'    {ctx}["{_label(s["label"])}"]')
        if db.get(s["id"]):
            lines.append(f'    {ctx}DB[("{_label(s["id"])} pg")]')
            lines.append(f"    {ctx} --> {ctx}DB")
        lines.append("  end")

    for ext in topo.cluster_external:
        lines.append(f'  {_safe(ext["id"])}["{_label(ext["label"])}"]')
    for e in topo.cluster_edges:
        lines.append(f"  {_edge(e)}")

    roles: set[str] = set()
    assigns: list[str] = []
    db_ids = [
        f"{_safe(s['id'])}DB"
        for s in topo.services
        if s["id"] in contexts and db.get(s["id"])
    ]
    if db_ids:
        roles.add("data")
        assigns.append(style.assign(db_ids, "data"))
    ext_ids = [_safe(x["id"]) for x in topo.cluster_external]
    if ext_ids:
        roles.add("external")
        assigns.append(style.assign(ext_ids, "external"))

    zones = [
        style.zone(group, style.GROUP_ROLE[group])
        for group in shared
        if group in style.GROUP_ROLE
    ]
    zones += [
        style.zone(f"ctx_{_safe(s['id'])}", "context")
        for s in topo.services
        if s["id"] in contexts
    ]

    lines.extend(style.node_classdefs(roles))
    lines.extend(assigns)
    lines.extend(zones)
    return "\n".join(lines)


def _edge(e: dict) -> str:
    label = e.get("label")
    if e.get("style") == "dashed":
        arrow = f"-. {label} .->" if label else "-.->"
    else:
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
            lines.append(f'    {_safe(w)}["{_label(w)}.yml"]')
        lines.append("  end")
    lines.append("  subgraph Cloud")
    for c in topo.cloud:
        lines.append(f'    {_safe(c["id"])}["{_label(c["label"])}"]')
    lines.append("  end")
    for e in topo.deploy_edges:
        lines.append(f"  {_edge(e)}")
    if workflows:
        lines.append(style.zone("CI", "infra"))
    lines.append(style.zone("Cloud", "external"))
    return "\n".join(lines)


_FLOW_ROLE = {"grid": "context", "game": "context", "nats": "messaging"}


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
        lines.append(f'  {_safe(n)}["{_label(labels.get(n, n))}"]')
    for e in topo.flow_edges:
        lines.append(f"  {_edge(e)}")
    ordered = [_safe(n) for n in nodes]
    role_by_id = {_safe(n): _FLOW_ROLE[n] for n in nodes if n in _FLOW_ROLE}
    lines.extend(style.flat_node_styles(ordered, role_by_id))
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
            lines.append(f'    {_safe(n["id"])}["{_label(n["label"])}"]')
        lines.append("  end")
    for e in edges:
        lines.append(f"  {_edge(e)}")
    return "\n".join(lines)


def render_clue(topo: Topology) -> str:
    nodes = topo.clue_pipeline.get("nodes") or []
    edges = topo.clue_pipeline.get("edges") or []
    lines = ["flowchart LR"]
    for n in nodes:
        lines.append(f'  {_safe(n["id"])}["{_label(n["label"])}"]')
    for e in edges:
        lines.append(f"  {_edge(e)}")
    return "\n".join(lines)
