#!/usr/bin/env python3
"""Emit words-fr.csv rows for authored lemmas plus the surfaces whose clue inflects provably — `inflect_clue`'s own flag is not a shipping gate (ADR-0107), so every inflected clue is re-verified here."""
import argparse
import collections
import csv
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from clue_metrics import MAX_CLUE_CHARS  # noqa: E402
from demonette_leak import require_inputs  # noqa: E402
from inflect_clue import _TOKEN_RE, _is_alpha_token, inflect_clue  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent / "clue_generation" / "pipeline_v2"))
import filters as _F  # noqa: E402
from morphology_index import MorphologyIndex  # noqa: E402

# `du`/`au`/`le`… cannot govern a plural, so a pluralised token behind one is ungrammatical.
SINGULAR_ONLY_DETERMINERS = {
    "du", "au", "le", "la", "un", "une", "ce", "cet", "cette",
    "son", "sa", "mon", "ma", "ton", "ta", "l", "d",
}


def fold(s):
    d = unicodedata.normalize("NFD", s.replace("œ", "oe").replace("æ", "ae"))
    return "".join(c for c in d if unicodedata.category(c) != "Mn")


def grid_foldable(s):
    a = fold(s)
    return a.isalpha() and a.isascii()


def _feats_of(form, index):
    feats = set()
    for _lemma, tags in index.lookup_form(form):
        feats |= set(tags)
    return feats


def _is_unambiguous_finite_verb(form, index):
    """Verb-only readings; `bois` and `porte` also read as nouns and are not verbs here."""
    readings = index.lookup_form(form)
    if not readings:
        return False
    if any({"nom", "adj"} & set(tags) for _lemma, tags in readings):
        return False
    return any({"ipre", "iimp", "ifut", "cond", "spre"} & set(tags) for _lemma, tags in readings)


# The deterministic half of the pipeline_v2 gate (§8.3). filter_8 is the learned judge and is
# excluded: it scores in shadow mode and cannot reject.
_VETTING_FILTERS = (
    "filter_1_typographiques", "filter_2_caracteres_interdits", "filter_3_longueur",
    "filter_4_stereotypes_ia", "filter_5_auto_reference", "filter_6_langue_fr",
    "filter_7_tautologie", "filter_9_stem_leak", "filter_10_pleonasm",
    "filter_11_derivational_leak",
)


def vet_clue(lemma: str, clue: str, pos: str, style: str) -> str | None:
    """Rejection reason from the generation lane's deterministic filters, or None when the clue passes."""
    row = {"mot": lemma, "definition": clue, "pos": pos, "style": style, "lemma": lemma}
    for name in _VETTING_FILTERS:
        result = getattr(_F, name)(row)
        if result.is_reject:
            return f"{name}: {result.reason}"
    return None


def inflection_is_safe(clue, result, surface_tags, index):
    """`(ok, reason)` for shipping `result` as the clue of a surface tagged `surface_tags`."""
    if result.flag != "":
        return False, f"inflect_clue flag: {result.flag}"
    before, after = _TOKEN_RE.findall(clue), _TOKEN_RE.findall(result.text)
    if len(before) != len(after):
        return False, "token count changed"
    changed = [i for i, (x, y) in enumerate(zip(before, after)) if x != y]
    if not changed:
        return False, "head did not inflect"

    number = "pl" if "pl" in surface_tags else ("sg" if "sg" in surface_tags else None)
    for i in changed:
        old, new = before[i].lower(), after[i].lower()
        if index.lemma_of_form(new) != index.lemma_of_form(old):
            return False, "lemma drift"
        feats = _feats_of(new, index)
        # verb forms carry a person tag (`3pl`), nominals carry bare number (`pl`)
        satisfied = number in feats or "inv" in feats or f"3{number}" in feats
        if number and not satisfied:
            return False, "target number absent"
        if i > 0 and number == "pl" and before[i - 1].lower() in SINGULAR_ONLY_DETERMINERS \
                and (i - 1) not in changed:
            return False, "plural behind singular determiner"
        # A hyphen welds a compound (`couvre-chef`), whose first element is not a head to conjugate.
        if (i + 1 < len(before) and before[i + 1] == "-") or (i > 0 and before[i - 1] == "-"):
            return False, "hyphenated compound element"

    if number == "pl":
        for i, tok in enumerate(before):
            if i in changed or not _is_alpha_token(tok):
                continue
            if _is_unambiguous_finite_verb(tok.lower(), index) \
                    and "3pl" not in _feats_of(tok.lower(), index):
                return False, "finite verb left unagreed"
    return True, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clues", type=Path, required=True, help="curated clues.csv (lemma,clue,...)")
    ap.add_argument("--lexique", type=Path, required=True)
    ap.add_argument("--corpus", type=Path, required=True, help="existing words-fr.csv, for dedup")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--source", default="bliss")
    ap.add_argument("--drop-rejected", action="store_true",
                    help="emit the surviving clues instead of failing when the gate rejects some")
    ap.add_argument("--no-vet", action="store_true",
                    help="skip the deterministic gate entirely (leaves authored clues unchecked)")
    args = ap.parse_args()

    # A leak filter without its graph accepts everything, so demand it unless vetting is off.
    if not args.no_vet:
        require_inputs()

    index = MorphologyIndex.load(args.lexique)
    occ = {}
    with args.lexique.open(encoding="utf-8") as fh:
        seen_header = False
        f_idx = t_idx = -1
        for line in fh:
            if line.startswith("#"):
                continue
            cols = line.rstrip("\n").split("\t")
            if not seen_header:
                if cols[:1] == ["id"] and "Flexion" in cols and "Total occurrences" in cols:
                    f_idx = cols.index("Flexion")
                    t_idx = cols.index("Total occurrences")
                    seen_header = True
                continue
            if len(cols) <= max(f_idx, t_idx):
                continue
            try:
                occ[cols[f_idx]] = max(occ.get(cols[f_idx], 0), int(cols[t_idx]))
            except ValueError:
                pass

    existing = {(r["word"], r["clue"]) for r in csv.DictReader(args.corpus.open(encoding="utf-8"))}
    clues = collections.defaultdict(list)
    rejected: list[tuple[str, str, str]] = []
    for r in csv.DictReader(args.clues.open(encoding="utf-8")):
        lemma, clue = r["lemma"], r["clue"]
        pos = r.get("pos") or "nom"
        if not args.no_vet:
            reason = vet_clue(lemma, clue, pos, r.get("style") or "")
            if reason is not None:
                rejected.append((lemma, clue, reason))
                continue
        clues[lemma].append((clue, pos, r.get("head_pos") or None))

    if rejected:
        print(f"{len(rejected)} authored clue(s) rejected by the deterministic gate:", file=sys.stderr)
        for lemma, clue, reason in rejected:
            print(f"  {lemma}\t{clue!r}\t{reason}", file=sys.stderr)
        if not args.drop_rejected:
            print("fix the source, or re-run with --drop-rejected to emit the rest", file=sys.stderr)
            return 1

    rows, dropped = [], collections.Counter()
    for lemma, entries in clues.items():
        for clue, pos, _head in entries:
            if (lemma, clue) not in existing:
                rows.append((lemma, clue, pos, lemma))
        for form, tags in index.by_lemma.get(lemma, []):
            if form == lemma or not grid_foldable(form) or not (2 <= len(form) <= 15):
                continue
            for clue, pos, head_pos in entries:
                result = inflect_clue(clue, set(tags), index, head_pos)
                ok, reason = inflection_is_safe(clue, result, set(tags), index)
                if not ok:
                    dropped[reason.split(":")[0]] += 1  # coarse bucket, token elided
                    continue
                if len(result.text) > MAX_CLUE_CHARS:
                    dropped["over cap"] += 1
                    continue
                if (form, result.text) in existing:
                    dropped["already in corpus"] += 1
                    continue
                rows.append((form, result.text, pos, lemma))

    with args.out.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["word", "language", "length", "frequency", "difficulty",
                    "clue", "source", "source_license", "pos", "lemma"])
        for word, clue, pos, lemma in rows:
            w.writerow([word, "fr", len(word), occ.get(word, 0), "", clue,
                        args.source, "CC0-1.0", pos, lemma])

    lemma_rows = sum(1 for r in rows if r[0] == r[3])
    print(f"rows emitted: {len(rows)}  ({lemma_rows} lemma-form, {len(rows) - lemma_rows} inflected)")
    print(f"distinct surfaces: {len({r[0] for r in rows})}")
    for reason, n in dropped.most_common():
        print(f"  dropped — {reason}: {n}")
    print(f"written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
