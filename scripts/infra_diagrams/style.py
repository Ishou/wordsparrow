from __future__ import annotations

# Forest/honey palette (ADR-0043); translucent 8-digit hex — no rgba(), its commas break Mermaid's parser.
_ROLES: dict[str, dict[str, str | None]] = {
    "context":   {"zone": "#6a93581f", "node": "#6a935826", "stroke": "#6a9358"},
    "data":      {"zone": None,        "node": "#c8945633", "stroke": "#a87538"},
    "messaging": {"zone": "#a875381f", "node": "#a8753826", "stroke": "#c89456"},
    "external":  {"zone": "#b8554020", "node": "#b8554022", "stroke": "#b85540"},
    "infra":     {"zone": "#5a655a1f", "node": None,        "stroke": "#8b9488"},
}

# Fixed emission order keeps render output deterministic regardless of input.
_ROLE_ORDER = ("context", "data", "messaging", "external", "infra")

# Subgraph group -> zone role; context subgraphs (ctx_*) are styled green by the cluster renderer.
GROUP_ROLE: dict[str, str] = {
    "Edge": "infra",
    "Messaging": "messaging",
    "CI": "infra",
    "Cloud": "external",
    "Sources": "context",
    "Ingest": "infra",
    "Backend": "infra",
    "Analytics": "messaging",
    "Alerting": "external",
}


def node_classdefs(roles: set[str]) -> list[str]:
    return [
        f"  classDef {r} fill:{_ROLES[r]['node']},stroke:{_ROLES[r]['stroke']};"
        for r in _ROLE_ORDER
        if r in roles and _ROLES[r]["node"] is not None
    ]


def assign(node_ids: list[str], role: str) -> str:
    return f"  class {','.join(node_ids)} {role};"


def zone(subgraph_id: str, role: str) -> str:
    spec = _ROLES[role]
    return f"  style {subgraph_id} fill:{spec['zone']},stroke:{spec['stroke']};"


# `default` classDef gives plain nodes a border GitHub's dark theme omits.
def node_default_border() -> str:
    return "  classDef default stroke:#6b7fd7,stroke-width:1.5px;"


def flat_node_styles(node_ids: list[str], role_by_id: dict[str, str]) -> list[str]:
    """classDef + class lines for a subgraph-less diagram, deterministically."""
    present = [
        r for r in _ROLE_ORDER if any(role_by_id.get(n) == r for n in node_ids)
    ]
    lines = node_classdefs(set(present))
    for r in present:
        ids = [n for n in node_ids if role_by_id.get(n) == r]
        lines.append(assign(ids, r))
    return lines
