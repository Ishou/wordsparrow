#!/usr/bin/env python3
"""Grammalecte surface-admission policies: pure surface -> (lemma, freq)
scans of the lexique, wrapped onto the unified schema by
`corpus_normalizers.normalize_grammalecte` and merged by `assemble_corpus.py`
(ADR-0100) rather than appended to words-fr.csv in place here.

Two admission policies, each its own function below; pick one per call.

(1) Length-band admission (`parse_grammalecte_length_band`).

The runtime corpus has historically capped at length 11; PRs #356/#357
push the daily-grid default to 15x12 and need supply at lengths 12-15.
This mode ports every grammalecte surface in the requested length range
whose `Total occurrences` clears `--min-freq`. Inputs are independent of
the current corpus — this is the "fresh import" mode.

(2) Lemma-anchored admission (`parse_grammalecte_lemma_anchored`).

Admits a surface form if BOTH:
- its lemma is already in the current words-fr.csv (i.e. the lemma has
  at least one row), AND
- its grammalecte tag set is not in the obscure-form blocklist
  (`ipsi` = passé simple, `simp` = subjonctif imparfait, and `cond`
  restricted to 1pl / 2pl).

This is the structural fix for the daily-grid cooldown convergence
problem: bench at 15x12 with accumulating cooldowns went from 8% to
100% success when the candidate pool widened to all surfaces. Lowering
the frequency floor alone gives ~3.7% pool growth at threshold=100;
the lemma-anchored rule adds ~57k surfaces because the limiting factor
is corpus *coverage* (inflected variants of common lemmas missing from
the wordlist), not the frequency threshold.

`--min-freq` defaults to 0 in this mode so the pipeline doesn't drop
rare inflections of common lemmas (`clignotais` freq=1 etc.). The
runtime CSV loader (CsvWordRepository) no longer applies a frequency
floor either; the blank-clue gate is the only remaining filter and
fires only when the inflater fails to produce a non-placeholder clue.

Both modes return `surface -> (lemma, freq)`; `clue == word` is the
placeholder convention `normalize_grammalecte` carries through, upgraded
later by the LoRA-clue tier during assembly.
"""
from __future__ import annotations
import csv
import os
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
DEFAULT_LEXIQUE = Path(os.path.expanduser(
    "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _default_wordlist() -> Path:
    """Return whichever wordlist path exists on disk.

    The corpus moved from grid/api/.../resources to grid/infrastructure/...
    in PR #439. Support both for backwards compatibility; prefer the
    current location.
    """
    new_path = REPO / "grid/infrastructure/src/main/resources/words/words-fr.csv"
    old_path = REPO / "grid/api/src/main/resources/words/words-fr.csv"
    if new_path.exists():
        return new_path
    return old_path


DEFAULT_WORDLIST = _default_wordlist()


# Obscure-form blocklist. Surfaces tagged with any of these are
# crossword-noise (passé simple, subj imparfait) or tonal mismatches
# (the long conditional forms 1pl `-rions` / 2pl `-riez`). The cond
# singulars and 3pl are kept — `aimerait`, `viendrait`, `seraient`
# are fair-game clue surfaces.
_INVERSION_PERSONS = {"1isg", "2isg", "3isg"}
_NORMAL_PERSONS = {"1sg", "2sg", "3sg", "1pl", "2pl", "3pl"}


def is_obscure_tag(tag_str: str) -> str | None:
    """Return a label if `tag_str` (space-separated grammalecte tags) is in
    the obscure-form blocklist. Otherwise None.
    """
    tags = set(tag_str.split())
    if "ipsi" in tags:
        return "passe-simple"
    if "simp" in tags:
        return "subj-imparfait"
    if "cond" in tags and ("1pl" in tags or "2pl" in tags):
        return "cond-1pl-2pl"
    # Literary interrogative-inversion forms (`posè-je`) are unclueable (`Nisg` isn't in `PERSON_TOKENS`); block only inversion-ONLY rows so a syncretic surface like `finis` (2sg + 1isg) survives via its normal-person reading.
    if (tags & _INVERSION_PERSONS) and not (tags & _NORMAL_PERSONS):
        return "inversion"
    return None


# Grid-cell foldability check, mirrors CsvWordRepository.foldToAscii.
# Kept as a local helper rather than importing the Kotlin rule because
# this script runs offline without a JVM; the rules are identical
# (NFD strip + œ/æ expansion + uppercase, must end up entirely A-Z).
def _fold_to_ascii(text: str) -> str:
    import unicodedata
    nfd = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in nfd if not unicodedata.combining(c))
    return (
        stripped.replace("œ", "oe").replace("Œ", "OE")
        .replace("æ", "ae").replace("Æ", "AE")
        .upper()
    )


def _is_grid_placeable(text: str) -> bool:
    folded = _fold_to_ascii(text)
    return bool(folded) and all("A" <= c <= "Z" for c in folded)


def parse_grammalecte_length_band(
    lexique: Path,
    length_min: int,
    length_max: int,
    min_freq: int,
) -> dict[str, tuple[str, int]]:
    """Return surface -> (lemma, frequency) for length-band mode.

    When grammalecte tags a surface against multiple lemmas (homography),
    the pair with the highest `Total occurrences` wins. Ties keep
    whichever lemma was seen first; the file is freq-sorted so ties are
    rare and the choice is stable.
    """
    out: dict[str, tuple[str, int]] = {}
    seen_header = False
    flex_idx = lemme_idx = tot_idx = -1
    with lexique.open(encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            cols = line.rstrip("\n").split("\t")
            if not seen_header:
                if "Flexion" in cols and "Lemme" in cols and "Total occurrences" in cols:
                    flex_idx = cols.index("Flexion")
                    lemme_idx = cols.index("Lemme")
                    tot_idx = cols.index("Total occurrences")
                    seen_header = True
                continue
            if len(cols) <= max(flex_idx, lemme_idx, tot_idx):
                continue
            flex = cols[flex_idx]
            if not flex.isalpha():
                continue
            L = len(flex)
            if not (length_min <= L <= length_max):
                continue
            try:
                freq = int(cols[tot_idx])
            except ValueError:
                continue
            if freq < min_freq:
                continue
            lemma = cols[lemme_idx]
            existing = out.get(flex)
            if existing is None or freq > existing[1]:
                out[flex] = (lemma, freq)
    return out


def parse_grammalecte_lemma_anchored(
    lexique: Path,
    in_corpus_lemmas: set[str],
    length_min: int,
    length_max: int,
    min_freq: int,
) -> tuple[dict[str, tuple[str, int]], dict[str, int]]:
    """Return (surface -> (lemma, frequency), counters) for lemma-anchored mode.

    Admits a surface iff:
    - its lemma is in `in_corpus_lemmas`,
    - its grammalecte tag is not obscure (passé simple, subj imparfait,
      cond 1pl/2pl),
    - the surface text folds to all-A-Z (foldToAscii contract),
    - its length is in [length_min, length_max] and its frequency is
      >= min_freq.

    On homograph ties (same surface, two lemmas both in-corpus) the
    higher-freq row wins. Counters report admissions, blocks, and
    placement skips for the build summary.
    """
    out: dict[str, tuple[str, int]] = {}
    counters: dict[str, int] = {
        "scanned": 0,
        "lemma-not-in-corpus": 0,
        "obscure-passe-simple": 0,
        "obscure-subj-imparfait": 0,
        "obscure-cond-1pl-2pl": 0,
        "obscure-inversion": 0,
        "not-placeable": 0,
        "length-out-of-range": 0,
        "below-min-freq": 0,
        "admitted": 0,
    }
    seen_header = False
    flex_idx = lemme_idx = etiq_idx = tot_idx = -1
    with lexique.open(encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            cols = line.rstrip("\n").split("\t")
            if not seen_header:
                if ("Flexion" in cols and "Lemme" in cols
                        and "Étiquettes" in cols and "Total occurrences" in cols):
                    flex_idx = cols.index("Flexion")
                    lemme_idx = cols.index("Lemme")
                    etiq_idx = cols.index("Étiquettes")
                    tot_idx = cols.index("Total occurrences")
                    seen_header = True
                continue
            if len(cols) <= max(flex_idx, lemme_idx, etiq_idx, tot_idx):
                continue
            counters["scanned"] += 1
            lemma = cols[lemme_idx]
            if lemma.lower() not in in_corpus_lemmas:
                counters["lemma-not-in-corpus"] += 1
                continue
            obscure = is_obscure_tag(cols[etiq_idx])
            if obscure:
                counters[f"obscure-{obscure}"] += 1
                continue
            flex = cols[flex_idx]
            if not _is_grid_placeable(flex):
                counters["not-placeable"] += 1
                continue
            L = len(flex)
            if not (length_min <= L <= length_max):
                counters["length-out-of-range"] += 1
                continue
            try:
                freq = int(cols[tot_idx])
            except ValueError:
                continue
            if freq < min_freq:
                counters["below-min-freq"] += 1
                continue
            existing = out.get(flex)
            if existing is None or freq > existing[1]:
                out[flex] = (lemma, freq)
                if existing is None:
                    counters["admitted"] += 1
    return out, counters


def _load_in_corpus_lemmas(wordlist: Path) -> set[str]:
    """Return the set of lemmas present in the current wordlist (lowercased).

    Falls back to the `word` column when `lemma` is empty (legacy rows).
    """
    out: set[str] = set()
    with wordlist.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            lemma = (r.get("lemma") or "").strip().lower()
            if not lemma:
                lemma = (r.get("word") or "").strip().lower()
            if lemma:
                out.add(lemma)
    return out


# The wordlist-mutation CLI once here is retired in favor of assemble_corpus.py (ADR-0100); the parse functions above remain the pure surface->(lemma,freq) source other modules import.
