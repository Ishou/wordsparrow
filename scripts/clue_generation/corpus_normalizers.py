#!/usr/bin/env python3
"""Per-tier normalizers: map each corpus source's native shape onto the
UNIFIED 10-column schema (ADR-0099).

Each source tier has a different native shape (hand-authored unified CSVs,
gold citation-form clues, semicolon-delimited editorial raw + a `_lemmas`
join table, the grammalecte-import candidate dict, and the forward-inflated
`surface_clues.csv`). A normalizer here does exactly one thing: reshape one
tier's rows into `UNIFIED_FIELDS`, deriving `pos`/`lemma` via grammalecte
morphology where the source doesn't already carry them. Merging tiers by
priority into a single corpus is a separate concern (the assembler).

`normalize_unified` never surface-defaults an authored `pos` whose lemma
can't be determined uniquely (`derive_lemma` returns `("ambiguous", None)`)
— it raises, forcing an explicit authored lemma instead of silently
defaulting to the surface (the bug this whole refactor exists to fix; see
ADR-0099).
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))
from morphology_index import MorphologyIndex, _classify  # noqa: E402
from reconcile_lemmas import _norm, derive_lemma, reconcile  # noqa: E402

UNIFIED_FIELDS = [
    "word", "language", "length", "frequency", "difficulty",
    "clue", "source", "source_license", "pos", "lemma",
]


def normalize_unified(rows: list[dict], index: MorphologyIndex) -> list[dict]:
    """Hand-authored sources already in unified shape (`short-fr.csv`,
    `fr.csv`, `themed/*.csv`). Authored `pos`/`lemma` pass through
    unchanged; where `pos` is present and `lemma` is blank, derive it.
    An ambiguous verb surface with no authored lemma is a hard error —
    never surface-default (that silent default is the bug ADR-0099 fixes).
    """
    out: list[dict] = []
    for r in rows:
        word = (r.get("word") or "").strip()
        pos = (r.get("pos") or "").strip()
        lemma = (r.get("lemma") or "").strip()
        if pos and not lemma:
            status, derived = derive_lemma(word, pos, index)
            if status == "ambiguous":
                raise ValueError(f"{word}/{pos} needs an authored lemma")
            lemma = derived
        out.append({
            "word": word,
            "language": r.get("language", ""),
            "length": r.get("length", ""),
            "frequency": r.get("frequency", ""),
            "difficulty": r.get("difficulty", ""),
            "clue": r.get("clue", ""),
            "source": r.get("source", ""),
            "source_license": r.get("source_license", ""),
            "pos": pos,
            "lemma": lemma,
        })
    return out


def normalize_gold(path: Path, index: MorphologyIndex) -> list[dict]:
    """`data/curated/generation-gold-*/clues.csv` (`lemma,clue,pos,source`).

    Gold rows are citation-form: the lemma column IS the word (no
    inflection to reconcile), so `word` and `lemma` both come from it
    verbatim. `index` is accepted for interface symmetry with the other
    normalizers but unused here — there is no surface/lemma gap to derive.
    """
    del index
    out: list[dict] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            word = (r.get("lemma") or "").strip()
            out.append({
                "word": word,
                "language": "fr",
                "length": str(len(word)),
                "frequency": "100000",
                "difficulty": "",
                "clue": r.get("clue", ""),
                "source": "gold",
                "source_license": "CC0-1.0",
                "pos": (r.get("pos") or "").strip(),
                "lemma": word,
            })
    return out


def normalize_surface_clues(path: Path) -> list[dict]:
    """The forward-inflated `data/eval/production/surface_clues.csv`
    (`surface,lemma,pos,clue,source_clue,inflection_status,filter_score,
    validation_flag`). 1:1 passthrough onto the unified shape; keeps only
    `validation_flag == "ok"` rows, mirroring the shipped-row filter in
    `merge_clues_into_wordlist.py` / the `run_production.sh` shipping gate.
    """
    out: list[dict] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r.get("validation_flag") != "ok":
                continue
            surface = (r.get("surface") or "").strip()
            out.append({
                "word": surface,
                "language": "fr",
                "length": str(len(surface)),
                "frequency": "100000",
                "difficulty": "",
                "clue": r.get("clue", ""),
                "source": "llm",
                "source_license": "CC0-1.0",
                "pos": (r.get("pos") or "").strip(),
                "lemma": (r.get("lemma") or "").strip(),
            })
    return out


def _pos_from_lemma(surface: str, lemma: str, index: MorphologyIndex) -> str:
    """POS of the reading matching `(surface, lemma)`, via grammalecte."""
    for candidate_lemma, tags in index.lookup_form(surface):
        if _norm(candidate_lemma) == _norm(lemma):
            return _classify(tags)
    return ""


def normalize_editorial(raw_dir: Path, lemmas_csv: Path, index: MorphologyIndex) -> list[dict]:
    """The editorial raw files (`data/curated/raw/fr_*.csv`, `Mot;Définition
    1;Définition 2`) joined against `_lemmas.csv` (`Mot;Sens;Lemme;
    Morphologie`).

    Join key verified against `merge_editorial_into_wordlist.py::load_lemmas`
    / `load_editorial` and `propagate_editorial_clues.py::load_raw_clues` /
    `main`: `_lemmas.csv`'s `Sens` column IS the raw file's `Définition 1`
    text — both scripts key their `_lemmas` map by `(Mot, Sens)` and look it
    up with `(mot, def1)` / `(mot, sens)` interchangeably. Not ambiguous.

    When no `_lemmas` entry matches, the surface is NOT defaulted as its
    own lemma (that silent default is the exact editorial-merge bug
    ADR-0099 exists to kill — a genuine inflection like `lia` would ship
    `lemma=lia` instead of `lier` and dodge grid dedup). Instead it goes
    through the same pos-less `reconcile` used to fix the wordlist:
    a unique-headword inflection is resolved to that headword ("fixed"),
    a legitimately self-lemma surface (abbreviation/invariable/unknown)
    keeps the surface, and a genuinely ambiguous surface raises rather
    than guessing. `pos` is derived from `(surface, lemma)` via
    grammalecte; unresolvable pairs get `pos=""` (grammalecte doesn't
    always know editorial-only words).
    """
    lemma_map: dict[tuple[str, str], str] = {}
    lemmas_path = Path(lemmas_csv)
    if lemmas_path.exists():
        with lemmas_path.open(encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter=";"):
                lemma_map[(r["Mot"], r["Sens"])] = r["Lemme"]

    out: list[dict] = []
    for csv_path in sorted(Path(raw_dir).glob("fr_*.csv")):
        with csv_path.open(encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter=";"):
                mot = r["Mot"]
                def1 = r["Définition 1"]
                if not def1:
                    continue  # skip empty Def 1 rows, mirrors load_editorial
                word = mot.lower()
                mapped = lemma_map.get((mot, def1))
                if mapped is not None:
                    lemma = mapped.lower()
                else:
                    status, resolved = reconcile(word, word, index)
                    if status == "ambiguous":
                        raise ValueError(f"editorial {word!r} needs an authored lemma")
                    lemma = resolved if status == "fixed" else word
                out.append({
                    "word": word,
                    "language": "fr",
                    "length": str(len(word)),
                    "frequency": "100000",
                    "difficulty": "",
                    "clue": def1,
                    "source": "bliss",
                    "source_license": "CC0-1.0",
                    "pos": _pos_from_lemma(word, lemma, index),
                    "lemma": lemma,
                })
    return out


def normalize_grammalecte(
    surfaces: dict[str, tuple[str, int]],
    index: MorphologyIndex,
    source: str = "grammalecte",
    source_license: str = "MPL-2.0",
) -> list[dict]:
    """The grammalecte-import candidate dict `surface -> (lemma, frequency)`
    produced by `import_grammalecte_long_words.parse_grammalecte_length_band`
    / `parse_grammalecte_lemma_anchored`.

    Those two functions already scan the lexique and return a pure
    `surface -> (lemma, freq)` mapping with no CSV I/O or wordlist mutation
    involved (`main()` does the wordlist read/write separately, after
    calling one of them) — so wrapping their *output* here is a clean
    extraction; it does not re-implement the lexique scan or touch the
    in-place `words-fr.csv` mutation `main()` performs. There is no
    intermediate "grammalecte-import CSV" to read a `path` from, so this
    normalizer's first argument is the candidate dict itself rather than a
    path (a deliberate deviation from the other normalizers' `path` shape;
    it's the actual, already-pure interface boundary in the source script).

    `pos` is `_classify` of the reading whose lemma matches the row's
    lemma (`clue == word` is the placeholder convention the import script
    itself documents — downstream inflation replaces it).
    """
    out: list[dict] = []
    for word, (lemma, freq) in surfaces.items():
        out.append({
            "word": word,
            "language": "fr",
            "length": str(len(word)),
            "frequency": str(freq),
            "difficulty": "",
            "clue": word,
            "source": source,
            "source_license": source_license,
            "pos": _pos_from_lemma(word, lemma, index),
            "lemma": lemma,
        })
    return out
