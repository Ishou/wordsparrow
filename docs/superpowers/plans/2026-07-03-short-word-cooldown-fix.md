# Short-word cooldown starvation — recover hidden good words + multi-clue

## Why this exists (context for the next session)

The daily puzzle default changed **15×12 → 28×20** (#1258, #1264). Regenerating
dailies then retry-storms and fails. Root cause, verified by a local sweep
(`grid/api/src/test/kotlin/com/bliss/grid/api/CooldownSweepTest.kt` +
`WordUsageTallyTest.kt`):

- A 28×20 grid consumes **~68 distinct 2-letter and ~45 distinct 3-letter words
  per grid** (dense mots-fléchés = many short arrow-slots). Long words have huge
  headroom; **short words are the bottleneck.**
- The clued pools are tiny: **len-2 ≈ 174 words, len-3 ≈ 263** — and the 2-letter
  pool is physically exhausted (176/176 words in the corpus already clued).
- The ADR-0031 clue cooldown (`DEFAULT_COOLDOWN_MAX = 8`) is **per-(word,clue)**
  with a **random 1..max roll**. On the tiny short-word pool, cooldown bans a
  third-plus of it per grid → the fill starves → retry storm.

**We CANNOT exempt short words from cooldown** (product decision). The fix is
therefore two-pronged and both live in the curated overlay
`scripts/clue_generation/add_short_word_clues.py` (which appends/updates rows in
`words-fr.csv` directly, bypassing the grammalecte-import ban):

1. **Multi-clue every short word.** Cooldown is per-(word,clue); a word is only
   unusable when ALL its clues are cooled. Giving each 2–3 letter word **3–5
   distinct clues** multiplies effective capacity under cooldown (~174 two-letter
   words × 4 clues ≈ 700 clue-slots, which survives cm=8) WITHOUT any exemption.
2. **Add the good short words currently hidden by admission filters** (below).

## Words to add

### A. 2-letter abbreviations (hidden by lemma-anchored admission — they have no grammalecte lemma)

All are standard mots-fléchés answers, currently absent:

| word | gloss for clue-writing |
|------|------------------------|
| JO   | Jeux Olympiques |
| IA   | Intelligence artificielle |
| BD   | Bande dessinée |
| VO   | Version originale |
| QG   | Quartier général |
| PJ   | Pièce jointe / police judiciaire |
| CF   | Confer (voir aussi) |
| HT   | Hors taxe |
| ID   | Idem |
| DJ   | Disc-jockey |

### B. 3–4 letter passé-simple / présent forms (hidden by the passé-simple ban or the len<4 clue gap)

Hand-picked by verb quality + tone (frequency is NOT the filter — `HUA`/`NUA` are
low-freq but fine; `CHIA`/`BITA` are high-freq but excluded as vulgar). Source
verb shown so clues can be written accurately (e.g. `FIT` → "Fabriqua jadis" /
"Passé simple de faire"). All confirmed ABSENT from `words-fr.csv`.

**Irregular auxiliaries / modals (highest value):**
FIT, FIS ← faire · MIT, MIS ← mettre · PUT ← pouvoir · VIT ← voir ·
DUT, DUS ← devoir · SUT, SUS ← savoir · LUT, LUS ← lire · DIT, DIS ← dire ·
FUS ← être · EUS ← avoir · TINT, TINS ← tenir · MUT, MUS ← mouvoir ·
TUT, TUS ← taire · RIT ← rire

**Common -er verb 3sg passé simple (guessable, tonally clean):**
OSA ← oser · OTA ← ôter · TUA ← tuer · RUA ← ruer · SUA ← suer · HUA ← huer ·
NUA ← nuer · FIA ← fier · PUA ← puer · MUA ← muer · ARMA ← armer · FILA ← filer ·
LEVA ← lever · LOUA ← louer · NOUA ← nouer · VIDA ← vider · GELA ← geler ·
GERA ← gérer · GENA ← gêner · SALA ← saler · TAPA ← taper · CALA ← caler ·
GARA ← garer · GATA ← gâter · DORA ← dorer · DOSA ← doser · DOPA ← doper ·
FETA ← fêter · FUMA ← fumer · HUMA ← humer · HELA ← héler · LIMA ← limer ·
MINA ← miner · MIRA ← mirer · MURA ← murer · MUTA ← muter · PANA ← paner ·
PELA ← peler · PILA ← piler · RAMA ← ramer · RIMA ← rimer · RIVA ← river ·
ROTA ← roter · ROUA ← rouer · SCIA ← scier · BUTA ← buter · DAMA ← damer ·
LESA ← léser · MIMA ← mimer · MISA ← miser · MITA ← miter · CELA ← celer
(bonus: also the pronoun "cela") · LOVA ← lover · MUSA ← muser · RUSA ← ruser ·
SAPA ← saper · TETA ← téter · LACA ← lacer · LAPA ← laper · CIRA ← cirer ·
COTA ← coter · FANA ← faner · GOBA ← gober · LOBA ← lober · PAVA ← paver ·
PIPA ← piper · RALA ← râler · RAPA ← râper · RIDA ← rider · RODA ← roder ·
VEXA ← vexer

(~70 forms. Skip anything vulgar/obscure/anglicism — e.g. CHIA, BITA, PINA,
SUCA, PETA, GODA, KIFA, ZUNA, TUTA, JAVA, LIKA, FAXA, TASA. Those are correctly
excluded.)

### Correctly-excluded (do NOT add) — for reference

The passé-simple ban is right about ~41k forms: ALL `1pl` (`-âmes`) and `2pl`
(`-âtes`) forms (archaic, zero high-freq), `3pl` (`-èrent`, long), `2sg` (`-as`,
incl. Spanish contamination `gracias`/`palabras`), and low-value/vulgar/obscure
verbs. Keep the ban; only the curated forms above are recovered via the overlay.

## Execution notes (2026-07-03, as implemented)

The maintainer amended step 1: **passé-simple clues are NOT hand-written.**
List-B forms are recovered by `scripts/clue_generation/recover_passe_simple_forms.py`,
which machine-inflects each form's clue(s) from the source verb's existing
lemma clues via `inflect_clue` at the exact mood + person carried by the
surface's grammalecte tags. The blanket ipsi admission ban stays; only the
curated allowlist is admitted, so the ~41k bad forms remain excluded and the
allowlist is exactly the found false positives. Quality guards: the source
clue must be infinitive-led (rejects nominal clues whose embedded verb the
head ranker grabs), reflexive-led sources only inflect to third person, and
forms whose corpus lemma clue carries a wrong sense (buter→Beurrer,
river→Cours d'eau, taper→S'affiner, fier→adjectival, ruer→Galoper,
doser→Administrer) are deferred until the lemma clue is fixed upstream.

`build_surface_clues.py` / `merge_clues_into_wordlist.py` were deliberately
NOT run: the full merge blanks source=grammalecte rows without corpus clues
(the round-12 "5.3k dropped clues" trap), and every change here is an
additive source=bliss overlay row the merge leaves alone.
