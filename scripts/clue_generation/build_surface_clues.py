#!/usr/bin/env python3
"""Build a per-surface clue table from the (lemma, pos)-keyed corpus.

For each surface form in words-fr.csv (4-15 chars), determine the owning
(lemma, pos) by grammalecte total-occurrences (with POS precedence
nom > adj > adv > verbe on ties), then either copy the lemma's clue
verbatim (if surface == lemma) or inflect the clue's head token to
match the surface's morphology.

Output columns:
  surface, lemma, pos, clue, source_clue, inflection_status,
  filter_score, validation_flag

inflection_status values:
  - "verbatim"              : surface == lemma, clue copied as-is
  - "inflected"             : head token successfully inflected
  - "identity"              : inflected == original (already correct form)
  - "no-inflection"         : index.inflect returned None for non-finite target
                              (ppas/nominal/adj — lemma fallback is acceptable)
  - "no-inflection-finite"  : index.inflect returned None for a finite-verb
                              target (ipsi/simp/etc. with no `ppas` in target).
                              Routed to dropped — shipping the lemma-form
                              infinitive on a finite-tense surface reads as
                              a tense disagreement (extraire/soustraire are
                              defective at passé simple in grammalecte).
  - "agreement-mismatch"    : inflated clue head's number disagrees with the
                              surface's number (singular inversion form posè
                              inflated to plural head Placent). Routed to
                              dropped — a plural clue on a singular answer.
  - "head-pos-mismatch"     : no clue head matches surface POS
  - "no-target-pos"         : surface POS not in {nom, adj, verbe}
  - "no-owner"              : no (lemma, pos) candidate has a clue in corpus
"""
from __future__ import annotations
import argparse, csv, os, re, sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "eval"))
from morphology_index import MorphologyIndex, _classify, normalize_tag  # noqa: E402
from inflect_clue import _FUNCTION_WORDS, inflect_clue  # noqa: E402
from clue_metrics import MAX_CLUE_CHARS, fits_single_cell  # noqa: E402

POS_PRECEDENCE = {"nom": 0, "adj": 1, "adv": 2, "verbe": 3}

_NUMBER_TOK_RE = re.compile(r"[\wÀ-ÿŒœŸ]+", re.UNICODE)
# Finite-verb person tags, incl. the inversion persons PERSON_TOKENS omits.
_PERSON_TAGS = {"1sg", "2sg", "3sg", "1pl", "2pl", "3pl", "1isg", "2isg", "3isg"}


def _verb_number(tags) -> str | None:
    """Map a grammalecte tag set to grammatical number. The inversion persons
    `1isg/2isg/3isg` are singular but absent from PERSON_TOKENS — exactly why
    the inflater dropped the person constraint and produced a plural head."""
    t = set(tags)
    if t & {"1sg", "2sg", "3sg", "1isg", "2isg", "3isg", "sg"}:
        return "sg"
    if t & {"1pl", "2pl", "3pl", "pl"}:
        return "pl"
    return None


def _head_verb_numbers(text: str, index: MorphologyIndex) -> set[str]:
    """Numbers the inflated clue's head (first finite-verb token) can take,
    across all of that token's finite-verb readings. Returning the full set
    (not the first hit) avoids homograph false positives — `Sommes` reads as
    être-1pl (pl) AND sommer-2sg (sg); the head agrees as long as the surface
    number is achievable by some reading."""
    for tok in _NUMBER_TOK_RE.findall(text):
        # Negation/function words (`ne`, `plus`) carry spurious verb readings.
        if tok.lower() in _FUNCTION_WORDS:
            continue
        numbers = {
            _verb_number(tags)
            for _lemma, tags in index.lookup_form(tok.lower())
            if tags & _PERSON_TAGS
        }
        numbers.discard(None)
        if numbers:
            return numbers
    return set()


def classify_inflection(
    source_clue: str, surface_tags: set[str], index: MorphologyIndex,
) -> tuple[str, str]:
    """Inflate the head, then gate finite-verb surfaces on clue↔surface number
    agreement. Returns (clue_text, status). A finite-verb clue whose head
    cannot take the surface's number becomes `agreement-mismatch`
    (posè→Placent, réprimè→Font cesser). Scoped to surfaces carrying a person
    tag (finite verbs) so participles and noun/adj number quirks don't
    false-positive."""
    res = inflect_clue(source_clue, surface_tags, index)
    status = res.flag or "inflected"
    if status in ("inflected", "identity") and (surface_tags & _PERSON_TAGS):
        surf_n = _verb_number(surface_tags)
        head_numbers = _head_verb_numbers(res.text, index)
        if surf_n and head_numbers and surf_n not in head_numbers:
            return res.text, "agreement-mismatch"
    return res.text, status


def lemma_pos_freq(lexique: Path) -> dict[tuple[str, str], int]:
    out: dict[tuple[str, str], int] = defaultdict(int)
    with lexique.open(encoding="utf-8") as f:
        seen_header = False
        l_idx = e_idx = t_idx = -1
        for line in f:
            if line.startswith("#"):
                continue
            cols = line.rstrip("\n").split("\t")
            if not seen_header:
                if cols[:1] == ["id"] and "Lemme" in cols and "Total occurrences" in cols:
                    l_idx = cols.index("Lemme")
                    e_idx = cols.index("Étiquettes")
                    t_idx = cols.index("Total occurrences")
                    seen_header = True
                continue
            if len(cols) <= max(l_idx, e_idx, t_idx):
                continue
            tags = cols[e_idx].split()
            pos_class = ""
            for t in tags:
                if t.startswith("v") and len(t) > 1 and t[1].isdigit():
                    pos_class = "verbe"; break
            if not pos_class:
                if "nom" in tags:
                    pos_class = "nom"
                elif "adj" in tags:
                    pos_class = "adj"
                elif "adv" in tags:
                    pos_class = "adv"
            if not pos_class:
                continue
            try:
                f_ = int(cols[t_idx])
            except ValueError:
                continue
            out[(cols[l_idx].lower(), pos_class)] += f_
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--corpus", type=Path,
                   default=REPO / "data" / "eval" / "production" / "lemma_clues_raw_pos_fixed.csv")
    p.add_argument("--wordlist", type=Path,
                   default=REPO / "grid/api/src/main/resources/words/words-fr.csv")
    p.add_argument("--lexique", type=Path,
                   default=Path(os.path.expanduser(
                       "~/Downloads/grammalecte/lexique-grammalecte-fr-v7.7.txt")))
    p.add_argument("--dst", type=Path,
                   default=REPO / "data" / "eval" / "production" / "surface_clues.csv")
    p.add_argument("--threshold", type=float, default=0.65,
                   help="output filter (rows below go to surface_clues_dropped.csv)")
    args = p.parse_args()

    print("loading morphology index...", file=sys.stderr)
    index = MorphologyIndex.load(args.lexique)
    print("computing lemma-pos frequencies...", file=sys.stderr)
    freq = lemma_pos_freq(args.lexique)

    # Load corpus, key by (lemma, pos). Ownership uses ALL entries with a
    # valid clue — the score threshold only filters the *output* later.
    corpus: dict[tuple[str, str], dict] = {}
    with args.corpus.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r.get("validation_flag") != "ok" or not r.get("lemma_clue"):
                continue
            if not r.get("pos"):
                continue
            corpus[(r["lemma"], r["pos"])] = r
    print(f"corpus entries (validator-ok): {len(corpus)}", file=sys.stderr)

    # Stream through words-fr.csv
    out_rows = []
    status_counter: dict[str, int] = defaultdict(int)
    with args.wordlist.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            surface = (r.get("word") or "").strip().lower()
            if not surface or not surface.isalpha():
                continue
            L = len(surface)
            if not (4 <= L <= 15):
                continue
            analyses = index.lookup_form(surface)
            if not analyses:
                continue

            # Build candidate (lemma, pos_class) tuples that have a clue
            candidates: list[tuple[str, str, frozenset[str], int]] = []
            seen: set[tuple[str, str]] = set()
            for lemma, tags in analyses:
                pos_class = _classify(tags)
                if pos_class not in POS_PRECEDENCE:
                    continue
                key = (lemma, pos_class)
                if key in seen:
                    continue
                if key not in corpus:
                    continue
                seen.add(key)
                f_ = freq.get(key, 0)
                candidates.append((lemma, pos_class, tags, f_))

            if not candidates:
                status_counter["no-owner"] += 1
                continue

            # Pick winner by freq (desc) then POS precedence (asc).
            candidates.sort(key=lambda c: (-c[3], POS_PRECEDENCE[c[1]]))
            winner_lemma, winner_pos, winner_tags, _ = candidates[0]
            row = corpus[(winner_lemma, winner_pos)]
            source_clue = row["lemma_clue"]

            if surface == winner_lemma:
                clue = source_clue
                status = "verbatim"
            else:
                norm_tags = {normalize_tag(t) for t in winner_tags}
                clue, status = classify_inflection(source_clue, norm_tags, index)

            # Char-cap + wrap gate. Inflation can lengthen ("Récit imaginaire"
            # → "Récits imaginaires" gains 2 chars), so we re-check
            # post-inflate rather than trusting the lemma-level validator
            # alone. fits_single_cell enforces both MAX_CLUE_CHARS and the
            # Lekton wrap predicate.
            if not fits_single_cell(clue):
                status_counter["too-long"] += 1
                continue

            status_counter[status] += 1
            out_rows.append({
                "surface": surface,
                "lemma": winner_lemma,
                "pos": winner_pos,
                "clue": clue,
                "source_clue": source_clue,
                "inflection_status": status,
                "filter_score": row.get("filter_score", ""),
                "validation_flag": row.get("validation_flag", ""),
            })

    fieldnames = ["surface", "lemma", "pos", "clue", "source_clue",
                  "inflection_status", "filter_score", "validation_flag"]
    shipped, dropped = [], []
    for r in out_rows:
        try:
            s = float(r["filter_score"] or 0)
        except ValueError:
            s = 0.0
        # `pp-only-skipped` and `pp-reflexive-skipped` rows always go to
        # dropped: in both cases the lemma clue cannot PP-inflect cleanly
        # (verb+DObj strands the object; reflexive head strands the pronoun)
        # and shipping would land a broken adjectival reading in the runtime
        # CSV. Filter score is irrelevant — these are structural skips.
        # `no-inflection-finite` shares the drop policy: defective finite-tense
        # targets (extraire/soustraire at passé simple) cannot safely fall back
        # to the lemma-form infinitive — shipping would re-introduce the
        # `tira → "Extraire"` tense-disagreement bug.
        # `agreement-mismatch`: inflated head number disagrees with the surface.
        skipped = r.get("inflection_status") in (
            "pp-only-skipped", "pp-reflexive-skipped",
            "no-inflection-finite", "agreement-mismatch",
        )
        if skipped or s < args.threshold:
            dropped.append(r)
        else:
            shipped.append(r)

    def write(path: Path, rows: list[dict]) -> None:
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
            w.writeheader()
            for r in rows:
                w.writerow(r)

    write(args.dst, shipped)
    drop_path = args.dst.with_name(args.dst.stem + "_dropped.csv")
    write(drop_path, dropped)
    print(f"\nwrote {args.dst}: {len(shipped)} rows")
    print(f"wrote {drop_path}: {len(dropped)} rows")
    print(f"  inflection_status: {dict(status_counter)}")


if __name__ == "__main__":
    main()
