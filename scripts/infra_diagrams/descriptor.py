from __future__ import annotations

from dataclasses import dataclass, field
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
    observability: dict = field(default_factory=dict)
    cluster_external: list[dict] = field(default_factory=list)

    def service_ids(self) -> set[str]:
        return {s["id"] for s in self.services}

    def cloud_ids(self) -> set[str]:
        return {c["id"] for c in self.cloud}

    def cluster_external_ids(self) -> set[str]:
        return {n["id"] for n in self.cluster_external}

    def observability_node_ids(self) -> set[str]:
        return {n["id"] for n in self.observability.get("nodes") or []}


def load_topology(path: Path = DESCRIPTOR_PATH) -> Topology:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return Topology(
        services=raw.get("services") or [],
        cloud=raw.get("cloud") or [],
        cluster_edges=raw.get("cluster_edges") or [],
        flow_edges=raw.get("flow_edges") or [],
        deploy_edges=raw.get("deploy_edges") or [],
        clue_pipeline=raw.get("clue_pipeline") or [],
        observability=raw.get("observability") or {},
        cluster_external=raw.get("cluster_external") or [],
    )


def check_coherence(
    topo: Topology,
    charts: list[Chart],
    tf_types: set[str],
    workflow_ids: set[str],
) -> None:
    _check_chart_coverage(topo, charts)
    _check_service_ids(topo, charts)
    _check_tf_coverage(topo, tf_types)
    _check_edge_endpoints(topo, workflow_ids)
    _check_observability_endpoints(topo)


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


def _check_service_ids(topo: Topology, charts: list[Chart]) -> None:
    context_by_chart = {c.name: c.path.parts[0] for c in charts if c.kind == "api"}
    for svc in topo.services:
        chart_name = svc["chart"]
        if chart_name in context_by_chart:
            expected_id = context_by_chart[chart_name]
            if svc["id"] != expected_id:
                raise CoherenceError(
                    f"service id {svc['id']!r} must equal bounded-context name"
                    f" {expected_id!r} (chart {chart_name!r})"
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
    valid = (
        topo.service_ids()
        | topo.cloud_ids()
        | topo.cluster_external_ids()
        | {"browser"}
    )
    for edge in topo.cluster_edges + topo.flow_edges:
        for end in (edge["from"], edge["to"]):
            if end not in valid:
                raise CoherenceError(f"edge endpoint not a known id: {end!r}")
    for edge in topo.deploy_edges:
        if edge["from"] not in valid | workflow_ids:
            raise CoherenceError(f"deploy edge 'from' unknown: {edge['from']!r}")
        if edge["to"] not in valid:
            raise CoherenceError(f"deploy edge 'to' unknown: {edge['to']!r}")


def _check_observability_endpoints(topo: Topology) -> None:
    valid = topo.observability_node_ids()
    for edge in topo.observability.get("edges") or []:
        for end in (edge["from"], edge["to"]):
            if end not in valid:
                raise CoherenceError(f"observability edge endpoint not a known node: {end!r}")
