"""Regression guard: every clued row in the shipped words-fr.csv must carry a
lemma that grammalecte actually assigns to the surface form. This is what
makes the generator's per-grid same-lemma dedup (`WordAcceptor`) effective —
`lia` and `lie` only stay off one grid together if both resolve to `lier`.

The live-grid bug this guards was `lia` shipping with lemma `lia` (a corpus
emitter defaulting the lemma to the surface form), so it dodged dedup against
`lie`/`lié` and both landed on one puzzle. Homographs whose surface is itself
a valid lemma (the noun `lie` alongside the verb `lier`) are legitimate and
pass.

If this fails, run:
    python scripts/clue_generation/reconcile_lemmas.py --wordlist <the csv> \
        [--overrides <surface,lemma csv for ambiguous forms>]

Skips gracefully without the grammalecte lexique or the (private) corpus."""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from morphology_index import MorphologyIndex  # noqa: E402
from reconcile_lemmas import reconcile  # noqa: E402

_NEW = REPO / "grid" / "infrastructure" / "src" / "main" / "resources" / "words" / "words-fr.csv"
_OLD = REPO / "grid" / "api" / "src" / "main" / "resources" / "words" / "words-fr.csv"
WORDLIST = _NEW if _NEW.exists() else _OLD

_DEFAULT_LEX = Path(os.path.expanduser("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))


def _lexique() -> Path | None:
    p = Path(os.environ.get("GRAMMALECTE_LEX", str(_DEFAULT_LEX)))
    return p if p.exists() else None


def _rows() -> list[dict]:
    if not WORDLIST.exists():
        return []
    with WORDLIST.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _violations(rows: list[dict], index: MorphologyIndex) -> list[tuple[str, str, list[str]]]:
    """Rows whose lemma is a surface-default that grammalecte proves wrong: the
    surface is a genuine inflected form with a UNIQUE headword (status "fixed").

    Only clued rows can collide on a grid, so empty-clue rows are skipped.
    Status "ambiguous" (e.g. the noun `vue`, which grammalecte only knows as a
    form of `voir`/`vu`) is NOT failed here — those need a human-authored lemma,
    not an automatic rewrite, and hard-failing would red-flag legitimate
    homograph nouns. `reconcile_lemmas.py --check` reports them for review."""
    hits: list[tuple[str, str, list[str]]] = []
    for r in rows:
        if not (r.get("clue") or "").strip():
            continue
        surface = (r.get("word") or "").strip()
        lemma = (r.get("lemma") or "").strip()
        pos = (r.get("pos") or "").strip() or None
        status, _ = reconcile(surface, lemma, index, pos=pos)
        if status == "fixed":
            cands = sorted({l for l, _ in index.lookup_form(surface)})
            hits.append((surface, lemma, cands))
    return hits


def test_runtime_words_csv_lemmas_are_valid_for_their_surface() -> None:
    lex = _lexique()
    if lex is None:
        return  # lexique absent — nothing to guard.
    hits = _violations(_rows(), MorphologyIndex.load(lex))
    assert not hits, (
        f"words-fr.csv ships {len(hits)} rows whose lemma is invalid for the "
        f"surface (defeats same-lemma dedup); run reconcile_lemmas.py. "
        f"first 5: {hits[:5]}"
    )


def test_guard_fires_on_surface_defaulted_lemma_and_passes_homograph() -> None:
    """Proves the guard wiring itself, independent of the (private) corpus."""
    lex = _lexique()
    if lex is None:
        return
    index = MorphologyIndex.load(lex)
    rows = [
        {"word": "lia", "pos": "verbe", "lemma": "lia", "clue": "Attacha jadis"},  # violation
        {"word": "es", "pos": "abr", "lemma": "es", "clue": "Mi bémol"},  # OK (note)
        {"word": "es", "pos": "verbe", "lemma": "être", "clue": "Existes"},  # OK
        {"word": "lia", "pos": "verbe", "lemma": "lier", "clue": "Attacha jadis"},  # already correct
        {"word": "lia", "pos": "verbe", "lemma": "lia", "clue": ""},  # unclued: not placeable, ignored
    ]
    hits = _violations(rows, index)
    assert [h[0] for h in hits] == ["lia"]  # only the clued surface-defaulted row
