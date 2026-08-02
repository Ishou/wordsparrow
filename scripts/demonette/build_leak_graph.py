"""Build the corpus-scoped ≤2-hop derivational-leak graph from the Démonette dump (ADR-0121).

Emits answer_lemma (in corpus) -> related_lemma (any Démonette node) within HOPS, dropping
complexite in {accidentel, motiv-sem}. Private/gitignored artifact (CC BY-SA, ADR-0058)."""
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
