"""Normalise the Démonette-2 derivational database (CC BY-SA 4.0, ADR-0119/ADR-0058) against the runtime corpus, dropping complexite=accidentel and out-of-corpus lemmas, emitting gitignored derived relation/family CSVs (join is direct lowercase+accented per ADR-0100, no folding here)."""
from __future__ import annotations

import argparse
import csv
import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_RELATIONS = Path("data/external/demonette/relations.csv")
DEFAULT_FAMILIES = Path("data/external/demonette/families.csv")
DEFAULT_LEXEMES = Path("data/external/demonette/lexemes.csv")
MOCK_CORPUS = Path("grid/api/src/test/resources/mock-corpus/words/words-fr.csv")
# WORDSPARROW_REAL_CORPUS_DIR convention (ADR-0031 amendment): real corpus dir, else mock fixture.
_real_corpus_dir = os.environ.get("WORDSPARROW_REAL_CORPUS_DIR")
DEFAULT_CORPUS = Path(_real_corpus_dir) / "words" / "words-fr.csv" if _real_corpus_dir else MOCK_CORPUS
DEFAULT_OUT_DIR = Path("data/external/demonette/derived")

# complexite=accidentel marks false friends (école/oléiculteur): same form, unrelated meaning.
DROPPED_COMPLEXITE = frozenset({"accidentel"})
# complexe is kept but flagged via the emitted complexite column so consumers can weigh it.
FLAGGED_COMPLEXITE = "complexe"

RELATIONS_HEADER = [
    "lemma_from",
    "cat_from",
    "cstr_from",
    "lemma_to",
    "cat_to",
    "cstr_to",
    "orientation",
    "complexite",
]
FAMILIES_HEADER = ["lemma", "family_id", "family_size"]

RelationEdge = tuple[str, str, str, str, str, str, str, str]
FamilyRow = tuple[str, str, int]


@dataclass
class RelationStats:
    total_rows: int = 0
    dropped_accidentel: int = 0
    dropped_out_of_corpus: int = 0
    kept_edges: int = 0
    complexe_edges: int = 0
    lemmas: set[str] = field(default_factory=set)


@dataclass
class FamilyStats:
    total_families: int = 0
    emitted_families: int = 0
    emitted_members: int = 0
    unresolved_lids: int = 0
    lemmas: set[str] = field(default_factory=set)


def load_corpus_lemmas(path: Path) -> set[str]:
    """Distinct non-empty values of the corpus `lemma` column (lowercase + accented)."""
    lemmas: set[str] = set()
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            lemma = (row.get("lemma") or "").strip()
            if lemma:
                lemmas.add(lemma)
    return lemmas


def _reader(path: Path):
    return csv.DictReader(path.open(encoding="utf-8"), delimiter="\t")


def build_lid_lemma_map(relations_path: Path, lexemes_path: Path | None = None) -> dict[str, str]:
    """Map lexeme id -> lemma, sourced from relations; lexemes.csv fills lids absent there."""
    lid_lemma: dict[str, str] = {}
    for row in _reader(relations_path):
        for lid_col, graph_col in (("lid_1", "graph_1"), ("lid_2", "graph_2")):
            lid = (row.get(lid_col) or "").strip()
            graph = (row.get(graph_col) or "").strip()
            if lid and graph:
                lid_lemma.setdefault(lid, graph)
    if lexemes_path and lexemes_path.exists():
        for row in _reader(lexemes_path):
            lid = (row.get("lid") or "").strip()
            graph = (row.get("graphie") or "").strip()
            if lid and graph:
                lid_lemma.setdefault(lid, graph)
    return lid_lemma


def build_relations(relations_path: Path, corpus: set[str]) -> tuple[list[RelationEdge], RelationStats]:
    """Directed edges where both lemmas are in the corpus and complexite != accidentel; deduped."""
    stats = RelationStats()
    seen: set[RelationEdge] = set()
    for row in _reader(relations_path):
        stats.total_rows += 1
        complexite = (row.get("complexite") or "").strip()
        if complexite in DROPPED_COMPLEXITE:
            stats.dropped_accidentel += 1
            continue
        lemma_from = (row.get("graph_1") or "").strip()
        lemma_to = (row.get("graph_2") or "").strip()
        if lemma_from not in corpus or lemma_to not in corpus:
            stats.dropped_out_of_corpus += 1
            continue
        edge: RelationEdge = (
            lemma_from,
            (row.get("cat_1") or "").strip(),
            (row.get("cstr_1") or "").strip(),
            lemma_to,
            (row.get("cat_2") or "").strip(),
            (row.get("cstr_2") or "").strip(),
            (row.get("orientation") or "").strip(),
            complexite,
        )
        if edge in seen:
            continue
        seen.add(edge)
        stats.lemmas.update((lemma_from, lemma_to))
        if complexite == FLAGGED_COMPLEXITE:
            stats.complexe_edges += 1
    stats.kept_edges = len(seen)
    return sorted(seen), stats


def build_families(
    families_path: Path,
    corpus: set[str],
    lid_lemma: dict[str, str],
    min_size: int = 2,
) -> tuple[list[FamilyRow], FamilyStats]:
    """Families with >= min_size corpus members (family_size counts corpus members only); size-1 families carry no cross-word signal for any consumer, so they're dropped."""
    stats = FamilyStats()
    rows: list[FamilyRow] = []
    for row in _reader(families_path):
        stats.total_families += 1
        family_id = (row.get("fid") or "").strip()
        lids = [lid for lid in (row.get("lids") or "").split(";") if lid.strip()]
        members: set[str] = set()
        for lid in lids:
            lemma = lid_lemma.get(lid.strip())
            if lemma is None:
                stats.unresolved_lids += 1
                continue
            if lemma in corpus:
                members.add(lemma)
        if len(members) < min_size:
            continue
        size = len(members)
        stats.emitted_families += 1
        stats.emitted_members += size
        stats.lemmas.update(members)
        for lemma in sorted(members):
            rows.append((lemma, family_id, size))
    return rows, stats


def _write_csv(path: Path, header: list[str], rows: list[tuple]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


def _report(corpus: set[str], rel: RelationStats, fam: FamilyStats) -> str:
    corpus_n = len(corpus)
    rel_cov = len(rel.lemmas) / corpus_n if corpus_n else 0.0
    fam_cov = len(fam.lemmas) / corpus_n if corpus_n else 0.0
    lines = [
        "Démonette-2 ingest — corpus-restricted stats",
        f"  corpus lemmas:              {corpus_n}",
        f"  relations rows read:        {rel.total_rows}",
        f"  dropped (accidentel):       {rel.dropped_accidentel}",
        f"  dropped (out of corpus):    {rel.dropped_out_of_corpus}",
        f"  kept directed edges:        {rel.kept_edges}",
        f"    of which complexe-tagged: {rel.complexe_edges}",
        f"  distinct lemmas in edges:   {len(rel.lemmas)}",
        f"  families read:              {fam.total_families}",
        f"  families emitted (>=2 corp):{fam.emitted_families}",
        f"  family member rows:         {fam.emitted_members}",
        f"  unresolved family lids:     {fam.unresolved_lids}",
        f"  RELATION COVERAGE:          {rel_cov:.1%} of corpus lemmas have >=1 Démonette relation",
        f"  family coverage:            {fam_cov:.1%} of corpus lemmas are in a >=2 family",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relations", type=Path, default=DEFAULT_RELATIONS)
    parser.add_argument("--families", type=Path, default=DEFAULT_FAMILIES)
    parser.add_argument("--lexemes", type=Path, default=DEFAULT_LEXEMES)
    parser.add_argument(
        "--corpus", type=Path, default=DEFAULT_CORPUS,
        help="default: mock fixture, or $WORDSPARROW_REAL_CORPUS_DIR/words/words-fr.csv if set",
    )
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--min-family-size", type=int, default=2)
    args = parser.parse_args()

    corpus = load_corpus_lemmas(args.corpus)
    edges, rel_stats = build_relations(args.relations, corpus)
    lid_lemma = build_lid_lemma_map(args.relations, args.lexemes)
    families, fam_stats = build_families(args.families, corpus, lid_lemma, args.min_family_size)

    _write_csv(args.out_dir / "demonette_relations.csv", RELATIONS_HEADER, edges)
    _write_csv(args.out_dir / "demonette_families.csv", FAMILIES_HEADER, families)

    print(_report(corpus, rel_stats, fam_stats))
    print(f"wrote {args.out_dir}/demonette_relations.csv and demonette_families.csv")


if __name__ == "__main__":
    main()
