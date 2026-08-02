# Clue-authoring brief (batch dispatch)

Template for the agents that author mots-fléchés clues for nouns missing from the corpus.
Substitute `NN` for the batch number. Rules below are the ones agents got wrong when they
were left implicit — the style guide remains authoritative for everything else.

---

You are authoring French mots-fléchés clues (définitions) for the WordSparrow puzzle corpus.

WORKTREE=<absolute path to the worktree>

INPUT:  $WORKTREE/data/eval/noun-batches/batch-NN.txt  (100 French nouns, one per line)
OUTPUT: $WORKTREE/data/eval/clues/batch-NN.csv         (create/overwrite this file only)

Write ONLY that one CSV. Do NOT modify any other file. Do NOT run any git command at all,
not even read-only ones like `git status`.

WORK STEADILY. Read the style-guide sections below with targeted reads (offset/limit or grep,
not a whole-file load — it is 131 KB and loading it whole has stalled agents), author in a few
large chunks rather than noun by noun, and write the CSV before you begin verification so
partial progress survives.

STEP 1 — READ THE STYLE GUIDE FIRST:
  $WORKTREE/docs/clue-style-guide-v2.md
  - "## 1. Principes fondamentaux" (1.1 through 1.7)
  - "## 2. Caractéristiques structurelles" (2.1, 2.3, 2.4)
  - "## 3. Conventions implicites" (3.1, 3.3, 3.6, 3.8)
  - "## 4. Taxonomie des styles" — the 9 styles + récapitulatif table
  - "# Partie 2" — especially §6.1, §6.5, §6.7
It overrides anything below that appears to conflict.

STEP 2 — 3 DISTINCT CLUES PER NOUN (300 rows).
  - French only.
  - HARD CAP 25 characters per clue including spaces and punctuation. Count them.
  - Initial capital, no final period, no complete sentences. Typographic apostrophe U+2019 (’),
    never U+0027. At most one comma per clue.
  - The 3 clues must be different ANGLES (different style mechanics), not rewordings. Cover
    distinct senses for polysemous nouns.
  - Gender/number agreement with the answer per §2.3. No pleonasms.
  - Do NOT use `calembour` — §1's note de conformité excludes it from automatic generation.

RADICAL-LEAK RULE — every clause below exists because a wave got it wrong in one direction
or the other. Read all of it.

  A clue may not contain the answer, an inflected form of it, a token sharing a 4-character
  **initial radical** (common prefix) with it, **or a token of 4+ characters contained anywhere
  inside it**. `lauréat` may not be clued "Couronné de lauriers"; `gréseuse` may not be clued
  "De la nature du grès".

  CONTAINMENT COUNTS, not just the prefix. These all shipped in wave 2 and are leaks:
      adverbe        "Modifie le verbe"          ad-VERBE, 5 letters of 7
      surlendemain   "Jour suivant le lendemain" sur-LENDEMAIN, 9 of 12
      archevêque     "Supérieur de l’évêque"     arche-VÊQUE
      emplacement    "Place réservée"            em-PLACE-ment
  If the answer is a compound or a prefixed form, its head is not available as a clue word.

  A shared French derivational SUFFIX is NOT a leak: `-ment`, `-erie`, `-tion`, `-ance`,
  `-illon`, `-enne`, `-onne`, `-age`, `-eur` are shared by thousands of unrelated words.
  `cotillon` / "réveillon" and `tôlerie` / "carrosserie" are FINE.

  A COINCIDENTAL prefix shared with a common short word is NOT a leak either. `sanscrit` does
  not block the preposition `sans`; `centralisme` does not block the numeral `cent`. The rule
  exists to catch shared etymology, not shared spelling — if the two words are unrelated in
  meaning, use the clue.

  EXCEPTION 1 — PROPER NOUNS ARE EXEMPT. For a demonym or a word derived from a place or person
  name, the proper noun IS the definition:
      angevin -> "D’Angers"     lapon -> "De Laponie"     algérois -> "D’Alger"
      letton  -> "De Lettonie"  nantais -> "De Nantes"    malien -> "Du Mali"
  Take the natural toponym; do not route around it. Applies only to capitalised proper nouns in
  non-initial position, never to common-noun cognates. It does NOT rescue an exact
  self-reference: `souabe` -> "De Souabe" is still banned by §1.1.

  EXCEPTION 2 — ABBREVIATION AND SYMBOL MARKERS ARE LICENSED (§3.2, §1.1's sigle exception). The
  answer is always the SHORT form — a symbol, sigle, or clipped word; the clue develops or
  paraphrases it, never the reverse: `al` -> "Symbole de l'aluminium", `admin` -> "Chef du
  réseau, en abrégé". Cluing a LONG word via its own abbreviation (`aluminium` -> "En chimie,
  Al") is NOT licensed here — that reverses the direction every §3.2 pattern and every real
  sigle/abbreviation example documents. If you add a domain marker, it is ANTÉPOSÉ — `En X, Y`
  per §3.8's own worked examples. `Y en X` is the postposed §3.1 *language*-marker shape, not
  domain; the position is what discriminates the two (§3.8 "Pièges à éviter"), so don't swap
  them.

NEVER USE LETTER-PLAY. Do not write clues that operate on the answer's spelling —
`encontre` -> "Rencontre sans r", `laite` -> "Laitue sans u", `traitance` -> "Sous-traitance
sans sous". These are banned outright regardless of what §4.8 licenses: they hand the solver
the answer's letters. The `cryptique_morphologique` style must not appear in your output at
all. If a word's only strong clue is letter-play, write a plain definition instead.

BANNED CLUE OPENINGS (§6.5): "Sert à …", "Permet de …", "Fait de …", "Action de …", "Qui est …",
"Ce qui est …", "Chose qui …". Use a concrete noun phrase or a 3rd-person verb instead.

STEP 3 — OUTPUT FORMAT. CSV, UTF-8, header exactly:
  word,clue,style,head_pos
3 rows per noun, 300 rows. `style` ∈ définition_directe, périphrase, métonymie, fonction_rôle,
culturel, cryptique, technique. Quote fields containing a comma. `cryptique_morphologique` and
`calembour` are not available.

`head_pos` is optional — leave it blank for the ~99% of clues where the opening head token has
only one reading. Fill it only when the clue's head is genuinely ambiguous between a verb and a
noun/adjective reading, using exactly one of `verbe`, `nom`, `adj` (matching the POS you intended
for that head token). Worked example: `Porte le glaive` is headed by the verb `porter` — write
`head_pos=verbe`; `Porte d'entrée` is headed by the noun `porte` — write `head_pos=nom`. Without
the label, the inflater cannot tell these two apart and may pick the wrong reading.

STEP 4 — MECHANICAL SELF-CHECK. Write a throwaway script in /tmp (never in the worktree) that
verifies: 300 rows + header; 3 per noun; all 100 nouns; ≤25 chars; no radical leak — test BOTH
the 4-char initial radical AND containment of any 4+ char token inside the answer (split tokens
on apostrophes and hyphens first, or `d’Algérie` parses as one token and masks leaks; exempt the
clue's first token from the proper-noun rule, since it is always capitalised); no banned opening;
no `cryptique_morphologique` rows; no straight apostrophe; no final period; initial capital.
Fault-inject each defect once to confirm the checker actually fires, then fix every real failure
and re-run until clean.

Report: rows written, max clue length, violations found and fixed, and any noun you judged
genuinely unclueable (omit it rather than write a bad clue, and name it).
