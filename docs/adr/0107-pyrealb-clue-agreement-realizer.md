# ADR-0107: PyRealB realizer for clue lemma→surface agreement

## Status
Proposed

## Context
Clues are generated at **lemma form** (masc-sing noun/adj, infinitive verb)
and inflated to every grid **surface** by `scripts/eval/inflect_clue.py` +
`scripts/clue_generation/build_surface_clues.py`. The inflater is **head-only**
by design (ADR-era note in `inflect_clue.py`): it finds one head token whose
POS matches the surface and inflects only that token; "multi-token agreement is
intentionally out of scope."

That design leaks a long tail of French **agreement** bugs onto the live grid:

- **Wrong-token agreement (reported).** `abusives` cluing `Qui outrepasse un
  droit`: the head-ranker had no adjectival head, grabbed the article-governed
  object `droit` (tagged adj|nom) and agreed it → **`Qui outrepasse un droites`**
  shipped to the daily grid.
- **Silent under-agreement (pervasive).** A relative clause `Qui + verbe` must
  agree its verb with the antecedent (the answer). Head-only never does this —
  the verb's POS ≠ the surface's POS — so every plural answer ships a singular
  verb: `menteurs → "Qui ment"` (should be `Qui mentent`).
- **No NP agreement.** `bustes` cluing `Haut du corps humain` should be
  `Hauts des corps humains` (`du→des`, `humain→humains`); head-only cannot.
- **No gender / past-participle / compound-tense agreement.** `alliées →
  "Uni par un pacte"` (should be `Unies…`); `Qui a menti → Qui ont menti`.

Each failure so far has been met with another special-case frame guard in
`inflect_clue.py` (`_has_verb_dobj_frame`, `_pp_action_definition`,
`_restructure_negation`, the `non`-demotion, a determiner-governed guard). That
is the "three patches = the shape is wrong" signal: head-only token inflation is
structurally incapable of agreement, and the heuristic stack will not converge.

A proper solution needs a **realizer** — something that takes a syntactic
structure with agreement features and emits correctly-agreed French.

### Evidence (spikes, 2026-07-11)
- **PyRealB** (MIT, pure-Python, deterministic, no ML model) realized *every*
  failing class correctly from a built structure: `qui outrepassent un droit`,
  `qui dénoncent un coupable`, `unies par un pacte`, `hauts des corps humains`
  (incl. the `du→des` contraction), `qui ont menti` (auxiliary agreement).
- **Lexicon coverage:** PyRealB knows **92%** of corpus lemmas; the missing 8%
  are overwhelmingly invariable (proper nouns, sigles, abbreviations) or
  supplementable from the grammalecte lexique we already load.
- **Frame coverage:** classifying the 27.6k lemma clues by leading POS (via the
  grammalecte `MorphologyIndex` already in-tree), **96.9%** fall into 7
  recognizable frames (noun-initial 52%, adj-initial 20%, verb-initial 13%,
  prep-initial 5%, relative-`qui` 4%, single-word 3%, relative-`que` 0.1%);
  only **3.1%** are "other".
- **mlconjug3** was evaluated and **rejected**: its conjugator is an ML model
  pickled against a specific scikit-learn version (failed to load on a newer
  one), and it is redundant — grammalecte already conjugates every known verb.

## Decision
1. **Adopt PyRealB** (`pyrealb`, MIT) as the agreement **realizer** for the
   clue lemma→surface inflation step. Pin the version.
2. **Build structures with a frame-based builder** driven by the grammalecte
   `MorphologyIndex` we already load — **no ML dependency parser**. This
   deliberately sidesteps the ADR-0058 model-licence review that spaCy/Stanza
   French models would require (their UD training treebanks carry mixed licences
   that must be classified before commercial use — unverified, and avoided
   entirely by not depending on them). Each
   frame is `(recognizer, structure template, answer→feature mapping)`; the
   answer's morphology drives which constituent agrees (relative-clause verb →
   number+3p; appositive head noun → number; predicative adjective →
   gender+number).
3. **Fall back to the existing head-only inflater** for any clue not matched by
   a frame or whose words PyRealB's lexicon lacks. This bounds the blast radius:
   the 3% tail keeps today's behaviour, so adoption is strictly additive.
4. **Build-time only.** Realization runs offline in the corpus build; the
   production read path stays the committed CSV (ADR-0013 §8 / ADR-0097). No
   runtime dependency on PyRealB in `grid-api`/`grid-worker`.
5. **Lexicon supplementation.** Feed grammalecte gender/number/conjugation for
   lemmas PyRealB doesn't know via `addToLexicon`, sourced from the lexique
   already in the tree (MPL-2.0, ADR-0058-clean).

## Consequences
- **Correct agreement across the tail** — relative-clause verbs, full NP
  agreement, contractions, gender/PP, compound tenses — instead of an
  ever-growing heuristic stack. `inflect_clue.py` becomes the *fallback*, not
  the primary path, and stops accreting frame guards.
- **New build-time dependency** (`pyrealb`, MIT). Pinned; ADR-0058-clean (no
  corpus/model licence entanglement). Adds a `scripts/clue_generation/`
  requirement, not a runtime/image one.
- **A structure-building layer to own** — the frame recognizers and
  answer→feature mappings are new code with their own tests; getting a frame's
  agreement mapping wrong is a new failure mode (mitigated by the fallback and a
  golden-clue regression suite).
- **Regen produces a large but correct diff** — hundreds of surface clues change
  to their properly-agreed forms. Landed as a corpus regen in the private
  `wordsparrow-clue-data` repo after the code lands.
- **3% "other" + 8% lexicon-gap clues** keep head-only behaviour until a frame
  or lexicon entry is added — coverage grows incrementally, no cliff.

## Rollout (waves)
1. **This ADR** (governance) + `pyrealb` pinned in the clue-gen requirements.
2. **Realizer + frame builder core**: relative-`qui`/`que` and predicative
   adjective/PP frames (the highest-bug-density, lowest-ambiguity frames incl.
   the reported bug), with a golden-clue test suite; fallback wired.
3. **Appositive noun-phrase frame** (the 52% head, including the `bustes`
   distributive-complement case) + lexicon supplementation from grammalecte.
4. **Verb-initial frame** for verb-answer surfaces (compound tenses).
5. **Corpus regen + runtime guard** in the private repo; extend
   `test_runtime_csv_pleonasms.py`-style gates to assert no known
   agreement-error shapes ship.
