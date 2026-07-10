#!/usr/bin/env python3
"""Reconcile the `lemma` column of a words CSV against grammalecte morphology.

The grid generator's per-grid dedup (`WordAcceptor`) forbids two surfaces
that share a lemma, which is how a puzzle avoids shipping both `lie` and
`lia` — two inflections of `lier` — side by side. That only works if every
inflected form of a headword carries the SAME lemma string. But several
corpus emitters default the lemma to the surface form when they don't hold
a headword (`add_short_word_clues.py`, the editorial-merge fallback), so
`lia` shipped with lemma `lia` instead of `lier` and silently dodged dedup.

This pass is the single source of truth for the column: for every row the
declared lemma must be one grammalecte actually assigns to the surface.
When it isn't, replace it with the unique headword; when the surface is a
form of several headwords (`tue` -> taire/tuer) refuse to guess and leave
it for an explicit `--overrides` entry. Homographs whose surface is itself
a valid lemma (the noun `lie` alongside the verb `lier`) are left untouched
— they legitimately coexist on a grid.

Deterministic and idempotent: re-running on a reconciled CSV is a no-op.
"""
from __future__ import annotations

import argparse
import csv
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "eval"))
from morphology_index import MorphologyIndex, _classify  # noqa: E402


def _norm(s: str) -> str:
    """Casefold + strip diacritics so `âge`/`age` and `Lier`/`lier` compare equal."""
    stripped = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return stripped.casefold().strip()


def _is_inflection(tags) -> bool:
    """True when the analysis is a genuine inflected form whose citation lemma
    legitimately differs from the surface — a verb form, or a plural/feminine
    noun/adjective. An invariable noun (`inv`) is its own citation form:
    grammalecte hands sigles/abbreviations a shorter pseudo-lemma (`am`->`m`,
    `cg`->`g`), which is spurious, so `inv` analyses never justify a rewrite —
    unless they also carry a verb paradigm (`pris` = ppas+inv of `prendre`)."""
    if _classify(tags) == "verbe":
        return True
    if "inv" in tags:
        return False
    return "pl" in tags or "fem" in tags


def reconcile(
    surface: str,
    lemma: str,
    index: MorphologyIndex,
    overrides: dict[str, str] | None = None,
) -> tuple[str, str]:
    """Return (status, lemma) for one row. Status is one of:

    - "ok"          declared lemma is grammatically valid for the surface.
    - "fixed"       surface is a genuine inflection with a UNIQUE headword; it replaces the lemma.
    - "override"    inflection + ambiguous, resolved by an explicit override.
    - "bad-override" an override was supplied but isn't a headword of the surface.
    - "ambiguous"   inflection, several candidate headwords, no override — unchanged.
    - "kept"        surface is not a genuine inflection (abbreviation / invariable) — lemma left as-is.
    - "unknown"     grammalecte doesn't know the surface — lemma left as-is.
    """
    overrides = overrides or {}
    forms = index.lookup_form(surface)
    if not forms:
        return ("unknown", lemma)
    if _norm(lemma) in {_norm(l) for l, _ in forms}:
        return ("ok", lemma)
    headwords = {l for l, t in forms if _is_inflection(t)}
    if not headwords:
        return ("kept", lemma)
    ov = overrides.get(surface.lower())
    if ov is not None:
        return ("override", ov) if _norm(ov) in {_norm(h) for h in headwords} else ("bad-override", lemma)
    if len(headwords) == 1:
        return ("fixed", next(iter(headwords)))
    return ("ambiguous", lemma)


def _load_overrides(path: Path | None) -> dict[str, str]:
    if not path or not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        return {r["surface"].strip().lower(): r["lemma"].strip() for r in csv.DictReader(f)}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--wordlist", type=Path,
                   default=REPO / "grid/infrastructure/src/main/resources/words/words-fr.csv")
    p.add_argument("--lexique", type=Path,
                   default=Path("~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt").expanduser())
    p.add_argument("--overrides", type=Path,
                   help="CSV with `surface,lemma` columns for ambiguous forms")
    p.add_argument("--check", action="store_true",
                   help="report only; exit non-zero if any row needs fixing (no write)")
    args = p.parse_args()

    index = MorphologyIndex.load(args.lexique)
    overrides = _load_overrides(args.overrides)

    with args.wordlist.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys())
    if "lemma" not in fieldnames:
        print("no lemma column in wordlist; nothing to reconcile", file=sys.stderr)
        return 1

    fixed = 0
    ambiguous: list[tuple[str, str]] = []
    for r in rows:
        surface = (r.get("word") or "").strip()
        status, new_lemma = reconcile(surface, (r.get("lemma") or "").strip(), index, overrides)
        if status in ("fixed", "override"):
            r["lemma"] = new_lemma
            fixed += 1
        elif status in ("ambiguous", "bad-override"):
            ambiguous.append((surface, r.get("lemma", "")))

    for surface, lemma in ambiguous[:20]:
        cands = sorted({l for l, _ in index.lookup_form(surface)})
        print(f"AMBIGUOUS {surface!r} (lemma={lemma!r}) -> add an override for one of {cands}", file=sys.stderr)
    print(f"rows needing a fix: {fixed}; unresolved (ambiguous): {len(ambiguous)}")

    if args.check:
        return 1 if (fixed or ambiguous) else 0

    if fixed:
        with args.wordlist.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in fieldnames})
        print(f"wrote {args.wordlist}")
    return 1 if ambiguous else 0


if __name__ == "__main__":
    raise SystemExit(main())
