# Clue-coverage priority for grid quality

**TL;DR** — The single biggest lever on generated-grid quality is **clue coverage
of mid-length words (6–10 letters)**, not any generator change. The generator is
starved of long words: they exist in the corpus but are unclued, so the filler
never sees them, hits dead ends on long slots, and perturbs them into short
ones. Cluing the 6–10 band moves grids measurably toward longer, less-cramped
puzzles.

## Evidence

A 2026-07-01 investigation swept every generator-side knob (black-cell density,
run-length cap, short-run penalties, longest-slot-first fill order, perturbation
whitening, and two alternative generators — word-first greedy and a joint
backtracker). **None** moved the filled word-length distribution; the generator
sits at its practical frontier for the *clued* corpus.

The one thing that did move it: swapping the clued corpus (~27k words) for the
full surface corpus (~121k, same generator, no other change), measured over 40
grids at 15×12:

| corpus | success | 2+3 short share | avg word length |
|--------|---------|-----------------|-----------------|
| clued (today)   | 34/40 | 45.1 % | 4.1 |
| **full surfaces** | 38/40 | **33.6 %** | **4.65** |

Short-share drops ~11 pp, mean length rises ~0.55, **and success improves** —
long slots become fillable, so the generator perturbs them short far less often.
(This experiment used the word itself as a placeholder clue to prove the ceiling;
realising it in production means generating *real* clues for those words.)

## Where the coverage gap is

Clued share of the French corpus by word length:

| len | total | clued | unclued | clued % |
|-----|-------|-------|---------|---------|
| 2   | 186   | 186   | 0       | 100 %   |
| 3   | 220   | 220   | 0       | 100 %   |
| 4   | 1 255 | 481   | 774     | 38 %    |
| 5   | 2 988 | 1 265 | 1 723   | 42 %    |
| 6   | 5 221 | 2 154 | 3 067   | 41 %    |
| 7   | 7 560 | 2 948 | 4 612   | 39 %    |
| 8   | 10 775| 3 776 | 6 999   | 35 %    |
| 9   | 12 889| 4 224 | 8 665   | 33 %    |
| 10  | 15 196| 4 228 | 10 968  | 28 %    |
| 11  | 17 162| 3 788 | 13 374  | 22 %    |
| 12  | 18 350| 2 255 | 16 095  | 12 %    |
| 13  | 14 049| 930   | 13 119  | 7 %     |
| 14  | 9 756 | 409   | 9 347   | 4 %     |
| 15  | 5 709 | 97    | 5 612   | 2 %     |

## Priority

1. **Lengths 6–10 — highest priority.** These are the slot lengths the generator
   actually fills (the default run-length cap is 9), and coverage is thinnest
   here (28–41 %). Every clue added in this band directly widens the filler's
   options where it matters.
2. **Lengths 4–5 — secondary.** ~40 % covered; the slots are common but shorter,
   so the quality upside is smaller.
3. **Lengths 11–15 — deliberately low priority.** Coverage is tiny (2–22 %), but
   raising the run cap to place these words is measured to *backfire*: a 15×12
   grid cannot tile with mostly-long interlocking words, so each long slot forces
   short compensating slots — the distribution goes bimodal and mean length
   *drops*. Real printed mots fléchés cluster at moderate lengths for the same
   geometric reason. Clue these opportunistically, not as a target.
4. **Lengths 2–3 — already ~100 % covered.** No action.

## Target

Bringing the 6–10 band from ~35 % toward full coverage is what closes the gap to
the 34 %-short / 4.65-avg frontier above. Frame Modal/LoRA generation runs around
these lengths (lemma-anchored admission already governs which surfaces qualify —
see the `clue-ai` skill and `docs/eval/clue-gen-v0.md`); this brief only sets the
*length priority*, not the admission policy.
