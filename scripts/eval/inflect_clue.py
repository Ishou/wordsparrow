#!/usr/bin/env python3
"""Inflect a lemma-form mots-fléchés clue to match a target surface morphology.

Approach:
- Generate clue at the lemma (citation) form: infinitive verb / masc-sing noun
  / masc-sing adjective.
- At lookup time, take the surface form's grammalecte tags, derive the
  inflectional target (mood + person + gender + number, no paradigm prefix),
  find the clue's head token (first content word whose POS matches), and
  inflect it via the morphology index. Other tokens stay verbatim.

This is a deliberately simple first cut — the head-only inflection rule
covers the common crossword patterns ("Aller vite" -> "Vont vite";
"Astre du jour" -> "Astres du jour"; "Couleur du sang" -> stays as-is for
an epicene singular adjective). Multi-token agreement (adjective tracking
its noun's gender, etc.) is left for a v2.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from morphology_index import (
    GENDER_TOKENS,
    MOOD_TOKENS,
    NUMBER_TOKENS,
    PERSON_TOKENS,
    MorphologyIndex,
    classify_surface_pos,
    extract_inflection_target,
)

# Person-bearing moods (must match the surface's exact person, never relaxed); `infi`/`ppre`/`ppas` are person-less.
_FINITE_MOODS = MOOD_TOKENS - {"infi", "ppre", "ppas"}

# Moods whose negation wraps the verb (`ne X pas`) rather than preceding it (`ne pas X`, infinitives; ppas has no simple negation).
_NEG_RESTRUCTURE_MOODS = _FINITE_MOODS | {"ppre"}

# Vowels + mute-h that trigger `ne → n'` elision (mirrors lemmatize_clue).
_ELISION_INITIALS = set("aeiouéèêëàâîïôûùüÿœh")
# Reflexive clitics that may sit between `pas` and the verb in `Ne pas se présenter` and must stay in front of it.
_REFLEXIVE_CLITICS = {"se", "s"}

# Pre-head adjectives in French — a small closed set that conventionally
# precedes the noun (petit oiseau, vieille femme, bel arbre). When a clue
# starts with one of these, the actual head is later in the token stream;
# we demote them as head candidates.
_PRE_HEAD_ADJ_LEMMAS = {
    "petit", "grand", "gros", "beau", "joli", "vieux", "jeune",
    "bon", "mauvais", "autre", "premier", "dernier", "même",
    "long", "haut", "court", "nouveau", "saint", "vrai", "faux",
}

# In French crosswords, the clue's gender doesn't need to match the surface's
# gender for nominal targets — "Arrêt" (mas) is a fine clue for "Halte" (fem).
# Verbs and adjectives must keep agreement; nouns relax to number-only.
_RELAX_GENDER_FOR = {"nom"}

# Tokens we consider "content words" (eligible to be the head).
_CONTENT_POS = {"verbe", "nom", "adj"}

# Words always kept verbatim (function words / common adverbs / prepositions).
# Keeping this list small — anything not here is allowed to be the head.
#
# Note: `non` is included here even though grammalecte tags it `:N:m:i`
# (noun, masc-inv) in addition to `:G:X` (adverb). In a clue starting with
# `Non présent`, `non` is the negation adverb and `présent` is the real
# adj head. Without this exclusion, the head ranker would pick `non` (it's
# leftmost and tagged as a content noun), inflate it to its sole invariable
# form, and the downstream agreement walk would inherit the head's `inv`
# tag — causing every adj after `non` to mis-agree.
_FUNCTION_WORDS = {
    "le", "la", "les", "un", "une", "des", "du", "de", "d",
    "à", "au", "aux", "en", "dans", "sur", "sous", "par", "pour", "avec", "sans",
    "et", "ou", "mais", "donc", "car", "ni", "or",
    "qui", "que", "qu", "dont", "où", "quoi",
    "ce", "cet", "cette", "ces", "ceux", "celle", "celui",
    "son", "sa", "ses", "leur", "leurs", "mon", "ma", "mes", "ton", "ta", "tes",
    "ne", "pas", "plus", "très", "trop", "peu", "bien", "mal", "non",
}

# Degree adverbs / negation / `comme` bridge a head to a trailing predicate adjective without breaking the agreement chain (`Bois très dur` → `Bois très durs`); checked before `_FUNCTION_WORDS` since several overlap it.
_DEGREE_TRANSPARENT = {
    "très", "trop", "plus", "moins", "peu", "assez", "bien", "mal",
    "non", "comme",
}

# Readings that must not govern common-noun agreement (pronoun `personne`/`rien`, proper noun `pierre`/`Pierre`) — demoted so gender/number comes from the common-noun reading.
_DEMOTED_HEAD_TAGS = {"proneg", "proind", "prorel", "prodem", "propos",
                      "propers", "proint", "proadv", "prn"}

_TOKEN_RE = re.compile(r"[\wÀ-ÿŒœŸ]+|[^\s\wÀ-ÿ]+", re.UNICODE)

# Mood preference for resolving syncretic surface forms. When grammalecte
# emits a single row covering multiple moods or persons (e.g. `unis` is BOTH
# 1sg/2sg ipre AND mas-pl ppas; `accompagne` is 1sg/3sg ipre + 1sg/3sg spre +
# 2sg impe), the union of features is too tight to match against the target
# verb's paradigm if that paradigm splits the same syncretism across separate
# rows (e.g. `associer` has separate rows for `associe` 1sg ipre, `associes`
# 2sg ipre, `associe` 1sg spre, etc.). We decompose the target into the
# cartesian product of (mood, person) and try them in this preference order
# — picking the indicative present over the subjunctive present, the past
# participle over the imperative, etc. This matches what a French speaker
# would render in a mots-fléchés clue.
_MOOD_PREFERENCE = (
    "ipre", "ppas", "ifut", "iimp", "ipsi", "cond",
    "ppre", "spre", "simp", "impe", "infi",
)
# Person preference within a mood. For ambiguous syncretic forms like
# `unis` (1sg+2sg ipre fused on one grammalecte row), 2sg is the more
# natural mots-fléchés rendering ("Associes ensemble" reads as a direct
# imperative-style instruction more often than "Associe ensemble").
# 3sg also outranks 1sg because crosswords typically clue verb forms in
# the 3rd person ("Va vite" → court).
_PERSON_PREFERENCE = ("2sg", "3sg", "3pl", "2pl", "1pl", "1sg")


# Determiners that mark a direct-object NP when they immediately follow
# the head verb. `de la` / `de l'` partitives are excluded because they
# wear `de` first, which serves as the bridge that *would* license a
# PP-state reading ("Couvert de lait" → "Couverte de lait").
_DOBJ_DETERMINERS = {
    "le", "la", "les", "l",
    "un", "une", "des",
    "du",  # masc-sg partitive — `du pain` is DObj, not a `de` bridge.
    "ce", "cet", "cette", "ces",
    "son", "sa", "ses",
    "mon", "ma", "mes", "ton", "ta", "tes",
    "leur", "leurs", "notre", "nos", "votre", "vos",
    # numerals / quantifiers head a bare direct object too (`Relier deux
    # conduits`); without them the pp-only-skip guard misses `Relié deux …`.
    "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
    "plusieurs", "quelques", "certains", "certaines", "divers", "diverses",
    "maints", "maintes",
}

# Prepositions that, when they sit between the head verb and a following
# determiner, license a PP-state reading. `Munir d'un trou` PP-inflates to
# `Munie d'un trou`; `Mettre en ordre` to `Mise en ordre`. The verb still
# takes a complement, but the complement is prepositional and survives the
# participial shift.
_PP_BRIDGE_PREPS = {"de", "d", "à", "au", "aux", "en", "dans", "sur",
                    "sous", "par", "pour", "avec", "sans"}


@dataclass
class InflectionResult:
    text: str
    flag: str  # '' | 'no-target-pos' | 'no-head' | 'no-inflection'
               # | 'no-inflection-finite' | 'identity' | 'head-pos-mismatch'
               # | 'pp-only-skipped' | 'pp-reflexive-skipped'
               # | 'pp-epicene-skipped'
               # | 'neg-nonfinite-skipped' | 'subject-person-mismatch' | 'empty'
               #
               # `no-inflection-finite` is a stricter sibling of `no-inflection`
               # for finite-verb targets (no `ppas` in target tags). When the
               # head verb is defective at the requested tense (extraire and
               # soustraire have no passé simple / subjonctif imparfait rows
               # in grammalecte), shipping the lemma-form infinitive on a
               # finite-tense surface reads as a tense disagreement (see
               # data/eval/inflation_bugs.csv: tira → "Extraire"). The build
               # step routes these to dropped so the runtime keeps the
               # placeholder. Non-finite defective targets (ppas/nominal/adj)
               # still emit plain `no-inflection` and ship the lemma form.


def _nominal_subject_number(
    tokens: list[str], head_idx: int, index: MorphologyIndex,
) -> tuple[bool, str]:
    """`(has_subject, number)` for a content noun preceding the head verb — the
    clue carries its own 3rd-person grammatical subject (`La sueur apparaît`).
    `number` is 'sg'/'pl', or '' when the noun's number is indeterminate."""
    for tok in tokens[:head_idx]:
        if not _is_alpha_token(tok):
            continue
        lo = tok.lower()
        if lo in _FUNCTION_WORDS:
            continue
        if "nom" not in index.pos_classes_of_form(lo):
            continue
        for _lemma, tags in index.lookup_form(lo):
            nums = tags & NUMBER_TOKENS
            if "sg" in nums:
                return True, "sg"
            if "pl" in nums:
                return True, "pl"
        return True, ""
    return False, ""


def _has_reflexive_head(tokens: list[str]) -> bool:
    """True iff the clue's first alphabetic token is the reflexive pronoun
    `Se` / `S'`. A reflexive clue head is a perfectly valid mots-fléchés
    pattern (`S'esclaffer → Rire`); it only breaks for PP-as-adjective
    surfaces, where PP-inflating the head produces ungrammatical text
    like `*S'élevée` (the pronoun stranded against a participial reading).
    Non-PP targets keep the reflexive clue intact.
    """
    for tok in tokens:
        if not _is_alpha_token(tok) and tok not in ("'",):
            continue
        norm = tok.lower().rstrip("'")
        return norm in ("se", "s")
    return False


def _negation_frame(tokens: list[str]) -> tuple[int, int] | None:
    """Return `(ne_idx, pas_idx)` iff the clue opens with `Ne pas …`, else None — only the leading particles qualify, not a `pas` deeper in the clue."""
    alpha = [(i, t.lower()) for i, t in enumerate(tokens) if _is_alpha_token(t)]
    if len(alpha) >= 2 and alpha[0][1] == "ne" and alpha[1][1] == "pas":
        return alpha[0][0], alpha[1][0]
    return None


def _restructure_negation(
    tokens: list[str], ne_idx: int, pas_idx: int, head_idx: int,
) -> list[str] | None:
    """Rewrite `Ne pas [se] <verb> …` → `Ne [se] <verb> pas …`, eliding `ne → n'` before a vowel; returns None when non-reflexive material sits between `pas` and the verb, since that shape isn't a plain negated infinitive."""
    between = tokens[pas_idx + 1:head_idx]
    if any(_is_alpha_token(t) and t.lower() not in _REFLEXIVE_CLITICS for t in between):
        return None
    head_tok = tokens[head_idx]
    after_head = tokens[head_idx + 1:]
    first_after_ne = next((t for t in between if _is_alpha_token(t)), head_tok)
    ne_tokens = (
        ["n", "’"] if first_after_ne[:1].lower() in _ELISION_INITIALS
        else [tokens[ne_idx]]
    )
    return tokens[:ne_idx] + ne_tokens + between + [head_tok, "pas"] + after_head


def _has_verb_dobj_frame(tokens: list[str], head_idx: int) -> bool:
    """True iff the clue is shaped `[head_verb] [det] [N]` — verb + direct
    object — without a prepositional bridge between the verb and the
    determiner. Such clues do not PP-inflate to a grammatical state-clue:
    `Percer un trou` cannot become `*Percée un trou` (the direct-object
    slot is not licensed by the past-participle adjectival reading).

    A `de` / `à` / `en` etc. between the head and the determiner moves
    the clue into a PP-friendly shape (`Munir d'un trou` → `Munie d'un
    trou`); those return False.
    """
    n = len(tokens)
    j = head_idx + 1
    while j < n and not _is_alpha_token(tokens[j]):
        j += 1
    if j >= n:
        return False
    nxt = tokens[j].lower().rstrip("'")
    if nxt in _PP_BRIDGE_PREPS:
        return False
    return nxt in _DOBJ_DETERMINERS


def _decompose_targets(target: set[str]) -> list[set[str]]:
    """Split a fused-feature target into a priority-ordered list of canonical
    targets, each containing at most one mood and one person. The original
    full target is yielded first (covers the simple case where the head verb's
    paradigm row carries the same syncretic union); then progressively
    relaxed candidates follow.

    Why: grammalecte stores syncretic forms on a single row with the union
    of features (e.g. `unis` carries `{ipre, 1sg, 2sg}` AND `{ppas, mas, pl}`,
    or even fused as `{ipre, spre, 1sg, 3sg, impe, 2sg}` for `-er` 1sg).
    The target verb's paradigm may split the same syncretism (irregular -re
    verbs split ipre/spre on separate rows). Strict superset matching then
    fails. Decomposing lets us match individual canonical features at a
    time."""
    moods = target & MOOD_TOKENS
    persons = target & PERSON_TOKENS
    rest = target - moods - persons

    candidates: list[set[str]] = [set(target)]

    # Single mood × single person decompositions, ordered by preference.
    if moods or persons:
        ordered_moods = [m for m in _MOOD_PREFERENCE if m in moods] or [None]
        ordered_persons = [p for p in _PERSON_PREFERENCE if p in persons] or [None]
        for m in ordered_moods:
            for p in ordered_persons:
                trial = set(rest)
                if m is not None:
                    trial.add(m)
                if p is not None:
                    trial.add(p)
                if trial != target:
                    candidates.append(trial)

    # Mood-only fallback (drop person) only when the target had no person to begin with — for a finite verb, dropping person risks an arbitrary-person match (the posè→Placent bug); exact or skip instead. Never fall back to an empty target either, since that silently matches the lemma's first row rather than a real conjugation.
    if not persons:
        for m in [m for m in _MOOD_PREFERENCE if m in moods]:
            candidates.append(rest | {m})

    # Dedup while preserving order.
    seen: list[set[str]] = []
    for c in candidates:
        if c not in seen:
            seen.append(c)
    return seen


def _is_alpha_token(tok: str) -> bool:
    return bool(re.match(r"^[\wÀ-ÿŒœŸ]+$", tok))


def _capitalize_first(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


_COPULA_LEMMAS = frozenset({"être", "avoir"})
_PP_OBJECT_TOKENS = frozenset({"quelqu", "quelque", "quelques", "qqn", "qqch"})
_PREP_BEFORE_INFINITIVE = frozenset({"à", "au", "aux", "de", "d", "du"})

_SUBJUNCTIVE_MOODS = frozenset({"spre", "simp"})
# Que + subject pronoun, with elision before a vowel (Qu’il / Qu’ils).
_SUBJ_PREFIX = {
    "1sg": "Que je", "2sg": "Que tu", "3sg": "Qu’il",
    "1pl": "Que nous", "2pl": "Que vous", "3pl": "Qu’ils",
}


def _subjunctive_prefix(target: set[str]) -> str:
    for person in ("3sg", "3pl", "1sg", "2sg", "1pl", "2pl"):
        if person in target:
            return _SUBJ_PREFIX[person]
    return "Qu’il"


def _pp_action_definition(
    tokens: list[str],
    head_idx: int,
    head_lemma: str,
    index: "MorphologyIndex",
) -> bool:
    """True when a clue defines the *action* rather than a *state* (copula head, object pronoun, or prep + infinitive complement) and so can't be inflected to a past participle."""
    if head_lemma.lower() in _COPULA_LEMMAS:
        return True
    # Stop at a comma/coordinator co-head boundary so a second synonym isn't misread as the head's infinitival complement.
    tail: list[str] = []
    for tok in tokens[head_idx + 1:]:
        if tok == "," or tok.lower() in _COORD_WALKTHROUGH:
            break
        if _is_alpha_token(tok):
            tail.append(tok.lower())
    if any(t in _PP_OBJECT_TOKENS for t in tail):
        return True
    for j in range(len(tail) - 1):
        if tail[j] in _PREP_BEFORE_INFINITIVE and any(
            "infi" in tags for _, tags in index.lookup_form(tail[j + 1])
        ):
            return True
    return False


# Epicene ppas head (`demeuré`) inflates to the masculine citation on fem/pl answers — see ADR-0107.
_EPICENE_PPAS_SKIP = object()


def _head_ppas_tags(
    form: str, head_lemma: str, index: MorphologyIndex,
) -> frozenset[str]:
    """The ppas tag set the inflected `form` carries under `head_lemma`."""
    for lemma, tags in index.lookup_form(form):
        if lemma.lower() == head_lemma.lower() and "ppas" in tags:
            return tags
    return frozenset()


def _is_regular_er_verb(lemma: str, index: MorphologyIndex) -> bool:
    """True for 1st-group (`v1…`) `-er` verbs, whose participle agrees
    regularly (`-é → -ée/-és/-ées`) and is safe to synthesize."""
    if not lemma.lower().endswith("er"):
        return False
    for _surface, tags in index.by_lemma.get(lemma.lower(), []):
        if any(len(t) >= 3 and t[:2] == "v1" and "_" in t for t in tags):
            return True
    return False


def _agree_epicene_ppas(
    inflected: str, head_lemma: str, target: set[str], index: MorphologyIndex,
) -> str | object | None:
    """Repair an epicene ppas head for a fem/pl answer: synth for regular `-er`, else `_EPICENE_PPAS_SKIP`, else None (ADR-0107)."""
    want_fem = "fem" in target
    want_pl = "pl" in target
    if not (want_fem or want_pl):
        return None
    if "epi" not in _head_ppas_tags(inflected, head_lemma, index):
        return None
    if not (_is_regular_er_verb(head_lemma, index) and inflected.endswith("é")):
        return _EPICENE_PPAS_SKIP
    return inflected + ("e" if want_fem else "") + ("s" if want_pl else "")


def _relative_verb(
    tokens: list[str], target_pos: str, surface_tags: set[str],
    index: MorphologyIndex,
) -> tuple[int, str, set[str], str] | None:
    """`Qui + verbe` agrees the relative verb with the antecedent's number, 3rd
    person, own tense; see ADR-0107 for why `qui` (not `que`) is required."""
    if target_pos not in ("nom", "adj"):
        return None
    seen_qui = False
    for i, tok in enumerate(tokens):
        if not _is_alpha_token(tok):
            continue
        lo = tok.lower()
        if not seen_qui:
            if lo != "qui":
                return None
            seen_qui = True
            continue
        if lo in _FUNCTION_WORDS:
            continue
        if "verbe" not in index.pos_classes_of_form(lo):
            return None
        lemma = index.lemma_of_form(lo, prefer_pos="verbe")
        if not lemma:
            return None
        forms = index.lookup_form(lo)
        mood = next((m for _l, tags in forms for m in ("ipre",) if m in tags), None)
        if mood is None:
            finite_moods = {m for _l, tags in forms for m in tags & _FINITE_MOODS}
            mood = next((m for m in _MOOD_PREFERENCE if m in finite_moods), None)
        if mood is None:
            return None
        number = "3pl" if "pl" in surface_tags else "3sg"
        return (i, lemma, {mood, number}, "verbe")
    return None


def _implicit_relative_verb(
    tokens: list[str], target_pos: str, surface_tags: set[str],
    index: MorphologyIndex, authored_head_pos: str | None = None,
) -> tuple[int, str, set[str], str] | None:
    """Elided-`qui` reading of `_relative_verb` (ADR-0107): a bare 3rd-person-present verb head agrees with the answer's number like an explicit `Qui + verbe`; a nominal/adjectival reading blocks it unless `authored_head_pos` settles which the author meant."""
    if target_pos not in ("nom", "adj"):
        return None
    if authored_head_pos is not None and authored_head_pos != "verbe":
        return None
    for i, tok in enumerate(tokens):
        if not _is_alpha_token(tok):
            continue
        lo = tok.lower()
        pos_classes = index.pos_classes_of_form(lo)
        if "verbe" not in pos_classes:
            return None
        if authored_head_pos is None and ("nom" in pos_classes or "adj" in pos_classes):
            return None
        forms = index.lookup_form(lo)
        if not any("ipre" in tags and (tags & {"3sg", "3pl"}) for _lemma, tags in forms):
            return None
        lemma = index.lemma_of_form(lo, prefer_pos="verbe")
        if not lemma:
            return None
        number = "3pl" if "pl" in surface_tags else "3sg"
        return (i, lemma, {"ipre", number}, "verbe")
    return None


_SUBJECT_PRONOUNS = {"il", "elle", "on", "ils", "elles"}


def _finite_verb_analysis(
    surface: str, index: MorphologyIndex,
) -> tuple[str, frozenset[str]] | None:
    """First finite-verb analysis of `surface` as (lemma, its finite moods), or
    None. Skips noun/adj/ppas homograph rows — a ppas/infinitive is not finite."""
    for lemma, tags in index.by_form.get(surface, []):
        moods = frozenset(tags) & _FINITE_MOODS
        if moods:
            return lemma, moods
    return None


def _subject_pronoun_frame(
    tokens: list[str],
    target: frozenset[str],
    target_pos: str,
    index: MorphologyIndex,
) -> "InflectionResult | None":
    """Agree `Il/Elle/On + finite verb` with a plural NOUN answer, exact-or-verbatim (never a partial agree) — see ADR-0107."""
    if target_pos != "nom" or not tokens:
        return None
    if tokens[0].lower() not in _SUBJECT_PRONOUNS:
        return None
    if "pl" not in target:  # only a plural answer needs agreement
        return None
    verbatim = InflectionResult(_capitalize_first(_detokenize(tokens)), "verbatim")
    if tokens[0].lower() == "on":  # invariable 3sg — a plural answer can't agree it
        return verbatim
    vidx, verb_lemma, moods = -1, "", frozenset()
    for i in range(1, len(tokens)):
        if not _is_alpha_token(tokens[i]) or tokens[i][:1].isupper():
            continue
        fa = _finite_verb_analysis(tokens[i].lower(), index)
        if fa is not None:
            vidx, (verb_lemma, moods) = i, fa
            break
    if vidx < 0 or verb_lemma.lower() == "être":
        return verbatim  # no verb to agree / predicate-adjective agreement not handled
    # Coordinated second finite verb (right after et/ou/,) we don't agree → skip.
    for j in range(vidx + 1, len(tokens)):
        if tokens[j].lower() in ("et", "ou") or tokens[j] == ",":
            k = j + 1
            while k < len(tokens) and not _is_alpha_token(tokens[k]):
                k += 1
            if (k < len(tokens) and not tokens[k][:1].isupper()
                    and _finite_verb_analysis(tokens[k].lower(), index) is not None):
                return verbatim
    mood = next((m for m in _MOOD_PREFERENCE if m in moods), None)
    if mood is None:
        return verbatim
    verb_new = index.inflect(
        verb_lemma, frozenset({mood, "3pl"}), prefer_pos="verbe", require_pos=True)
    if not verb_new:
        return verbatim
    new_tokens = list(tokens)
    new_tokens[0] = "Elles" if "fem" in target else "Ils"
    new_tokens[vidx] = verb_new
    return InflectionResult(_capitalize_first(_detokenize(new_tokens)), "")


def inflect_clue(
    clue: str,
    surface_tags: set[str],
    index: MorphologyIndex,
    authored_head_pos: str | None = None,
) -> InflectionResult:
    target_pos = classify_surface_pos(surface_tags)
    if target_pos not in _CONTENT_POS:
        # Nothing inflectable to target (e.g. preposition, determiner). Return clue verbatim.
        return InflectionResult(_capitalize_first(clue), "no-target-pos")

    target = extract_inflection_target(surface_tags)
    if not target:
        return InflectionResult(_capitalize_first(clue), "no-target-pos")

    # Subjunctive-only surface: pin to one person (prefer 3sg) so the Qu' marker agrees.
    if (
        target_pos == "verbe"
        and "ipre" not in surface_tags
        and (surface_tags & _SUBJUNCTIVE_MOODS)
    ):
        for person in ("3sg", "3pl", "1sg", "2sg", "1pl", "2pl"):
            if person in target:
                target = (target - PERSON_TOKENS - MOOD_TOKENS) | {"spre", person}
                break

    # Exact-or-skip on person: skip rather than guess when the surface's person is unrepresentable (e.g. the `Nisg` inversion person for `posè-je`, dropped by `PERSON_TOKENS`), since matching would otherwise return an arbitrary-person head (`posè → Placent`).
    if (target_pos == "verbe" and (target & _FINITE_MOODS)
            and not (target & PERSON_TOKENS)):
        return InflectionResult(_capitalize_first(clue), "no-inflection-finite")

    # Fully invariable (epi+inv) ppas target: one form, and the ppas gold heads are already participles/adjectives — ship verbatim; inflating an invariable target mangles adjective/infinitive/homograph heads (Fourbe->Fourbé, monde->mondé, pousser->poussé).
    if target_pos == "verbe" and "ppas" in target and "epi" in target and "inv" in target:
        return InflectionResult(_capitalize_first(clue), "identity")

    tokens = _TOKEN_RE.findall(clue)
    if not tokens:
        return InflectionResult(clue, "empty")

    # Subject-pronoun frame takes precedence: the pronoun is the answer, not an object noun — see ADR-0107.
    frame = _subject_pronoun_frame(tokens, target, target_pos, index)
    if frame is not None:
        return frame

    # Relative-clause frame takes precedence over the POS-matched ranker: a
    # `Qui + verbe` clue agrees the relative verb with the answer, not a token
    # matching the answer's own POS.
    rel = _relative_verb(tokens, target_pos, surface_tags, index)
    if rel is None:
        rel = _implicit_relative_verb(
            tokens, target_pos, surface_tags, index, authored_head_pos
        )
    if rel is not None:
        head_idx, head_lemma, target, target_pos = rel
    else:
        # Rank candidate heads. Demote tokens whose lemma is a known pre-head
        # adjective (petit, grand, beau, vieux …) so they don't capture the head
        # role from the actual noun. Ties break by leftmost.
        candidates: list[tuple[int, int, str]] = []  # (rank, position, lemma)
        for i, tok in enumerate(tokens):
            if not _is_alpha_token(tok):
                continue
            if i > 0 and tok[:1].isupper():  # capitalized mid-clue = proper noun, never a head
                continue
            if tok.lower() in _FUNCTION_WORDS:
                continue
            if target_pos not in index.pos_classes_of_form(tok.lower()):
                continue
            lemma = index.lemma_of_form(tok.lower(), prefer_pos=target_pos)
            if not lemma:
                continue
            # Rank: pre-head adj demoted to back, rest in clue order.
            rank = 1 if lemma.lower() in _PRE_HEAD_ADJ_LEMMAS else 0
            candidates.append((rank, i, lemma))
        candidates.sort()
        head_idx = -1
        head_lemma = ""
        if candidates:
            _, head_idx, head_lemma = candidates[0]

        if head_idx < 0:
            # No head with matching POS — clue is structurally incompatible with
            # the surface morphology (e.g. surface is a verb but the clue head is
            # a noun, like "Astre du jour" cluing a verb form). Leave verbatim.
            return InflectionResult(_capitalize_first(clue), "head-pos-mismatch")

    # Copula-as-genus guard: a NOMINAL surface headed by être/avoir uses the noun, not the verb — ship verbatim.
    if target_pos != "verbe" and head_lemma.lower() in _COPULA_LEMMAS:
        return InflectionResult(_capitalize_first(clue), "verbatim")

    # Subject guard: a clue with its own 3rd-person nominal subject can only take a finite head that stays 3rd person and keeps the subject's number — else the surface's person/number strands a disagreement inside the clue (`La sueur apparaîtras`). Skip to placeholder; indeterminate subject number falls back to person-only.
    if target_pos == "verbe" and (target & _FINITE_MOODS):
        has_subject, subject_number = _nominal_subject_number(tokens, head_idx, index)
        surface_person = target & PERSON_TOKENS
        agrees = (
            (subject_number == "sg" and "3sg" in surface_person)
            or (subject_number == "pl" and "3pl" in surface_person)
            or (not subject_number and bool(surface_person)
                and surface_person <= {"3sg", "3pl"})
        )
        if has_subject and not agrees:
            return InflectionResult(_capitalize_first(clue), "subject-person-mismatch")

    # PP+DObj guard: when the surface is a past participle adjectival use
    # (`forée`, `accordée`) and the lemma clue is shaped `verb + DObj`
    # (`Percer un trou`, `Donner une faveur`), participial inflation strands
    # the direct object (`*Percée un trou`). Iter13's DPO corpus reduces this
    # frame in LoRA output, but residual cases still arrive here. Returning
    # a structural flag (rather than a broken inflate or a 3sg/3pl-fallback
    # action-clue) lets `build_surface_clues.py` route the row to dropped
    # so the runtime keeps the placeholder.
    if (target_pos == "verbe" and "ppas" in target
            and _has_verb_dobj_frame(tokens, head_idx)):
        return InflectionResult(_capitalize_first(clue), "pp-only-skipped")

    # PP+Reflexive guard: a reflexive lemma clue (`Se déplacer`, `S'élever`)
    # is a valid mots-fléchés pattern for verb-form answers (`S'esclaffer →
    # Rire`), but PP-inflating it for a past-participle adjectival surface
    # produces stranded-pronoun text (`*Se déplacée`, `*S'élevée`). Skip
    # to placeholder; the corpus-side preference (DPO theme 1) reduces the
    # rate at which this fires, but the inflater stays defensive in case.
    if (target_pos == "verbe" and "ppas" in target
            and _has_reflexive_head(tokens)):
        return InflectionResult(_capitalize_first(clue), "pp-reflexive-skipped")

    # Negated-infinitive + past participle can't restructure to a clean simple-negation (`Ne pas rester` → `*Ne pas resté`); skip and let the higher-freq present sibling supply the grid clue instead (finite surfaces are restructured below).
    if (target_pos == "verbe" and "ppas" in target
            and _negation_frame(tokens) is not None):
        return InflectionResult(_capitalize_first(clue), "neg-nonfinite-skipped")

    # A past participle clues a STATE (`Été digne de`); an action-definition clue can't convert (`Commencer à exister` → `*Commencées à exister`). Skip.
    if (target_pos == "verbe" and "ppas" in target
            and _pp_action_definition(tokens, head_idx, head_lemma, index)):
        return InflectionResult(_capitalize_first(clue), "pp-action-skipped")

    # For nominal targets, gender relaxation is best-effort: try strict
    # gender first so a paradigm with both masc and fem forms (voleur →
    # voleuse) flips correctly. Only drop the gender constraint if no
    # exact-gender form exists (Astre is intrinsically masculine — it
    # stays "Astres" even when cluing a fem surface like "étoiles").
    #
    # For verb targets, the surface row may carry a syncretic union of moods
    # / persons (`unis` is `{ipre, 1sg, 2sg}` ∪ `{ppas, mas, pl}`; `abaisse`
    # is `{ipre, spre, 1sg, 3sg, impe, 2sg}`). The head verb's paradigm may
    # split the same syncretism across separate rows, so a strict superset
    # match against the union fails. `_decompose_targets` walks the cartesian
    # product of (mood, person) in preference order and tries each — that's
    # how `unis → Associes ensemble` resolves: the full target fails (no
    # `associer` row carries both 1sg AND 2sg), then `{ipre, 2sg}` matches
    # `associes`, and we ship that.
    # require_pos hard-filters cross-POS forms (animal → animaux, not animales) — see ADR-0107.
    inflected = None
    chosen_target = target
    for trial in _decompose_targets(target):
        candidate = index.inflect(head_lemma, trial, prefer_pos=target_pos, require_pos=True)
        if candidate:
            inflected = candidate
            chosen_target = trial
            break
    if not inflected and target_pos in _RELAX_GENDER_FOR:
        for trial in _decompose_targets(target - GENDER_TOKENS):
            candidate = index.inflect(head_lemma, trial, prefer_pos=target_pos, require_pos=True)
            if candidate:
                inflected = candidate
                chosen_target = trial
                break
    if not inflected:
        # Finite-verb targets where the head paradigm has no matching tense
        # row are not safely fallback-able — the lemma-form infinitive on a
        # finite-tense surface reads as a tense disagreement. Distinguish
        # from non-finite no-inflection (ppas/nominal/adj) where the lemma
        # form remains an acceptable clue.
        if target_pos == "verbe" and "ppas" not in target:
            return InflectionResult(_capitalize_first(clue), "no-inflection-finite")
        return InflectionResult(_capitalize_first(clue), "no-inflection")
    target = chosen_target

    # Epicene ppas repair: synth regular `-er` agreement, else drop irregular heads (ADR-0107).
    if target_pos == "verbe" and "ppas" in target:
        repaired = _agree_epicene_ppas(inflected, head_lemma, target, index)
        if repaired is _EPICENE_PPAS_SKIP:
            return InflectionResult(_capitalize_first(clue), "pp-epicene-skipped")
        if isinstance(repaired, str):
            inflected = repaired

    new_tokens = list(tokens)
    head_changed = inflected.lower() != tokens[head_idx].lower()
    new_tokens[head_idx] = inflected

    # Forward walk after the head. Two jobs in one loop:
    #
    #   (a) Co-head inflation: a token whose POS matches `target_pos`,
    #       reached through coordinating conjunctions in NP state, gets
    #       inflated to the head's chosen target morphology. This is what
    #       turns "Nettoyer et désinfecter" → "Nettoie et désinfecte"
    #       for an ipre-3sg surface, and "Élan et énergie" →
    #       "Élans et énergies" for a mas-pl noun surface. Adjectives
    #       fall under this rule too — `target_pos == "adj"` makes
    #       `"adj" in classes` overlap with the co-head branch and gives
    #       the historic `Long et ennuyeux → Longue et ennuyeuse`
    #       behaviour for free.
    #   (b) Post-head adjective agreement: an adj token, regardless of
    #       target POS, agrees with the current `gn` target. Crossing
    #       a preposition (`_AGREEMENT_PASSTHROUGH`) flips to PP state;
    #       the next noun re-anchors `gn` (`Carnets de notes quotidiennes`).
    #
    # Verb targets that don't have a (gender, number) — finite tenses,
    # not ppas — still run the loop for co-head inflation; the adj
    # branch is just a no-op when `gn` is None.
    gn = _agreement_target(inflected, head_lemma, target_pos, target, index)
    initial_gn = gn
    in_pp = False
    saw_coord = False
    after_comma = False
    i = head_idx + 1
    while i < len(new_tokens):
        tok = new_tokens[i]
        if not _is_alpha_token(tok):
            # Comma is a co-head boundary — keep walking so the next synonym also inflects.
            if tok == ",":
                saw_coord = True
                after_comma = True
                i += 1
                continue
            break
        lo = tok.lower()
        classes = index.pos_classes_of_form(lo)
        # Coordinating conjunction: walk through to the next content token.
        if lo in _COORD_WALKTHROUGH:
            saw_coord = True
            after_comma = False
            i += 1
            continue
        if lo in _AGREEMENT_PASSTHROUGH:
            in_pp = True
            saw_coord = False
            after_comma = False
            i += 1
            continue
        # In PP state, an encountered noun re-anchors the agreement target
        # for downstream adjectives (`Carnets de notes quotidiennes`).
        if in_pp and "nom" in classes:
            noun_lemma = index.lemma_of_form(lo, prefer_pos="nom")
            if noun_lemma:
                new_target = _noun_agreement_from_form(lo, noun_lemma, index)
                if new_target:
                    gn = new_target
            in_pp = False
            i += 1
            continue
        # Degree adverb / negation / comme: cross it, keeping the current gn target.
        if lo in _DEGREE_TRANSPARENT:
            i += 1
            continue
        # A reflexive clitic before a coordinated verb (`…, se retirer`) is crossed,
        # keeping `saw_coord`, so the following verb still co-inflates (`se retire`).
        if lo in _REFLEXIVE_CLITICS and saw_coord:
            i += 1
            continue
        if lo in _FUNCTION_WORDS:
            break
        # Co-head: same POS as target, NP state, reached after a conjunction.
        if not in_pp and target_pos in classes and saw_coord:
            co_lemma = index.lemma_of_form(lo, prefer_pos=target_pos)
            if co_lemma:
                co_form = None
                for trial in _decompose_targets(target):
                    cand = index.inflect(co_lemma, trial, prefer_pos=target_pos)
                    if cand:
                        co_form = cand
                        break
                if co_form is None and target_pos in _RELAX_GENDER_FOR:
                    for trial in _decompose_targets(target - GENDER_TOKENS):
                        cand = index.inflect(co_lemma, trial, prefer_pos=target_pos)
                        if cand:
                            co_form = cand
                            break
                if co_form and co_form.lower() != lo:
                    new_tokens[i] = co_form
                # Comma-introduced noun co-head re-anchors gn to itself (apposition); et/ou keep the head's target.
                if target_pos == "nom" and after_comma:
                    reanchor = _noun_agreement_from_form(
                        (co_form or lo).lower(), co_lemma, index)
                    if reanchor:
                        gn = reanchor
            saw_coord = False
            after_comma = False
            i += 1
            continue
        saw_coord = False
        # Post-head adjective agreement (when we know a gn target).
        if gn is not None and "adj" in classes:
            # A ppre form followed by a non-coordinator token governs a complement (verbal, invariable); bare/coordinated use agrees.
            if _reads_as_ppre(lo, index):
                nxt = _next_alpha_token(new_tokens, i)
                if nxt is not None and nxt not in _COORD_WALKTHROUGH:
                    break
            new_form = _agree_adjective(lo, gn, index)
            if new_form and new_form.lower() != lo:
                new_tokens[i] = new_form
            i += 1
            continue
        # Appositive noun in NP state (`Légume racine blanc`): take the head's
        # number but keep the apposition's own gender (`racine` stays fem).
        # `gn` is left on the head so trailing adjectives still agree with it
        # (`blanc` → `blancs`, not `blanches`).
        if not in_pp and gn is not None and "nom" in classes:
            noun_lemma = index.lemma_of_form(lo, prefer_pos="nom")
            if noun_lemma:
                own = _noun_agreement_from_form(lo, noun_lemma, index) or set()
                agr = (own & GENDER_TOKENS) | (gn & NUMBER_TOKENS)
                if own & GENDER_TOKENS and gn & NUMBER_TOKENS:
                    new_form = index.inflect(noun_lemma, frozenset(agr), prefer_pos="nom")
                    if new_form and new_form.lower() != lo:
                        new_tokens[i] = new_form
            i += 1
            continue
        break

    # Backward walk: pre-head co-heads / adjectives. Symmetry with the
    # forward walk — same POS as target gets inflated to head's morphology;
    # adj at any state agrees to the head's `initial_gn`.
    saw_coord = False
    i = head_idx - 1
    while i >= 0:
        tok = new_tokens[i]
        if not _is_alpha_token(tok):
            if tok == ",":
                saw_coord = True
                i -= 1
                continue
            break
        lo = tok.lower()
        if lo in _COORD_WALKTHROUGH:
            saw_coord = True
            i -= 1
            continue
        if lo in _DEGREE_TRANSPARENT:
            i -= 1
            continue
        if lo in _FUNCTION_WORDS:
            break
        classes = index.pos_classes_of_form(lo)
        if target_pos in classes and saw_coord:
            co_lemma = index.lemma_of_form(lo, prefer_pos=target_pos)
            if co_lemma:
                co_form = None
                for trial in _decompose_targets(target):
                    cand = index.inflect(co_lemma, trial, prefer_pos=target_pos)
                    if cand:
                        co_form = cand
                        break
                if co_form and co_form.lower() != lo:
                    new_tokens[i] = co_form
            saw_coord = False
            i -= 1
            continue
        if initial_gn is not None and "adj" in classes:
            new_form = _agree_adjective(lo, initial_gn, index)
            if new_form and new_form.lower() != lo:
                new_tokens[i] = new_form
            i -= 1
            continue
        break

    # Negated-infinitive → finite: an unrestructured `Ne pas <finite>` is ungrammatical (`espère → *Ne pas désespère`), so once the head has changed to a finite/present-participle form, move `pas` behind it and elide `ne` (`Ne désespère pas`, `N'acceptant pas`).
    if head_changed and (target & _NEG_RESTRUCTURE_MOODS):
        neg = _negation_frame(new_tokens)
        if neg is not None and head_idx > neg[1]:
            restructured = _restructure_negation(new_tokens, neg[0], neg[1], head_idx)
            if restructured is not None:
                new_tokens = restructured

    if not head_changed and new_tokens == tokens:
        return InflectionResult(_capitalize_first(clue), "identity")

    rebuilt = _detokenize(new_tokens)

    # Subjunctive-only surface: prepend the mood marker so it doesn't read as present tense.
    if (
        "ipre" not in surface_tags
        and (chosen_target & _SUBJUNCTIVE_MOODS)
        and not rebuilt.lower().startswith(("que ", "qu'", "qu’"))
    ):
        rebuilt = f"{_subjunctive_prefix(chosen_target)} {rebuilt[:1].lower()}{rebuilt[1:]}"
        return InflectionResult(rebuilt, "")

    return InflectionResult(_capitalize_first(rebuilt), "")


# Coordinating conjunctions — walk through during agreement so `X et Y`
# co-modifiers both agree.
_COORD_WALKTHROUGH = {"et", "ou", "ni"}


# Tokens we walk through during forward agreement: prepositions, articles,
# elision particles. They link a head to a downstream noun without breaking
# the noun-phrase chain, so we keep walking instead of stopping.
_AGREEMENT_PASSTHROUGH = {
    "de", "d", "à", "au", "aux", "du", "des", "en", "dans", "sur", "sous",
    "par", "pour", "avec", "sans", "le", "la", "les", "un", "une",
    "l", "ce", "cet", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
    "mon", "ma", "mes", "ton", "ta", "tes", "notre", "nos", "votre", "vos",
}


def _reads_as_ppre(form: str, index: MorphologyIndex) -> bool:
    """True iff the form has a présent-participle reading (`fuyant`, `parlant`)."""
    return any("ppre" in tags for _l, tags in index.lookup_form(form))


def _form_gender(form: str, index: MorphologyIndex) -> set[str]:
    """The gender(s) the form carries in its adj/ppas readings (`{mas}`/`{fem}`)."""
    g: set[str] = set()
    for _l, tags in index.lookup_form(form):
        if "adj" in tags or "ppas" in tags:
            g |= tags & {"mas", "fem"}
    return g


def _form_agrees(form: str, gn: set[str], index: MorphologyIndex) -> bool:
    """True iff `form` already matches `gn`; skips a re-inflect that could paradigm-jump (`tendre` adj → `tendu`)."""
    want_num = gn & NUMBER_TOKENS
    want_gen = gn & {"mas", "fem"}
    for _l, tags in index.lookup_form(form):
        if not ({"adj", "ppas"} & tags):
            continue
        num_ok = not want_num or bool(tags & want_num) or "inv" in tags
        gen_ok = not want_gen or bool(tags & want_gen) or "epi" in tags
        if num_ok and gen_ok:
            return True
    return False


# Invariable adverbs with a (usually archaic) adjective reading that must not agree after a comparative (`Va plus vite`, not `*plus vites`).
_INVARIABLE_ADVERBS = {
    "vite", "loin", "tôt", "tard", "mieux", "pis", "exprès", "debout",
    "ensemble", "gratis",
}


def _agree_adjective(
    form: str, gn: set[str], index: MorphologyIndex,
) -> str | None:
    """Inflect to gn; with no gender in gn (ambiguous head), agree number only and keep the form's own gender."""
    if form in _INVARIABLE_ADVERBS:
        return None
    adj_lemma = index.lemma_of_form(form, prefer_pos="adj")
    if not adj_lemma:
        return None
    agree_gn = gn
    if not (gn & GENDER_TOKENS):
        own = _form_gender(form, index)
        if len(own) > 1:  # form is itself both genders → can't choose, leave as-is
            return None
        # Epicene adjective (own == set()) still agrees number, no gender.
        agree_gn = gn | own
    if _form_agrees(form, agree_gn, index):
        return None
    return index.inflect(adj_lemma, frozenset(agree_gn), prefer_pos="adj")


def _next_alpha_token(tokens: list[str], i: int) -> str | None:
    """Lowercased next alphabetic token after index `i`, or None at clause end."""
    for j in range(i + 1, len(tokens)):
        if _is_alpha_token(tokens[j]):
            return tokens[j].lower()
    return None


def _noun_agreement_from_form(
    surface: str, lemma: str, index: MorphologyIndex,
) -> set[str] | None:
    """Look up the noun's intrinsic gender + the surface's number."""
    for l, tags in index.lookup_form(surface):
        if l.lower() != lemma.lower():
            continue
        gn = (tags & GENDER_TOKENS) | (tags & NUMBER_TOKENS)
        if "epi" in gn:
            gn = (gn - {"epi"}) | {"mas"}
        if gn:
            return gn
    return None


def _agreement_target(
    inflected_head: str,
    head_lemma: str,
    target_pos: str,
    target: set[str],
    index: MorphologyIndex,
) -> set[str] | None:
    """Return the (gender, number) tag set adjacent adjectives should match.
    None if no agreement applies (e.g. finite verb form — adj near a finite
    verb is unusual and we don't try)."""
    if target_pos == "verbe":
        # Only past participles agree like adjectives.
        if "ppas" not in target:
            return None
    # Demote pronoun readings sharing the head_lemma (masc `personne` pronoun vs fem `personne` noun) so the noun's gender wins.
    matches = [tags for lemma, tags in index.lookup_form(inflected_head)
               if lemma.lower() == head_lemma.lower()]
    matches.sort(key=lambda tags: bool(tags & _DEMOTED_HEAD_TAGS))
    # Epicene or both-genders head makes gender unreliable: agree number only, adjectives keep their own gender.
    kept = [t for t in matches if not (t & _DEMOTED_HEAD_TAGS)] or matches
    genders = {g for t in kept for g in (t & GENDER_TOKENS)}
    ambiguous = "epi" in genders or ("mas" in genders and "fem" in genders)
    for tags in matches:
        gn = (tags & GENDER_TOKENS) | (tags & NUMBER_TOKENS)
        if gn:
            if ambiguous:
                return (gn & NUMBER_TOKENS) or None
            return gn
    return None


# Punctuation tokens that should never have whitespace around them — they
# cling to both sides ("d'objets", "Connaître-le-plus").
_GLUE_BOTH_SIDES = {"'", "’", "-"}
# Punctuation tokens that cling to the previous token only (no space before).
_GLUE_BEFORE = {",", ".", "!", "?", ":", ";", ")", "]"}


def _detokenize(tokens: list[str]) -> str:
    """Glue tokens back together with crossword-style spacing."""
    if not tokens:
        return ""
    parts = [tokens[0]]
    for prev, tok in zip(tokens, tokens[1:]):
        glue_left = tok in _GLUE_BOTH_SIDES or tok in _GLUE_BEFORE
        glue_right = prev in _GLUE_BOTH_SIDES
        if glue_left or glue_right:
            parts.append(tok)
        else:
            parts.append(" " + tok)
    return "".join(parts)
