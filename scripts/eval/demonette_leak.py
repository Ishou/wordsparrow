"""Démonette derivational-leak check (ADR-0121).

Offline mint-time gate: flags a clue whose token is derivationally related (≤2 hops) to the
answer per the private Démonette leak graph. No-ops (returns None / empty) when the graph
artifact is absent, so public CI stays on the string-stem floor."""
from __future__ import annotations

import csv
import os
import re
from pathlib import Path

# French word tokens (letters incl. accents + ligatures); no digits/underscore.
_TOKEN_RE = re.compile(r"[A-Za-zÀ-ÿŒœ]+")

_DEFAULT_GRAPH = Path(
    os.environ.get(
        "DEMONETTE_LEAK_GRAPH", "data/external/demonette/derived/demonette_leak.csv"
    )
)
_DEFAULT_LEXIQUE = Path(
    os.environ.get("GRAMMALECTE_LEXIQUE", "data/lexique-grammalecte-fr-v7.7.txt")
)

_GRAPH: dict[str, frozenset[str]] | None = None
_GRAPH_TRIED = False
_INDEX = None
_INDEX_TRIED = False


def load_leak_graph(path: Path) -> dict[str, frozenset[str]]:
    """answer_lemma -> related_lemmas from the ingest artifact. {} when the file is absent."""
    if not path.exists():
        return {}
    acc: dict[str, set[str]] = {}
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            answer = (row.get("answer_lemma") or "").strip().lower()
            related = (row.get("related_lemma") or "").strip().lower()
            if answer and related:
                acc.setdefault(answer, set()).add(related)
    return {k: frozenset(v) for k, v in acc.items()}


def _get_graph() -> dict[str, frozenset[str]]:
    global _GRAPH, _GRAPH_TRIED
    if not _GRAPH_TRIED:
        _GRAPH_TRIED = True
        _GRAPH = load_leak_graph(_DEFAULT_GRAPH)
    return _GRAPH or {}


def _get_index():
    """Lazy MorphologyIndex; None when the grammalecte lexique is unavailable."""
    global _INDEX, _INDEX_TRIED
    if not _INDEX_TRIED:
        _INDEX_TRIED = True
        try:
            from morphology_index import MorphologyIndex  # same dir (scripts/eval)
            _INDEX = MorphologyIndex.load(_DEFAULT_LEXIQUE) if _DEFAULT_LEXIQUE.exists() else None
        except Exception:  # noqa: BLE001 — any load failure degrades to no lemmatisation
            _INDEX = None
    return _INDEX


def _token_lemmas(token: str, index) -> set[str]:
    """Candidate lemmas of a surface token; falls back to the token itself when no index."""
    lowered = token.lower()
    if index is not None:
        lemmas = {lemma for lemma, _ in index.lookup_form(lowered)}
        if lemmas:
            return lemmas
    return {lowered}


def is_derivational_leak(clue: str, target_lemma: str, graph, index) -> str | None:
    """Offending clue token if any of its lemmas is a ≤2-hop derivational relative of
    target_lemma per `graph`; None otherwise (and when graph/related is empty)."""
    related = graph.get(target_lemma.lower().strip()) if graph else None
    if not related:
        return None
    for token in _TOKEN_RE.findall(clue):
        if _token_lemmas(token, index) & related:
            return token
    return None


def derivational_leak_token(clue: str, target_lemma: str) -> str | None:
    """Lazy wrapper for the gates: uses the module-singleton graph + index.

    Short-circuits on an absent/empty graph before building the index, so the
    no-op path never pays for a MorphologyIndex load (ADR-0121 offline gate)."""
    graph = _get_graph()
    if not graph:
        return None
    return is_derivational_leak(clue, target_lemma, graph, _get_index())
