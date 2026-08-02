"""Strip existing derivational-leak clues from a corpus by blanking them to placeholder (ADR-0121).

For every row whose clue is a derivational leak of the answer (Démonette ≤2 hops), sets
`clue = word` — the renderer's "no clue available" convention — so a leaking clue is dropped
rather than shown. Idempotent. This is the remediation half of the ADR-0121 audit: the filter
closes the hole for new clues; this scrubs leaks already baked into the committed word list.

Requires the private leak graph + grammalecte lexique to be present (mirrors the audit)."""
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


def strip_leaks(rows, graph, index) -> int:
    """Blank each leaking row's clue to its word (placeholder). Returns the number blanked."""
    stripped = 0
    for row in rows:
        word = (row.get("word") or "").strip()
        clue = (row.get("clue") or "").strip()
        lemma = (row.get("lemma") or "").strip().lower()
        if not clue or not lemma or clue == word:  # skip placeholders / empty
            continue
        if is_derivational_leak(clue, lemma, graph, index) is not None:
            row["clue"] = word
            stripped += 1
    return stripped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--graph", type=Path, default=DEFAULT_GRAPH)
    parser.add_argument("--lexique", type=Path, default=DEFAULT_LEXIQUE)
    parser.add_argument("--dry-run", action="store_true", help="report the count without writing")
    args = parser.parse_args()

    graph = load_leak_graph(args.graph)
    if not graph:
        print(f"no leak graph at {args.graph} — build it first (build_leak_graph.py)")
        return
    index = MorphologyIndex.load(args.lexique) if args.lexique.exists() else None

    with args.corpus.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)

    stripped = strip_leaks(rows, graph, index)
    if args.dry_run:
        print(f"[dry-run] would blank {stripped} derivational-leak clues in {args.corpus}")
        return

    # lineterminator="\n": the committed corpus is LF; csv's default CRLF would
    # rewrite every line and bury the real change in a whole-file diff.
    with args.corpus.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"blanked {stripped} derivational-leak clues in {args.corpus}")


if __name__ == "__main__":
    main()
