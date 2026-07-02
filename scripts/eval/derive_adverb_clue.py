#!/usr/bin/env python3
"""Derive a clue for a `-ment` manner adverb from its base adjective's clue.

French `-ment` adverbs are formed from the (usually feminine) adjective, so
`terrible → terriblement`, `doux → doucement`, `prudent → prudemment`. If the
adjective is already clued, we can clue the adverb for free by adverbialising
that clue: `terrible → "Effrayant"` gives `terriblement → "De façon effrayante"`.

`base_adjective` inverts the derivation to the adjective lemma; `adverbialise`
wraps the adjective clue as `De façon <fem-adj>` — but only when the clue's head
is itself an adjective (feminisable), so relative-clause / verb clues that don't
adverbialise cleanly are skipped rather than mangled.
"""
from __future__ import annotations

from clue_metrics import fits_single_cell
from inflect_clue import _TOKEN_RE, _is_alpha_token, inflect_clue
from morphology_index import MorphologyIndex


def base_adjective(adverb: str, index: MorphologyIndex) -> str | None:
    """The adjective lemma a `-ment` adverb derives from, or None."""
    adv = adverb.lower().strip()
    if not adv.endswith("ment") or len(adv) < 6:
        return None
    candidates: list[str] = []
    if adv.endswith("amment"):          # méchamment -> méchant
        candidates.append(adv[:-6] + "ant")
    if adv.endswith("emment"):          # prudemment -> prudent
        candidates.append(adv[:-6] + "ent")
    if adv.endswith("ément"):           # énormément -> énorme ; précisément -> précis ; aisément -> aisé
        candidates += [adv[:-5] + "e", adv[:-5], adv[:-5] + "é"]
    candidates.append(adv[:-4])         # terriblement -> terrible ; doucement -> douce (fem of doux)
    for c in candidates:
        if "adj" in index.pos_classes_of_form(c):
            lemma = index.lemma_of_form(c, prefer_pos="adj")
            if lemma:
                return lemma
    return None


def adverbialise(adj_clue: str, index: MorphologyIndex) -> str | None:
    """`De façon <fem-adjective>` from an adjective clue, or None when the clue's
    FIRST content word is not an adjective — relative-clause (`Qui …`) / verb /
    noun / prepositional clues don't adverbialise cleanly and are skipped."""
    first = next((t for t in _TOKEN_RE.findall(adj_clue) if _is_alpha_token(t)), "")
    if "adj" not in index.pos_classes_of_form(first.lower()):
        return None
    res = inflect_clue(adj_clue, {"adj", "fem", "sg"}, index)
    if res.flag not in ("", "identity"):
        return None
    fem = res.text.strip()
    clue = "De façon " + fem[:1].lower() + fem[1:]
    return clue if fits_single_cell(clue) else None


def derive_adverb_clue(
    adverb: str, adj_clue_of: "dict[str, str]", index: MorphologyIndex,
) -> str | None:
    """Adverb -> derived clue, or None. `adj_clue_of` maps adjective lemma -> clue."""
    base = base_adjective(adverb, index)
    if base is None:
        return None
    adj_clue = adj_clue_of.get(base)
    if not adj_clue:
        return None
    return adverbialise(adj_clue, index)
