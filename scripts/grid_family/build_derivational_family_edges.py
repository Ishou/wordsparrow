"""Emit folded derivational family-union edges from the Démonette ingest output.

ADR-0119 roadmap item 1 (family-aware WordAcceptor dedup, derivational layer 2).
Reads the corpus-restricted, accidentel-dropped relations table produced by
`scripts/demonette/ingest.py`, keeps only `complexite=simple` direct relations
(the clearest, most-regular derivations — conversions like saut/sauter, standard
affixation like race/raciste), folds each lemma to grid-cell A-Z uppercase
(matching Word.lemma), and emits one canonical edge per undirected pair.

The grid loader applies these as DIRECTED edges (target added to source's dedup
key), which blocks edge-adjacent pairs WITHOUT transitive spread — port/porter
and porter/rapport are each blocked, but port+rapport are not. Run
`scripts/demonette/ingest.py` first to produce the relations table.
"""
import csv, sys, unicodedata
from pathlib import Path

def fold(s: str) -> str:
    accent_stripped = "".join(c for c in unicodedata.normalize("NFD", s)
                               if unicodedata.category(c) != "Mn")
    # Matches Word.lemma: foldToAscii() then HyphenSurface.split(...)?.first,
    # which keeps only the A-Z letter run and drops interior hyphens entirely.
    return "".join(c for c in accent_stripped.upper() if c.isalpha())

def main() -> None:
    relations = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("demonette_relations.csv")
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("derivational_family_edges.csv")
    edges = set()
    with relations.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r.get("complexite") != "simple":
                continue
            a, b = fold(r["lemma_from"]), fold(r["lemma_to"])
            if a != b:
                edges.add(tuple(sorted((a, b))))
    with dst.open("w", encoding="utf-8", newline="") as out:
        w = csv.writer(out, lineterminator="\n")
        w.writerow(["lemma_a", "lemma_b"])
        for a, b in sorted(edges):
            w.writerow([a, b])
    print(f"wrote {len(edges)} folded simple derivational edges to {dst}", file=sys.stderr)

if __name__ == "__main__":
    main()
