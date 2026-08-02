# Démonette derivational-leak filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject clues that leak the answer through a derivational relative (`filer` ← "…en **fil**", `délimiter` ← "…les **limites**"), using Démonette-2 ≤2-hop relations, augmenting the existing string stem-leak check.

**Architecture:** A private, gitignored build step turns the Démonette dump into a small corpus-scoped `answer_lemma → related_lemma` map (≤2 hops, `motiv-sem`/`accidentel` excluded). A pure `is_derivational_leak(clue, target_lemma, graph, index)` lemmatises each clue token via the existing `MorphologyIndex` and flags a hit. It wires into both clue gates (`pipeline_v2/filters.py` and `validate_clue.py`) and **no-ops when the graph artifact is absent**, so public CI stays on the string floor. A one-shot audit finds existing leaks in the shipped corpus.

**Tech Stack:** Python 3.12, stdlib only (`csv`, `collections`, `argparse`); pytest. Reuses `scripts/eval/morphology_index.py` and `scripts/demonette/ingest.py` helpers. Design spec: `docs/superpowers/specs/2026-08-02-demonette-derivational-leak-filter-design.md`.

## Global Constraints

- **No Démonette/DBnary content ships.** The dump and every derived artifact live under `data/external/` (already gitignored) — never committed, never in an image (ADR-0058 SA posture; ADR-0119).
- **No-op when the graph is absent.** Every consumer must return "accept / no leak" if `data/external/demonette/derived/demonette_leak.csv` is missing (public CI has neither the graph nor the grammalecte lexique). This is the CI-safety invariant; it has its own test.
- **Augment, never replace.** The existing `_find_stem_leak` / `filter_9_stem_leak` stay exactly as they are; this adds a parallel layer.
- **Leak graph excludes `complexite ∈ {accidentel, motiv-sem}`** and uses **hop bound = 2**.
- **Scope = derivational leaks only.** No acronym/meta rules, no grid dedup, no propagation.
- **Commits:** conventional + bounded scope + DCO sign-off (`git commit -s`). Scope token `clue-ai` for pipeline files, `docs(adr)` for the ADR. End messages with the Co-Authored-By trailer.
- **File-location note (refines spec):** the leak module goes in `scripts/eval/demonette_leak.py` (co-located with `morphology_index.py` + `validate_clue.py`), not `pipeline_v2/`, so both gates import it without a `pipeline_v2 → eval` inversion.

---

### Task 1: ADR-0121 + registry

**Files:**
- Create: `docs/adr/0121-morphological-clue-leak-detection.md`
- Modify: `docs/adr/INDEX.md` (append ADR-0121 path rows near the ADR-0119/0120 block, ~line 391-395)

**Interfaces:**
- Produces: the accepted decision this whole plan implements. No code symbols.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0121-morphological-clue-leak-detection.md`:

```markdown
# ADR-0121: Morphological clue-leak detection (Démonette)

## Status
Accepted

## Context
The clue leak gate is string-based (`_find_stem_leak` / `filter_9_stem_leak`:
LCP ≥ 5 or mutual substring). It misses prefix-masked and short-root
derivational leaks — a clue token sharing a *root* with the answer through
derivation, not surface spelling. Verified against the 6 prod
`definition_revele` signalements, the string check catches **zero** of them
(`FILENT` ← "…en fil", `DELIMITERA` ← "…les limites", …). ADR-0119 adopted
Démonette-2 and scoped this as roadmap item 2. This ADR is that item.

## Decision
Add a derivational-leak check using the Démonette-2 relation graph:
reject a clue when any clue token's lemma is derivationally related to the
answer's lemma within **≤2 hops**.

- **Relatedness = direct edge + ≤2 hops.** Measured: `délimiter → limite`
  is 2 hops (direct-only would miss it); ≤2-hop neighbourhoods are small
  (median 5, p90 12; 0.4 % exceed 30), so giant-family FP risk is negligible.
- **Augment, not replace.** Keep the string stem-leak as the always-on floor;
  add Démonette as a parallel layer. Leak coverage (answer-lemma is a
  Démonette node) is 76.2 %; the uncovered 24 % is dominated by underived
  base words (nothing to leak) but includes real derived words where the
  string check is the only backstop.
- **Exclude `complexite ∈ {motiv-sem, accidentel}`** from the leak graph.
  `accidentel` = false friends; `motiv-sem` = suppletive pairs
  (`école`/`scolaire`) that share no letters, so they are not spelling
  reveals and including them over-rejects legitimate semantic clues.
- **Offline mint-time gate.** The Démonette graph is private (SA, ADR-0058),
  absent from public CI, so the check runs where the clue pipeline has the
  artifact (like the LLM judge). Consumers no-op when the graph is absent;
  the string floor stays the CI gate.
- **Scope = derivational leaks only.** Acronym-decomposition (`NO` = nord-ouest)
  and meta-orthographic (`CA` = "Ça sans cédille") leaks are a separate
  follow-up.

## Alternatives rejected
- **Generic prefix-stripping** (strip `re/pré/dé/…`, check residue is valid,
  run the leak check on it): measured ≈50–60 % false-positive rate over the
  corpus — French's Latinate stratum is full of pseudo-prefixed words whose
  residue is a real but unrelated word (`répondre`≠`pondre`,
  `imposer`≠`poser`, `surface`≠`face`). The "valid residue" gate does not
  help. And it cannot close the target gap (`recapitaliser` is absent from
  Démonette, so there is no edge to confirm the strip).
- **Lemma-aware substring containment** (flag if the clue-token lemma is a
  substring of the answer, min length 6): catches `recapitaliser ⊃ capital`
  but equally flags `pardonner ⊃ donner`, `comprendre ⊃ prendre` (opaque
  false friends). It cannot separate these from the real case without a
  derivation database — discarding Démonette's core precision.

`recapitaliser → capitaux` is a documented residual miss (absent from
Démonette; the string floor misses it too). Closing it soundly means
improving Démonette coverage — a separate workstream, not a string heuristic.

## Consequences
- **Easier:** principled derivational-leak detection replacing substring luck
  where Démonette has coverage; the reported live leaks become findable via
  the audit.
- **Harder / new:** a private build artifact to regenerate on a Démonette or
  corpus bump; best-effort (76 % coverage), not a guarantee.
- **Different:** the same Démonette resource both gates clues (here) and, in
  future roadmap items, generates them (propagation).
```

- [ ] **Step 2: Register the paths in INDEX.md**

Add these rows to `docs/adr/INDEX.md` immediately after the ADR-0120 rows (~line 395), matching the existing `ADR-NNNN  <path>  <description>` column style:

```
ADR-0121  data/external/demonette/derived/demonette_leak.csv  Corpus-scoped ≤2-hop derivational-leak graph (answer_lemma→related_lemma,hop); private/gitignored SA artifact built from the Démonette dump; consumed by the clue leak gate
ADR-0121  scripts/demonette/build_leak_graph.py    Builds the ≤2-hop leak graph from Démonette relations + the runtime corpus, excluding complexite in {accidentel, motiv-sem}
ADR-0121  scripts/eval/demonette_leak.py           Leak-graph loader + is_derivational_leak(): flags a clue token derivationally related (≤2 hops) to the answer; no-ops when the private graph is absent
ADR-0121  scripts/clue_generation/audit_derivational_leaks.py  One-shot audit reporting existing derivational leaks in the committed words-fr.csv
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0121-morphological-clue-leak-detection.md docs/adr/INDEX.md
git commit -s -m "docs(adr): ADR-0121 morphological clue-leak detection (Démonette item 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Leak-graph builder

**Files:**
- Create: `scripts/demonette/build_leak_graph.py`
- Test: `scripts/demonette/test_build_leak_graph.py`

**Interfaces:**
- Consumes: `scripts/demonette/ingest.py::load_corpus_lemmas(path) -> set[str]`.
- Produces:
  - `build_adjacency(relations_path: Path) -> dict[str, set[str]]` — undirected lemma adjacency, `accidentel`+`motiv-sem` excluded.
  - `neighbours(adj: dict[str,set[str]], src: str, max_hop: int = 2) -> dict[str, int]` — related_lemma → hop, excluding src.
  - `build_leak_rows(adj, corpus: set[str], max_hop: int = 2) -> list[tuple[str, str, int]]` — sorted `(answer_lemma, related_lemma, hop)`, answers restricted to `corpus`.
  - Output CSV header `["answer_lemma", "related_lemma", "hop"]` at `data/external/demonette/derived/demonette_leak.csv`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/demonette/test_build_leak_graph.py`:

```python
"""Tests for the Démonette ≤2-hop leak-graph builder."""
from __future__ import annotations
import csv, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_leak_graph import build_adjacency, neighbours, build_leak_rows  # noqa: E402

# graph_1, graph_2, complexite are the only columns the builder reads (tab-separated).
REL_HEADER = ["graph_1", "graph_2", "complexite"]
REL_ROWS = [
    ["filer", "fil", "simple"],           # kept
    ["fil", "filet", "simple"],           # kept -> fil is a 2-hop bridge filer..filet
    ["école", "scolaire", "motiv-sem"],   # dropped (suppletive)
    ["laver", "école", "accidentel"],     # dropped (false friend)
    ["capitaliser", "capital", "simple"], # kept, capital out of corpus (leak side may be non-corpus)
]

def _write_rel(tmp_path):
    p = tmp_path / "relations.csv"
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(REL_HEADER)
        w.writerows(REL_ROWS)
    return p

def test_adjacency_excludes_motivsem_and_accidentel(tmp_path):
    adj = build_adjacency(_write_rel(tmp_path))
    assert adj["filer"] == {"fil"}
    assert adj["fil"] == {"filer", "filet"}
    assert "école" not in adj          # both its edges were dropped
    assert "scolaire" not in adj

def test_neighbours_two_hops(tmp_path):
    adj = build_adjacency(_write_rel(tmp_path))
    nb = neighbours(adj, "filer", max_hop=2)
    assert nb == {"fil": 1, "filet": 2}   # src excluded, filet reached at hop 2

def test_leak_rows_corpus_scoped_answers_relatives_may_be_noncorpus(tmp_path):
    adj = build_adjacency(_write_rel(tmp_path))
    corpus = {"filer", "capitaliser"}     # answers; 'capital' NOT in corpus
    rows = build_leak_rows(adj, corpus, max_hop=2)
    assert ("filer", "fil", 1) in rows
    assert ("filer", "filet", 2) in rows
    assert ("capitaliser", "capital", 1) in rows   # relative is out-of-corpus, still kept
    assert all(r[0] in corpus for r in rows)        # answers restricted to corpus
    assert rows == sorted(rows)                      # deterministic order
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/demonette/test_build_leak_graph.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_leak_graph'`.

- [ ] **Step 3: Write the builder**

Create `scripts/demonette/build_leak_graph.py`:

```python
"""Build the ≤2-hop Démonette leak graph, excluding accidentel/motiv-sem (ADR-0121)."""
from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict, deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import load_corpus_lemmas  # noqa: E402

DEFAULT_RELATIONS = Path("data/external/demonette/relations.csv")
MOCK_CORPUS = Path("grid/api/src/test/resources/mock-corpus/words/words-fr.csv")
_real_corpus_dir = os.environ.get("WORDSPARROW_REAL_CORPUS_DIR")
DEFAULT_CORPUS = (
    Path(_real_corpus_dir) / "words" / "words-fr.csv" if _real_corpus_dir else MOCK_CORPUS
)
DEFAULT_OUT = Path("data/external/demonette/derived/demonette_leak.csv")
# accidentel = false friends; motiv-sem = suppletive (share no letters, not a spelling leak).
DROPPED_COMPLEXITE = frozenset({"accidentel", "motiv-sem"})
HOPS = 2
HEADER = ["answer_lemma", "related_lemma", "hop"]


def build_adjacency(relations_path: Path) -> dict[str, set[str]]:
    """Undirected lemma adjacency over kept relations (tab-separated dump)."""
    adj: dict[str, set[str]] = defaultdict(set)
    with relations_path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            if (row.get("complexite") or "").strip() in DROPPED_COMPLEXITE:
                continue
            a = (row.get("graph_1") or "").strip().lower()
            b = (row.get("graph_2") or "").strip().lower()
            if a and b and a != b:
                adj[a].add(b)
                adj[b].add(a)
    return dict(adj)


def neighbours(adj: dict[str, set[str]], src: str, max_hop: int = HOPS) -> dict[str, int]:
    """related_lemma -> hop within max_hop of src (src excluded). BFS."""
    seen: dict[str, int] = {src: 0}
    queue: deque[str] = deque([src])
    while queue:
        u = queue.popleft()
        if seen[u] >= max_hop:
            continue
        for v in adj.get(u, ()):
            if v not in seen:
                seen[v] = seen[u] + 1
                queue.append(v)
    seen.pop(src, None)
    return seen


def build_leak_rows(
    adj: dict[str, set[str]], corpus: set[str], max_hop: int = HOPS
) -> list[tuple[str, str, int]]:
    """Sorted (answer_lemma, related_lemma, hop) for every corpus answer with relatives."""
    rows: list[tuple[str, str, int]] = []
    for answer in corpus:
        if answer not in adj:
            continue
        for related, hop in neighbours(adj, answer, max_hop).items():
            rows.append((answer, related, hop))
    return sorted(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relations", type=Path, default=DEFAULT_RELATIONS)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--hops", type=int, default=HOPS)
    args = parser.parse_args()

    corpus = load_corpus_lemmas(args.corpus)
    adj = build_adjacency(args.relations)
    rows = build_leak_rows(adj, corpus, args.hops)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(HEADER)
        writer.writerows(rows)

    covered = len({r[0] for r in rows})
    total = len(corpus) or 1
    print(
        f"wrote {args.out}: {len(rows)} edges, "
        f"{covered}/{len(corpus)} answers covered ({covered / total:.1%})"
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/demonette/test_build_leak_graph.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/demonette/build_leak_graph.py scripts/demonette/test_build_leak_graph.py
git commit -s -m "feat(clue-ai): Démonette ≤2-hop leak-graph builder (ADR-0121)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Leak-graph loader + `is_derivational_leak`

**Files:**
- Create: `scripts/eval/demonette_leak.py`
- Test: `scripts/eval/test_demonette_leak.py`

**Interfaces:**
- Consumes: `scripts/eval/morphology_index.py::MorphologyIndex` (uses `.lookup_form(surface) -> list[(lemma, tags)]`).
- Produces:
  - `load_leak_graph(path: Path) -> dict[str, frozenset[str]]` — `answer_lemma → related_lemmas`; `{}` when the file is absent.
  - `is_derivational_leak(clue: str, target_lemma: str, graph: dict[str, frozenset[str]], index) -> str | None` — pure; offending token or None. `index` may be `None` (falls back to the raw token as its own lemma).
  - `derivational_leak_token(clue: str, target_lemma: str) -> str | None` — lazy wrapper over module singletons `_get_graph()` / `_get_index()`; used by the two gates.

- [ ] **Step 1: Write the failing tests**

Create `scripts/eval/test_demonette_leak.py`:

```python
"""Tests for the Démonette derivational-leak check."""
from __future__ import annotations
import csv, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from demonette_leak import load_leak_graph, is_derivational_leak  # noqa: E402


class StubIndex:
    """Minimal MorphologyIndex stand-in: surface -> [(lemma, frozenset())]."""
    def __init__(self, surface_to_lemmas):
        self._m = surface_to_lemmas
    def lookup_form(self, surface):
        return [(lem, frozenset()) for lem in self._m.get(surface.lower(), [])]


# filer's ≤2-hop relatives; délimiter's include the hop-2 'limite'.
GRAPH = {
    "filer": frozenset({"fil", "filet"}),
    "délimiter": frozenset({"limite"}),
}
INDEX = StubIndex({
    "fil": ["fil"], "limites": ["limite"], "transforment": ["transformer"],
    "marquera": ["marquer"], "capitaux": ["capital"],
})

def test_detects_hop1_leak():
    assert is_derivational_leak("Transforment en fil", "filer", GRAPH, INDEX) == "fil"

def test_detects_hop2_leak_via_lemmatised_token():
    # 'limites' lemmatises to 'limite', a ≤2-hop relative of délimiter.
    assert is_derivational_leak("Marquera les limites", "délimiter", GRAPH, INDEX) == "limites"

def test_no_leak_when_no_related_token():
    assert is_derivational_leak("Marquera un objet", "délimiter", GRAPH, INDEX) is None

def test_empty_graph_is_noop():
    assert is_derivational_leak("Transforment en fil", "filer", {}, INDEX) is None

def test_target_absent_from_graph_is_noop():
    assert is_derivational_leak("Injectera des capitaux", "recapitaliser", GRAPH, INDEX) is None

def test_multi_lemma_token_leaks_if_any_candidate_related():
    idx = StubIndex({"pris": ["prendre", "pris"]})
    graph = {"repriser": frozenset({"pris"})}
    assert is_derivational_leak("Ravaudé avec du pris", "repriser", graph, idx) == "pris"

def test_none_index_falls_back_to_raw_token():
    # token equals a lemma verbatim; no index available.
    assert is_derivational_leak("… fil", "filer", GRAPH, None) == "fil"

def test_load_leak_graph_roundtrip(tmp_path):
    p = tmp_path / "demonette_leak.csv"
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f); w.writerow(["answer_lemma", "related_lemma", "hop"])
        w.writerows([("filer", "fil", 1), ("filer", "filet", 2)])
    g = load_leak_graph(p)
    assert g["filer"] == frozenset({"fil", "filet"})

def test_load_leak_graph_absent_returns_empty(tmp_path):
    assert load_leak_graph(tmp_path / "nope.csv") == {}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/eval/test_demonette_leak.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'demonette_leak'`.

- [ ] **Step 3: Write the module**

Create `scripts/eval/demonette_leak.py`:

```python
"""Démonette derivational-leak check; no-ops when the private graph is absent (ADR-0121)."""
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
    """Offending clue token whose lemma is a ≤2-hop derivational relative of target_lemma; None if none/no graph."""
    related = graph.get(target_lemma.lower().strip()) if graph else None
    if not related:
        return None
    for token in _TOKEN_RE.findall(clue):
        if _token_lemmas(token, index) & related:
            return token
    return None


def derivational_leak_token(clue: str, target_lemma: str) -> str | None:
    """Lazy wrapper for the gates: uses the module-singleton graph + index."""
    return is_derivational_leak(clue, target_lemma, _get_graph(), _get_index())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest scripts/eval/test_demonette_leak.py -q`
Expected: PASS (9 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/demonette_leak.py scripts/eval/test_demonette_leak.py
git commit -s -m "feat(clue-ai): Démonette derivational-leak check + loader (ADR-0121)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire into the pipeline_v2 generation gate

**Files:**
- Modify: `scripts/clue_generation/pipeline_v2/filters.py` (add `filter_11_derivational_leak`)
- Modify: `scripts/clue_generation/pipeline_v2/run_pipeline.py` (append to `PIPELINE_FILTERS`, ~line 64)
- Test: `scripts/clue_generation/pipeline_v2/test_filters.py` (append)

**Interfaces:**
- Consumes: `scripts/eval/demonette_leak.py::derivational_leak_token(clue, target_lemma) -> str | None`.
- Produces: `filter_11_derivational_leak(row: dict) -> FilterResult` (reads `row["definition"]`, `row["mot"]`).

- [ ] **Step 1: Write the failing test**

Append to `scripts/clue_generation/pipeline_v2/test_filters.py`:

```python
def test_filter_11_derivational_leak_rejects(monkeypatch):
    import filters
    monkeypatch.setattr(filters, "derivational_leak_token", lambda clue, mot: "fil")
    res = filters.filter_11_derivational_leak({"mot": "filer", "definition": "Transforment en fil"})
    assert res.is_reject
    assert "fil" in res.reason

def test_filter_11_derivational_leak_accepts_when_no_leak(monkeypatch):
    import filters
    monkeypatch.setattr(filters, "derivational_leak_token", lambda clue, mot: None)
    res = filters.filter_11_derivational_leak({"mot": "filer", "definition": "Marquera un objet"})
    assert res.is_accept
```

(If `test_filters.py` imports `filters` via a `sys.path` insert at the top, reuse it; the two tests above only need `import filters`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest scripts/clue_generation/pipeline_v2/test_filters.py -k filter_11 -q`
Expected: FAIL — `AttributeError: module 'filters' has no attribute 'filter_11_derivational_leak'` (or `derivational_leak_token`).

- [ ] **Step 3: Add the filter**

At the top of `scripts/clue_generation/pipeline_v2/filters.py`, add an import that makes `scripts/eval` importable and pulls in the wrapper (place after the existing `import` block, ~line 8):

```python
import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parents[2] / "eval"))
from demonette_leak import derivational_leak_token  # noqa: E402
```

Then add the filter next to `filter_9_stem_leak` (after `filter_10_pleonasm`):

```python
def filter_11_derivational_leak(row: dict) -> FilterResult:
    """Filtre 11 : reject un token dérivationnellement lié au mot (Démonette ≤2 sauts); no-op si le graphe est absent."""
    leak = derivational_leak_token(row["definition"], row["mot"])
    if leak is None:
        return FilterResult("accept")
    return FilterResult(
        "reject",
        f"derivational-leak : token « {leak} » est dérivationnellement lié "
        f"au mot « {row['mot']} »",
    )
```

- [ ] **Step 4: Register it in the pipeline**

In `scripts/clue_generation/pipeline_v2/run_pipeline.py`, append to `PIPELINE_FILTERS` (after the `filter_10_pleonasm` entry, ~line 64):

```python
    ("filter_11_derivational_leak", F.filter_11_derivational_leak, False),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest scripts/clue_generation/pipeline_v2/test_filters.py -q`
Expected: PASS (existing tests + the 2 new ones).

- [ ] **Step 6: Verify the no-op path (no graph present)**

Run: `python -m pytest scripts/clue_generation/pipeline_v2/ -q`
Expected: PASS — with no `demonette_leak.csv` on disk, `derivational_leak_token` returns None and every existing pipeline test is unaffected.

- [ ] **Step 7: Commit**

```bash
git add scripts/clue_generation/pipeline_v2/filters.py scripts/clue_generation/pipeline_v2/run_pipeline.py scripts/clue_generation/pipeline_v2/test_filters.py
git commit -s -m "feat(clue-ai): wire Démonette leak check into pipeline_v2 (filter_11) (ADR-0121)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire into the runtime validator

**Files:**
- Modify: `scripts/eval/validate_clue.py` (add `derivational-leak` flag after the `stem-leak` check, ~line 366)
- Test: `scripts/eval/test_validate_clue.py` (append)

**Interfaces:**
- Consumes: `scripts/eval/demonette_leak.py::is_derivational_leak(clue, target_lemma, graph, index)` and `_get_graph()`.
- Produces: `validate_lemma_clue(...)` returns `ValidationResult("derivational-leak", ...)` when a Démonette leak is found (after the existing `stem-leak` check).

- [ ] **Step 1: Write the failing test**

Append to `scripts/eval/test_validate_clue.py`:

```python
def test_derivational_leak_flag(monkeypatch):
    import validate_clue
    from morphology_index import MorphologyIndex
    # force a graph where 'filer' relates to 'fil'; index resolves 'fil' -> 'fil'
    monkeypatch.setattr(validate_clue, "_derivational_graph",
                        lambda: {"filer": frozenset({"fil"})})
    idx = MorphologyIndex()
    idx.by_form["fil"] = [("fil", frozenset({"nom"}))]
    idx.by_form["transforme"] = [("transformer", frozenset())]
    res = validate_clue.validate_lemma_clue("Transforme en fil", "filer", "verbe", idx)
    assert res.flag == "derivational-leak"
```

(Adjust the attribute name in `monkeypatch.setattr` to match the helper you add in Step 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest scripts/eval/test_validate_clue.py -k derivational_leak -q`
Expected: FAIL — `AttributeError` (`_derivational_graph` / flag not present).

- [ ] **Step 3: Add the check**

At the top of `scripts/eval/validate_clue.py` (near the other imports), add:

```python
from demonette_leak import is_derivational_leak as _is_derivational_leak
from demonette_leak import _get_graph as _derivational_graph
```

In `validate_lemma_clue`, immediately **after** the existing `stem_leak` block (the `if stem_leak is not None:` that returns `"stem-leak"`, ~line 366), insert:

```python
    # Démonette ≤2-hop derivational-leak check; no-op when the private graph is absent (ADR-0121).
    deriv_leak = _is_derivational_leak(clue, target_lemma, _derivational_graph(), index)
    if deriv_leak is not None:
        return ValidationResult(
            "derivational-leak",
            f"clue token '{deriv_leak}' is a derivational relative of the target lemma",
            head,
        )
```

- [ ] **Step 4: Document the flag**

In the module docstring flag table at the top of `validate_clue.py` (near the `stem-leak` entry, ~line 15), add one line:

```
  derivational-leak clue token is a Démonette ≤2-hop derivational relative of the answer
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest scripts/eval/test_validate_clue.py -q`
Expected: PASS (existing + the new test).

- [ ] **Step 6: Run the whole eval suite (no-op invariant)**

Run: `python -m pytest scripts/eval/ -q`
Expected: PASS — with no graph on disk `_derivational_graph()` returns `{}` and the new check is a no-op; the runtime pleonasm/leak guards are unchanged.

- [ ] **Step 7: Commit**

```bash
git add scripts/eval/validate_clue.py scripts/eval/test_validate_clue.py
git commit -s -m "feat(clue-ai): add derivational-leak flag to validate_clue (ADR-0121)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Corpus audit script

**Files:**
- Create: `scripts/clue_generation/audit_derivational_leaks.py`
- Test: `scripts/clue_generation/test_audit_derivational_leaks.py`

**Interfaces:**
- Consumes: `scripts/eval/demonette_leak.py::{load_leak_graph, is_derivational_leak}`, `scripts/eval/morphology_index.py::MorphologyIndex`.
- Produces: `find_leaks(rows, graph, index) -> list[tuple[str, str, str]]` — `(word, clue, offending_token)` per leaking row; a `main()` that reads `words-fr.csv` and prints them. Report only — mutates nothing.

- [ ] **Step 1: Write the failing test**

Create `scripts/clue_generation/test_audit_derivational_leaks.py`:

```python
"""Tests for the derivational-leak corpus audit."""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))
from audit_derivational_leaks import find_leaks  # noqa: E402


class StubIndex:
    def __init__(self, m): self._m = m
    def lookup_form(self, s): return [(l, frozenset()) for l in self._m.get(s.lower(), [])]


def test_find_leaks_reports_offenders_and_skips_placeholders():
    graph = {"filer": frozenset({"fil"})}
    index = StubIndex({"fil": ["fil"]})
    rows = [
        {"word": "FILENT", "clue": "Transforment en fil", "lemma": "filer"},
        {"word": "FILENT", "clue": "FILENT", "lemma": "filer"},   # placeholder clue==word, skip
        {"word": "MAISON", "clue": "Lieu d'habitation", "lemma": "maison"},  # clean
    ]
    leaks = find_leaks(rows, graph, index)
    assert leaks == [("FILENT", "Transforment en fil", "fil")]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest scripts/clue_generation/test_audit_derivational_leaks.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'audit_derivational_leaks'`.

- [ ] **Step 3: Write the audit**

Create `scripts/clue_generation/audit_derivational_leaks.py`:

```python
"""One-shot report of existing derivational leaks in words-fr.csv; requires the private leak graph (ADR-0121)."""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))
from demonette_leak import is_derivational_leak, load_leak_graph  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

MOCK_CORPUS = Path("grid/api/src/test/resources/mock-corpus/words/words-fr.csv")
_real = os.environ.get("WORDSPARROW_REAL_CORPUS_DIR")
DEFAULT_CORPUS = Path(_real) / "words" / "words-fr.csv" if _real else MOCK_CORPUS
DEFAULT_GRAPH = Path("data/external/demonette/derived/demonette_leak.csv")
DEFAULT_LEXIQUE = Path(
    os.environ.get("GRAMMALECTE_LEXIQUE", "data/lexique-grammalecte-fr-v7.7.txt")
)


def find_leaks(rows, graph, index) -> list[tuple[str, str, str]]:
    """(word, clue, offending_token) for every row whose clue leaks; skips placeholder rows."""
    out: list[tuple[str, str, str]] = []
    for row in rows:
        word = (row.get("word") or "").strip()
        clue = (row.get("clue") or "").strip()
        lemma = (row.get("lemma") or "").strip().lower()
        if not clue or not lemma or clue == word:  # clue==word is the "no clue" placeholder
            continue
        token = is_derivational_leak(clue, lemma, graph, index)
        if token is not None:
            out.append((word, clue, token))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--graph", type=Path, default=DEFAULT_GRAPH)
    parser.add_argument("--lexique", type=Path, default=DEFAULT_LEXIQUE)
    args = parser.parse_args()

    graph = load_leak_graph(args.graph)
    if not graph:
        print(f"no leak graph at {args.graph} — build it first (build_leak_graph.py)")
        return
    index = MorphologyIndex.load(args.lexique) if args.lexique.exists() else None
    with args.corpus.open(encoding="utf-8") as f:
        leaks = find_leaks(list(csv.DictReader(f)), graph, index)

    print(f"{len(leaks)} derivational leaks in {args.corpus}:")
    for word, clue, token in leaks:
        print(f"  {word}\t« {clue} »\tleaks '{token}'")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest scripts/clue_generation/test_audit_derivational_leaks.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/clue_generation/audit_derivational_leaks.py scripts/clue_generation/test_audit_derivational_leaks.py
git commit -s -m "feat(clue-ai): corpus audit for existing derivational leaks (ADR-0121)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Offline acceptance run (private data)

**Files:** none created — this is the end-to-end verification against real data. Requires the Démonette dump (`data/external/demonette/relations.csv`), the private corpus (`WORDSPARROW_REAL_CORPUS_DIR` → real `words-fr.csv`), and the grammalecte lexique. All local/private; nothing here is committed.

**Interfaces:**
- Consumes everything above.
- Produces: confirmation that the design-spec verification table reproduces (FILENT + DELIMITERA caught; NO/CA/ANS/RECAPITALISERA the documented misses).

- [ ] **Step 1: Build the real leak graph**

Run:
```bash
WORDSPARROW_REAL_CORPUS_DIR=<private-corpus-dir> \
  python scripts/demonette/build_leak_graph.py
```
Expected: `wrote data/external/demonette/derived/demonette_leak.csv: <N> edges, ~11459/15030 answers covered (~76%)`.

- [ ] **Step 2: Confirm the reported cases**

With the graph built, run the audit over the real corpus (or a tiny CSV of the 6 reported rows) and confirm:
- `FILENT` → leaks `fil`; `DELIMITERA` → leaks `limites`.
- `NO`, `CA`, `ANS`, `RECAPITALISERA` → **not** reported (out-of-scope classes + the documented `recapitaliser` coverage gap).

Run:
```bash
WORDSPARROW_REAL_CORPUS_DIR=<private-corpus-dir> \
  python scripts/clue_generation/audit_derivational_leaks.py | grep -E 'FILENT|DELIMITERA|RECAPITALISERA'
```
Expected: FILENT and DELIMITERA lines present; no RECAPITALISERA line.

- [ ] **Step 3: Record the result in the eval logbook**

Append a short dated entry to `docs/eval/clue-gen-v0.md` noting: ADR-0121 leak filter shipped, real leak-graph coverage (answers covered %), and the 6-report verification outcome. Commit:

```bash
git add docs/eval/clue-gen-v0.md
git commit -s -m "docs(clue-ai): log ADR-0121 leak-filter acceptance run

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## PR split (400-line cap)

- **PR 1 — ADR:** Task 1 (ADR-0121 + INDEX). Merges first.
- **PR 2 — filter:** Tasks 2–6 (builder, loader, both gate wirings, audit, tests). Task 7 is an offline verification the author runs locally and summarises in the PR body / logbook; it does not add committed code beyond the logbook line.

If PR 2 exceeds 400 non-generated lines, split again: 2a = builder + loader + tests (Tasks 2–3), 2b = gate wirings + audit (Tasks 4–6).

## Notes for the implementer

- **The reported live leaks are not fixed by merging this.** This closes the *hole* (new clues gated; existing ones findable). Scrubbing the shipped corpus is a follow-up: run the Task-7 audit, then correct/regenerate via the ADR-0108 corrections path.
- **Do not commit anything under `data/external/`** — it is gitignored and licensed (verify with `git status` before every commit).
- **The no-op invariant is load-bearing.** If any `pytest scripts/eval/` or `pytest scripts/clue_generation/pipeline_v2/` run starts failing because the graph/lexique is missing, the lazy-load short-circuit is wrong — fix it rather than committing a graph.
