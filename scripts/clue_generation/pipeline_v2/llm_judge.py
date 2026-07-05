"""Juge Opus committé : verdict GOOD/BORDERLINE/BAD par (lemme, clue) — gate de ship round-N (ADR-0063)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Callable

MODEL = "claude-opus-4-8"

GOOD = "GOOD"
BORDERLINE = "BORDERLINE"
BAD = "BAD"
_VERDICTS = frozenset({GOOD, BORDERLINE, BAD})

SHIP = "ship"
CURATED_REVIEW = "curated_review"
DROP = "drop"

# Rubrique = rulings finalisés du mainteneur ; cite le style-guide v2 (§1.2, §3.1, §1.5, §4).
SYSTEM_PROMPT = """\
Tu es le juge de qualité des définitions de mots fléchés français de WordSparrow.
Pour chaque paire (mot-réponse, définition), tu rends un verdict unique sur
l'échelle GOOD / BORDERLINE / BAD. Le SENS est jugé EN PREMIER.

- GOOD : définition française native, claire, dont le mot est une réponse
  défensible et non ambiguë. C'est le seul verdict qui embarque en production.
- BORDERLINE : correcte mais douteuse, tiède, ou d'un intérêt limité — à
  renvoyer en revue curée, pas en production.
- BAD : erreur de sens, calque étranger nu, ou accord/flexion malformé —
  écartée.

Trois règles, dans cet ordre.

1. Cross-lingual / sens étranger (style-guide §1.2, §3.1).
   BAD si la définition est la traduction nue d'une lecture en langue étrangère
   du mot, sans contenu définitionnel français ET sans marqueur de langue
   (« anglais », « italien », etc. — §3.1). GOOD (préféré) si c'est une
   définition définitionnelle française native du mot. Acceptable/GOOD (moindre
   préférence) si une glose étrangère porte le marqueur §3.1.
   Calibration : STEP ← « Étape » → BAD ; ITEM ← « Objet » → BAD ;
   FASTE ← « Rapide » → BAD (calque de l'anglais « fast » ; faste = splendeur).
   Une définition française native de STEP ou ITEM (emprunts FR valides) → GOOD.

2. Justesse du sens — qualité, pas quantité (style-guide §4).
   Le mot doit être une réponse claire et défensible à la définition. Les
   styles légitimes du §4 — métonymie, périphrase, fonction/rôle, culturel,
   etc. — sont GOOD quand le lien sémantique est non ambigu ; ne les rejette
   PAS comme « mauvais sens ». Mais penche vers BAD sur tout sens faible, ténu,
   ou proche-mais-distinct : écarte le douteux plutôt que de gonfler la
   couverture.
   Calibration : TIR ← « Action de viser » → BAD (viser = pointer ≠ tir = le
   coup tiré).

3. Flexion / accord (style-guide §1.5).
   BAD en cas de désaccord sujet-verbe interne, de conjugaison malformée, ou de
   passé simple à la 1re/2e personne. Le passé simple à la 3e personne est
   acceptable (aligné sur le drop d'inflation « passe-simple-person » : seules
   1re/2e sont écartées, donc juge et inflateur ne se contredisent jamais).
   Calibration : TRANSPIRERAS ← « La sueur apparaîtras » → BAD ; passé simple
   1re/2e personne → BAD ; passé simple 3e personne → acceptable.

Rends UNIQUEMENT l'objet structuré demandé : `verdict` (GOOD|BORDERLINE|BAD) et
`reason` (une phrase courte en français citant la règle décisive)."""

_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": [GOOD, BORDERLINE, BAD]},
        "reason": {"type": "string"},
    },
    "required": ["verdict", "reason"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class JudgeVerdict:
    """Verdict du juge : échelle GOOD/BORDERLINE/BAD + justification courte."""
    verdict: str
    reason: str = ""

    @property
    def ships(self) -> bool:
        """Politique GOOD-only : seul GOOD embarque en production."""
        return self.verdict == GOOD

    @property
    def route(self) -> str:
        """Sortie : ship (GOOD) | curated_review (BORDERLINE) | drop (BAD)."""
        if self.verdict == GOOD:
            return SHIP
        if self.verdict == BORDERLINE:
            return CURATED_REVIEW
        return DROP


# Un « call » prend (lemme, clue) et retourne le texte brut (JSON) du modèle.
JudgeCall = Callable[[str, str], str]


def _user_prompt(lemma: str, clue: str) -> str:
    """Message utilisateur : la paire à juger."""
    return f"Mot-réponse : {lemma}\nDéfinition : {clue}"


def parse_verdict(raw: str) -> JudgeVerdict:
    """Parse la réponse structurée du juge ; lève ValueError si le verdict est hors échelle."""
    data = json.loads(raw)
    verdict = str(data["verdict"]).strip().upper()
    if verdict not in _VERDICTS:
        raise ValueError(f"Verdict hors échelle : {verdict!r}")
    return JudgeVerdict(verdict, str(data.get("reason", "")).strip())


def anthropic_call(lemma: str, clue: str, *, model: str = MODEL,
                   client=None) -> str:
    """Appel Opus réel via le SDK Anthropic ; retourne le JSON structuré (clé API via l'env)."""
    import anthropic

    client = client or anthropic.Anthropic()
    resp = client.messages.create(
        model=model,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
        messages=[{"role": "user", "content": _user_prompt(lemma, clue)}],
    )
    return next(b.text for b in resp.content if b.type == "text")


def judge_clue(lemma: str, clue: str, *, call: JudgeCall | None = None) -> JudgeVerdict:
    """Juge une paire (lemme, clue) ; `call` injectable (mock en test, Opus en prod)."""
    call = call or anthropic_call
    return parse_verdict(call(lemma, clue))


def judge_batch(candidates: list[dict], *, call: JudgeCall | None = None,
                lemma_key: str = "mot",
                clue_key: str = "definition") -> list[tuple[dict, JudgeVerdict]]:
    """Juge un lot de candidats (post-filtres déterministes) ; retourne (ligne, verdict) par candidat."""
    return [(row, judge_clue(row[lemma_key], row[clue_key], call=call))
            for row in candidates]
