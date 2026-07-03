#!/usr/bin/env python3
"""Recover curated passé-simple false positives into words-fr.csv.

The lemma-anchored admission (import_grammalecte_long_words.py) blanket-bans
`ipsi` surfaces — right for the ~41k archaic/foreign/obscure forms, wrong for
the hand-picked common, tonally clean forms below (FIT, OSA, TINT, ...). This
script admits ONLY the curated allowlist and machine-inflects each form's
clue(s) from its source verb's existing lemma clues via `inflect_clue` at the
exact mood + person carried by the surface's grammalecte tags; no clue text
is hand-written here, and the general ban stays untouched. Rows are stamped
source=bliss like the other curated short-word overlays so the full-merge
scrub (merge_clues_into_wordlist.py) never blanks them. Idempotent: prior
source=bliss rows for allowlisted surfaces are replaced on re-run.
"""
from __future__ import annotations
import argparse
import csv
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "eval"))
sys.path.insert(0, str(REPO / "scripts" / "clue_generation"))

from morphology_index import MorphologyIndex, _classify, normalize_tag  # noqa: E402
from clue_metrics import fits_single_cell  # noqa: E402
from build_surface_clues import classify_inflection  # noqa: E402
from inflect_clue import _FUNCTION_WORDS, _TOKEN_RE, _is_alpha_token  # noqa: E402

_HEAD_SKIP = _FUNCTION_WORDS | {"se", "s", "n", "y"}

DEFAULT_WORDLIST = REPO / "grid/infrastructure/src/main/resources/words/words-fr.csv"
DEFAULT_CORPUS = REPO / "data/eval/production/lemma_clues_raw_pos_fixed.csv"
DEFAULT_LEXIQUE = Path(os.path.expanduser(
    "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt"))

MAX_CLUES_PER_FORM = 3

# surface -> source verb. Hand-picked false positives of the ipsi ban
# (docs/superpowers/plans/2026-07-03-short-word-cooldown-fix.md, list B):
# common verbs, guessable forms, tonally clean. Vulgar/obscure/archaic
# forms stay banned — do NOT widen this list by analogy.
ALLOWLIST: dict[str, str] = {
    # Irregular auxiliaries / modals (highest value).
    "fit": "faire", "fis": "faire",
    "mit": "mettre", "mis": "mettre",
    "put": "pouvoir",
    "vit": "voir",
    "dut": "devoir", "dus": "devoir",
    "sut": "savoir", "sus": "savoir",
    "lut": "lire", "lus": "lire",
    "dit": "dire", "dis": "dire",
    "fus": "être",
    "eus": "avoir",
    "tint": "tenir", "tins": "tenir",
    "mut": "mouvoir", "mus": "mouvoir",
    "tut": "taire", "tus": "taire",
    "rit": "rire",
    # Common -er verbs, 3sg (guessable, tonally clean). buta/riva/tapa/fia/
    # rua/dosa are deliberately absent: their corpus lemma clues carry a
    # wrong sense (buter->Beurrer, river->Cours d'eau, taper->S'affiner,
    # fier->adjective reading, ruer->Galoper, doser->Administrer); re-add
    # once the lemma clue is fixed upstream.
    "osa": "oser", "ôta": "ôter", "tua": "tuer",
    "sua": "suer", "hua": "huer", "nua": "nuer",
    "pua": "puer", "mua": "muer", "arma": "armer", "fila": "filer",
    "leva": "lever", "loua": "louer", "noua": "nouer", "vida": "vider",
    "gela": "geler", "géra": "gérer", "gêna": "gêner", "sala": "saler",
    "cala": "caler", "gara": "garer", "gâta": "gâter",
    "dora": "dorer", "dopa": "doper", "fêta": "fêter",
    "fuma": "fumer", "huma": "humer", "héla": "héler", "lima": "limer",
    "mina": "miner", "mira": "mirer", "mura": "murer", "muta": "muter",
    "pana": "paner", "pela": "peler", "pila": "piler", "rama": "ramer",
    "rima": "rimer", "rota": "roter", "roua": "rouer",
    "scia": "scier", "dama": "damer", "lésa": "léser",
    "mima": "mimer", "misa": "miser", "mita": "miter", "cela": "celer",
    "lova": "lover", "musa": "muser", "rusa": "ruser", "sapa": "saper",
    "téta": "téter", "laça": "lacer", "lapa": "laper", "cira": "cirer",
    "cota": "coter", "fana": "faner", "goba": "gober", "loba": "lober",
    "pava": "paver", "pipa": "piper", "râla": "râler", "râpa": "râper",
    "rida": "rider", "roda": "roder", "vexa": "vexer",
}


def _leading_reflexive(clue: str) -> bool:
    for tok in _TOKEN_RE.findall(clue):
        if not _is_alpha_token(tok):
            continue
        return tok.lower() in ("se", "s")
    return False


def _infinitive_led(clue: str, index: MorphologyIndex) -> bool:
    """True iff the clue's first non-function content token is a verb in the
    infinitive — the lemma-form verb-clue shape that inflects safely. Rejects
    nominal clues whose embedded verb the head ranker would otherwise grab
    (`Obligation à remplir` -> *`Obligation à remplit`)."""
    for tok in _TOKEN_RE.findall(clue):
        if not _is_alpha_token(tok):
            continue
        lo = tok.lower()
        if lo in _HEAD_SKIP:
            continue
        if "verbe" not in index.pos_classes_of_form(lo):
            return False
        return index.lemma_of_form(lo, prefer_pos="verbe") == lo
    return False


def _surface_freqs(lexique: Path, wanted: set[str]) -> dict[str, int]:
    """Max grammalecte `Total occurrences` per wanted surface (lowercased)."""
    out: dict[str, int] = {}
    seen_header = False
    flex_idx = tot_idx = -1
    with lexique.open(encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            cols = line.rstrip("\n").split("\t")
            if not seen_header:
                if "Flexion" in cols and "Total occurrences" in cols:
                    flex_idx = cols.index("Flexion")
                    tot_idx = cols.index("Total occurrences")
                    seen_header = True
                continue
            if len(cols) <= max(flex_idx, tot_idx):
                continue
            flex = cols[flex_idx].lower()
            if flex not in wanted:
                continue
            try:
                freq = int(cols[tot_idx])
            except ValueError:
                continue
            out[flex] = max(out.get(flex, 0), freq)
    return out


def _lemma_clues(lemma: str, corpus: dict[str, list[str]], wordlist_clues: dict[str, str]) -> list[str]:
    """Distinct candidate lemma-form clues, corpus first then wordlist row."""
    clues = list(corpus.get(lemma, []))
    wl = wordlist_clues.get(lemma)
    if wl and wl.lower() != lemma.lower() and wl not in clues:
        clues.append(wl)
    return clues


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--wordlist", type=Path, default=DEFAULT_WORDLIST)
    p.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    p.add_argument("--lexique", type=Path, default=DEFAULT_LEXIQUE)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    print("loading morphology index...", file=sys.stderr)
    index = MorphologyIndex.load(args.lexique)
    freqs = _surface_freqs(args.lexique, set(ALLOWLIST))

    corpus: dict[str, list[str]] = {}
    with args.corpus.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r.get("validation_flag") != "ok" or r.get("pos") != "verbe":
                continue
            clue = (r.get("lemma_clue") or "").strip()
            if clue and clue not in corpus.setdefault(r["lemma"], []):
                corpus[r["lemma"]].append(clue)

    with args.wordlist.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys())

    wordlist_clues: dict[str, str] = {}
    for r in rows:
        w = r["word"].strip().lower()
        if w not in wordlist_clues and (r.get("clue") or "").strip():
            wordlist_clues[w] = r["clue"].strip()

    existing_nonbliss: set[str] = set()
    out_rows: list[dict] = []
    replaced = 0
    for r in rows:
        w = r["word"].strip().lower()
        if w in ALLOWLIST and r.get("source") == "bliss":
            replaced += 1
            continue
        if w in ALLOWLIST:
            existing_nonbliss.add(w)
        out_rows.append(r)

    added_words = 0
    added_rows = 0
    report: list[str] = []
    for surface, lemma in sorted(ALLOWLIST.items()):
        if surface.lower() in existing_nonbliss:
            report.append(f"{surface}: SKIP (non-curated row already present)")
            continue
        analyses = [
            (lm, tags) for lm, tags in index.lookup_form(surface)
            if lm.lower() == lemma.lower() and _classify(tags) == "verbe"
        ]
        if not analyses:
            report.append(f"{surface}: SKIP (no grammalecte analysis for {lemma})")
            continue
        sources = _lemma_clues(lemma, corpus, wordlist_clues)
        if not sources:
            report.append(f"{surface}: SKIP (no lemma clue for {lemma})")
            continue
        clues: list[str] = []
        for _lm, tags in analyses:
            norm = {normalize_tag(t) for t in tags}
            third_person = bool(norm & {"3sg", "3pl"})
            for source_clue in sources:
                if len(clues) >= MAX_CLUES_PER_FORM:
                    break
                if not _infinitive_led(source_clue, index):
                    continue
                # A reflexive source keeps its `Se` verbatim, which only stays
                # grammatical when the target person is third (`Se déplaça`
                # yes, *`Se déplaças` no).
                if _leading_reflexive(source_clue) and not third_person:
                    continue
                text, status = classify_inflection(source_clue, norm, index)
                if status not in ("inflected", "identity"):
                    continue
                if not fits_single_cell(text):
                    continue
                if surface.lower() in text.lower().split() or lemma.lower() in text.lower().split():
                    continue
                if text not in clues:
                    clues.append(text)
        if not clues:
            report.append(f"{surface}: UNRECOVERED (no clean inflection from {len(sources)} source clues)")
            continue
        base = {k: "" for k in fieldnames}
        base["word"] = surface
        base["language"] = "fr"
        base["length"] = str(len(surface))
        base["frequency"] = str(freqs.get(surface, 0))
        base["source"] = "bliss"
        base["source_license"] = "CC0-1.0"
        base["lemma"] = lemma
        for i, clue in enumerate(clues):
            row = dict(base)
            row["clue"] = clue
            out_rows.append(row)
            added_rows += 1
        added_words += 1
        report.append(f"{surface}: +{len(clues)} clue(s) {clues}")

    for line in report:
        print("  " + line)
    print(f"recovered forms:   {added_words}/{len(ALLOWLIST)}")
    print(f"rows appended:     {added_rows}")
    print(f"stale rows dropped: {replaced}")
    if args.dry_run:
        print("--dry-run: not writing")
        return
    with args.wordlist.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in out_rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})
    print(f"wrote {args.wordlist}")


if __name__ == "__main__":
    main()
