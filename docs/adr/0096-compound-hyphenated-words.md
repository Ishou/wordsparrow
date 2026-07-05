# ADR-0096: Compound (hyphenated) words in grids

## Status
Accepted

## Context
Mots fléchés commonly use hyphenated headwords (ARC-EN-CIEL, PEUT-ÊTRE). The
grid pipeline enforces one A-Z letter per cell and silently drops any entry with
a non-A-Z char at ingest (`CsvWordRepository.kt:321`, and `.isalpha()` in the
extraction scripts), so compounds never survive. Placement, crossing, and HMAC
validation already operate on a separator-free A-Z run
(`HmacAnswerTokenMinter.kt:46` filters to A-Z), so only *ingest* and *display*
are missing.

## Decision
- Represent a compound as its A-Z letter run plus `separators: List<Int>` —
  offsets at which a hyphen precedes that cell (ARC-EN-CIEL → `ARCENCIEL`, `[3,5]`).
- Ingest folds interior hyphens into offsets instead of dropping the row; other
  non-A-Z chars (space, apostrophe, digit) still drop. Scope: hyphen only.
- Surface offsets on the `DefinitionCell` wire field (the frontend consumes
  definition cells, not the `clues[]` array); render the hyphen in the inter-cell
  gap along the arrow axis. It is never a fillable cell or a keystroke.
- Generation, intersection, and HMAC validation are unchanged.
- Data provenance: hyphenated headwords may be re-extracted from the Grammalecte/
  Dicollecte lexique already shipped under MPL-2.0 (ADR-0058); clues are authored
  or generated (ADR-0087). A small hand-authored CC0 seed set ships first.

## Consequences
Easier: compounds become first-class grid answers; longer-word corpus coverage
improves CSP fill. Harder: the frontend gains an inter-cell overlay concern and
an a11y announcement. Unchanged: cell model, validation, generation heuristics.
