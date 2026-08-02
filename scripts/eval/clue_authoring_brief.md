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

RADICAL-LEAK RULE — read the scope carefully, it has been misread in both directions:

  A clue may not contain the answer, an inflected form of it, or a token sharing a 4-character
  **initial radical** (common prefix) with it. `lauréat` may not be clued "Couronné de lauriers";
  `gréseuse` may not be clued "De la nature du grès".

  This is a PREFIX rule, not a substring rule. A shared French derivational SUFFIX is not a leak:
  `-ment`, `-erie`, `-tion`, `-ance`, `-illon`, `-enne`, `-onne`, `-age`, `-eur` and friends are
  shared by thousands of unrelated words. `cotillon` / "réveillon" and `tôlerie` / "carrosserie"
  are FINE. Do not contort around them.

  EXCEPTION 1 — PROPER NOUNS ARE EXEMPT. For a demonym or a word derived from a place or person
  name, the proper noun IS the definition:
      angevin -> "D’Angers"     lapon -> "De Laponie"     algérois -> "D’Alger"
      letton  -> "De Lettonie"  nantais -> "De Nantes"    malien -> "Du Mali"
  Take the natural toponym; do not route around it. Applies only to capitalised proper nouns in
  non-initial position, never to common-noun cognates. It does NOT rescue an exact
  self-reference: `souabe` -> "De Souabe" is still banned by §1.1.

  EXCEPTION 2 — `cryptique_morphologique` is licensed by §4.8 as the documented exception to
  §1.1, and `validate_clue.py` honours the flag. Where a word's strongest clue is letter-play on
  its own form (`encontre` -> "Rencontre sans r", `laite` -> "Laitue sans u"), use it — but only
  with style=cryptique_morphologique, and at most once per noun.

BANNED CLUE OPENINGS (§6.5): "Sert à …", "Permet de …", "Fait de …", "Action de …", "Qui est …",
"Ce qui est …", "Chose qui …". Use a concrete noun phrase or a 3rd-person verb instead.

STEP 3 — OUTPUT FORMAT. CSV, UTF-8, header exactly:
  word,clue,style
3 rows per noun, 300 rows. `style` ∈ définition_directe, périphrase, métonymie, fonction_rôle,
culturel, cryptique, cryptique_morphologique, technique. Quote fields containing a comma.

STEP 4 — MECHANICAL SELF-CHECK. Write a throwaway script in /tmp (never in the worktree) that
verifies: 300 rows + header; 3 per noun; all 100 nouns; ≤25 chars; no 4-char initial-radical leak
(split tokens on apostrophes and hyphens first, or `d’Algérie` parses as one token and masks
leaks; exempt the clue's first token from the proper-noun rule, since it is always capitalised);
no banned opening; no straight apostrophe; no final period; initial capital. Fix every failure
and re-run until clean.

Report: rows written, max clue length, violations found and fixed, and any noun you judged
genuinely unclueable (omit it rather than write a bad clue, and name it).
