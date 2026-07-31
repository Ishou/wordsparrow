"""Emit folded participle->verb family-union edges from the grammalecte lexique.

A French participle has a dual identity — grammalecte tags it BOTH as a verb
(ppas/ppre, lemma = the verb) and as an adjective (its own participle lemma).
The corpus assigns one lemma per surface, so inflected participle-adjectives
(émanée, lemma "émané") are severed from their verb (émaner) for grid dedup.

This emits the edges the dedup must union: for every surface grammalecte
analyses as BOTH an adjective and a verb-participle, `fold(adj_lemma) ->
fold(verb_lemma)` (folded to grid-cell A-Z uppercase, matching Word.lemma).
Accent-variant lemmas (accroître/accroitre) fold to the same key and need no
edge. Output feeds both the generation dedup fix and the independent gate
(scripts/grid_family/ + grid ParticipleFamilyGateTest).
"""
import csv, sys, unicodedata
from collections import defaultdict
from pathlib import Path

def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn").upper()

def main() -> None:
    lexique = Path(sys.argv[1] if len(sys.argv) > 1
                   else Path.home() / "Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt")
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("participle_family_edges.csv")
    adj = defaultdict(set); vpart = defaultdict(set)
    with lexique.open(encoding="utf-8") as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < 5:
                continue
            surf, lemma, tags = f[2], f[3], f[4]
            if "adj" in tags:
                adj[surf].add(lemma)
            if "ppas" in tags or "ppre" in tags:
                vpart[surf].add(lemma)
    edges = set()
    for surf in adj.keys() & vpart.keys():
        for a in adj[surf]:
            for v in vpart[surf]:
                fa, fv = fold(a), fold(v)
                if fa != fv:
                    edges.add((fa, fv))
    with dst.open("w", encoding="utf-8", newline="") as out:
        w = csv.writer(out, lineterminator="\n")
        w.writerow(["lemma_a", "lemma_b"])
        for a, b in sorted(edges):
            w.writerow([a, b])
    print(f"wrote {len(edges)} folded participle->verb edges to {dst}", file=sys.stderr)

if __name__ == "__main__":
    main()
