# Past-participle (ppas) clue generation — deterministic rules

Status: rules validated; pipeline implementation is a follow-up refactor · Context: `scripts/clue_generation/` + the fillable corpus (`words-fr.csv`, private repo)

## Problem

Grid answers are stored **accent-stripped** (`HÉSITÉ` → `HESITE`, `MENACÉES` → `MENACEES`).
The clue pipeline was inflating a verb clue onto past-participle surfaces and agreeing
it to the surface's gender/number, which produced two classes of wrong clue:

- **Agreement errors / unverifiable agreement** — the inflated head's agreement can't be
  reliably validated at scale.
- **Voice/category errors** — a bare past-participle clue is read in *mots fléchés* as the
  passive/adjectival "[quelque chose] **est** X". That reading only exists for verbs that
  take a direct object (or état verbs); for an intransitive verb conjugated with *avoir*
  it is ungrammatical and silently switches to a different sense. Example: `hésité`
  (only "a hésité", active) clued "Balancé entre deux choix" reads as "est balancé"
  (swung — the *transitive* sense of *balancer*), not "wavered".

## Core insight

Because accent-stripping makes the past participle collide with the **present tense**
(`hésité`/`hésite` → `HESITE`), the answer's letters can almost always be reached by a
reading that needs **no agreement**. Prefer a non-participle clue — present tense, noun,
or plain definition — and the entire agreement/voice problem disappears.

## Classification (deterministic, via grammalecte)

For a ppas surface, the grammalecte tags on the participle decide whether a
participle/adjective clue is legitimate:

| grammalecte on the ppas form | verb type | participle clue? | how to clue |
|---|---|---|---|
| `adj` present, agrees (4 forms) | transitive **or** être-intransitive (`parti`, `mort`, `né`, `menacé`) | **allowed** — "est X" is valid, agrees cleanly | agreeing adjective/participle, or a present/definition |
| `inv`, **no** `adj` (single form) | avoir-intransitive (`hésité`, `ri`, `menti`, `existé`) | **forbidden** — no adjectival/passive reading | present tense / definition only |

Audit result: the `inv`+no-`adj` key is reliable — the only grammalecte-transitive
lemmas caught (`médire`, `pleuvoir`, `pouvoir`) are impersonal/modal with invariable,
non-adjectival participles, so they are correctly in the forbidden set.

## Routing the forbidden (avoir-intransitive) class

Per **reading**, not per surface (a surface keeps its non-participle readings):

1. **present-collision** — the stripped form also has a present-tense reading at the same
   letters (`-er` verbs: `hésité`/`hésite`): clue in the present/definition. Reliable and
   agreement-free. (~50% of ppas answers overall have this collision; it already excludes
   non-colliding cases like `aller`/`envoyer` since it requires a same-letters present.)
2. **other non-participle reading** — surface reads as a noun/pronoun/abbreviation/symbol:
   clue that reading.
3. **hard residue** — no present, no other reading, only a bare intransitive participle
   (`ri`, `menti`, `dormi`, `appartenu`): **filter from the fillable wordlist** (future
   generation) — no clean clue exists, and these are weak fill.

## Blast-radius gates (learned the hard way)

Two exclusions the naive rule misses — both must be in the deterministic layer:

- **Present-route must exclude any surface with a noun/adjective reading.** French coins
  `-er` verbs from nouns (`crise`→`criser`, `pomme`→`pommer`), and the participle strips
  back onto the noun (`crisé`→`CRISE`, `pommé`→`POMME`). The answer is the **noun**; it must
  keep its noun clue, not be re-clued as the rare verb. Applying the present-route without
  this gate mis-scoped a batch **86%** to common nouns (`CRISE`, `RAGE`, `VASE`, `OVULE`, …).
- **The "other reading" check for the hard-residue filter must span all POS**, not just
  noun/adjective. The loaded grammalecte index holds only content words, so
  pronoun/abbrev/symbol readings are missed — `lui` (pronoun), `pu` (Pu), `ri` (régiment)
  would be wrongly filtered. These require a whole-lexicon check or an explicit keep-list.

## Hard-residue filter set (finalized)

`inv`+no-`adj`, no other reading: **69 unique surfaces** (32 in corpus, 37 obscure/absent).
Keep the three lexicon-gap false positives — `lui`, `pu`, `ri` — filter the remaining 66.
Full list in the layer artifact.

## Applied vs remaining

- **Applied on prod (grid corrections):** the avoir-intransitive present-route verb-answers
  actually on grids that had a differing, non-noun clue — 22 corrections (`EXISTE`,
  `RESISTE`, `HESITE`, `MILITE`, `DIVERGE`, …). Grid-DB only.
- **Not yet done:** apply the rules + wordlist filter to the **corpus** (future gens);
  re-evaluate the larger **transitive / être-intransitive** ppas population (the bulk of the
  earlier bulk-seed runs) against the sharpened rules; and the pipeline refactor that turns
  these layers into tested code in `scripts/clue_generation/`.

## Notes for the refactor

- Each rule is a deterministic predicate + action (`exclude-reading` / `route-to-clue-type`
  / `filter-from-wordlist`); layers compose per (surface, reading).
- LLM clue *generation* passes structural checks (no agreement head, no leak, length) but
  **not solvability** — a clue can pass every automated/agent gate and still not lead a
  solver to the answer (`IMPOSES → "Qu'on subit sans les choisir"`). Solvability needs a
  human solving pass or a much stronger adversarial gate; do not treat AI-verified as done.
