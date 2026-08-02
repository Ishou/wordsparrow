"""One-shot: reads (word, clue, lemma) rows from words-fr.csv, runs is_derivational_leak, prints offenders (report only, never auto-applied; requires the private leak graph + grammalecte lexique) (ADR-0121)."""
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
