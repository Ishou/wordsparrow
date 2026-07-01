#!/usr/bin/env python3
"""Restructure or drop stale `Ne pas <inf>` clues already in words-fr.csv.

The inflater now rewrites `Ne pas V → Ne V pas` for finite surfaces and skips
past participles, but clues merged before that fix still ship the broken
`Ne pas <inflected>` shape (`espère → "Ne pas désespère"`). This one-off scrub
fixes the rows already present, operating on the clue text directly so the
already-correct surface verb form is preserved (no re-inflation / person drift):

- head is a finite verb form  → restructure the particles in place
  (`Ne pas désespère → Ne désespère pas`, eliding `ne → n'`);
- head is a bare past participle / non-finite → blank the clue (the loader drops
  blank-clue rows; the higher-freq present sibling supplies the grid clue).

Only the clue field of matched rows is rewritten; every other row keeps its
exact bytes.
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

from inflect_clue import (  # noqa: E402
    _NEG_RESTRUCTURE_MOODS,
    _REFLEXIVE_CLITICS,
    _TOKEN_RE,
    _capitalize_first,
    _detokenize,
    _is_alpha_token,
    _negation_frame,
    _restructure_negation,
)
from import_grammalecte_long_words import DEFAULT_LEXIQUE, DEFAULT_WORDLIST  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402


def _head_after_pas(tokens: list[str], pas_idx: int, index: MorphologyIndex) -> int | None:
    """Index of the verb the negation governs — the first non-reflexive content
    token after `pas`. None if that token isn't a verb (not a plain negated verb)."""
    for i in range(pas_idx + 1, len(tokens)):
        if not _is_alpha_token(tokens[i]):
            continue
        lo = tokens[i].lower()
        if lo in _REFLEXIVE_CLITICS:
            continue
        return i if "verbe" in index.pos_classes_of_form(lo) else None
    return None


def _head_moods(surface: str, index: MorphologyIndex) -> set[str]:
    moods: set[str] = set()
    for _, tags in index.lookup_form(surface.lower()):
        moods |= set(tags)
    return moods


def fix_clue(clue: str, index: MorphologyIndex) -> tuple[str, str]:
    tokens = _TOKEN_RE.findall(clue)
    neg = _negation_frame(tokens)
    if neg is None:
        return clue, "kept"
    ne_idx, pas_idx = neg
    head_idx = _head_after_pas(tokens, pas_idx, index)
    if head_idx is None:
        return clue, "kept"
    moods = _head_moods(tokens[head_idx], index)
    # Finite / present-participle → restructure `ne X pas`. Infinitive keeps
    # `ne pas X` (already correct). Past-participle-only → blank (no simple
    # negation; the present sibling supplies the grid clue).
    if not (moods & _NEG_RESTRUCTURE_MOODS):
        return ("", "blanked") if "infi" not in moods else (clue, "kept")
    restructured = _restructure_negation(tokens, ne_idx, pas_idx, head_idx)
    if restructured is None:
        return clue, "kept"
    return _capitalize_first(_detokenize(restructured)), "restructured"


def _reserialize(fields: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(fields)
    return buf.getvalue()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--lexique", type=Path, default=DEFAULT_LEXIQUE)
    p.add_argument("--wordlist", type=Path, default=DEFAULT_WORDLIST)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    if not args.lexique.exists():
        raise SystemExit(f"grammalecte lexique not found: {args.lexique}")
    index = MorphologyIndex.load(args.lexique)

    lines = args.wordlist.read_text(encoding="utf-8").splitlines(keepends=True)
    header, body = lines[0], lines[1:]
    clue_idx = header.rstrip("\n").split(",").index("clue")

    out, counts, samples = [header], {"restructured": 0, "blanked": 0}, []
    for line in body:
        newline_suffix = line[len(line.rstrip("\n")):]
        fields = next(csv.reader([line.rstrip("\n")]))
        clue = fields[clue_idx]
        if not clue.startswith("Ne pas "):
            out.append(line)
            continue
        new_clue, action = fix_clue(clue, index)
        if action == "kept":
            out.append(line)
            continue
        counts[action] += 1
        if len(samples) < 8:
            samples.append((fields[0], clue, "->", new_clue or "(blanked)"))
        fields[clue_idx] = new_clue
        out.append(_reserialize(fields) + newline_suffix)

    print(f"restructured {counts['restructured']}, blanked {counts['blanked']}")
    for s in samples:
        print("  ", *s)
    if args.dry_run:
        return
    args.wordlist.write_text("".join(out), encoding="utf-8")
    print(f"wrote {args.wordlist}")


if __name__ == "__main__":
    main()
