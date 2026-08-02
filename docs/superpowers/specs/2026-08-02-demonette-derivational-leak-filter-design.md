# Démonette derivational-leak filter — design

**Date:** 2026-08-02
**ADR:** ADR-0121 (this workstream), under ADR-0119 roadmap item 2, ADR-0058 licence matrix.
**Bounded surface:** offline clue pipeline (`scripts/`), Python. No JVM/frontend change.
**Origin:** prod `player_reports` `definition_revele` signalements — clues that leak the
answer via a morphological relative the current string/stem check misses.

## Problem

The live leak gate is string-based, in two twinned implementations:
- `scripts/clue_generation/pipeline_v2/filters.py`: `filter_5_auto_reference` (literal
  `\b`-word match) + `filter_9_stem_leak` → `_stem_leak_match` (LCP ≥ 5 or mutual substring,
  both forms ≥ 5 chars).
- `scripts/eval/validate_clue.py`: `_find_lemma_family_leak` (inflectional family via
  grammalecte) + `_find_stem_leak` (same LCP/substring rule).

It catches the answer's own inflected forms and orthographically-close tokens, but **misses
prefix-masked and short-root derivational leaks** — a clue token that shares a *root* with the
answer through derivation, not surface spelling. ADR-0119 names this the "substring-luck"
gap and scopes Démonette-2 as the fix (roadmap item 2).

Verified against the 6 real prod `definition_revele` reports, the string check catches **zero**
of them — which is exactly why they shipped.

## Decision (resolved forks)

1. **Relatedness = direct edge + ≤2 hops** in the Démonette relation graph. Data-validated:
   `délimiter → limite` is a 2-hop leak (direct-edge-only would miss it); ≤2-hop neighbourhood
   is small (median 5, mean 6, p90 12; only 0.4 % of answers exceed 30 relatives), so
   giant-family false-positive risk is negligible.
2. **Augment, not replace.** Keep the string stem-leak check as the always-on floor; add the
   Démonette check as an additional layer (`leak = string_stem_leak OR inflectional_family OR
   démonette_≤2hop`). Leak coverage (answer-lemma is a Démonette node) is **76.2 %**
   (11,459/15,030 corpus lemmas); the uncovered 24 % is dominated by underived base words
   (nothing to leak) and short crosswordese, but includes real derived words (e.g.
   `recapitaliser`) where the string check is the only backstop. Replacing would regress them.
3. **`complexite` classes:** include `simple` + `motiv-form` + `complexe` (form-related, share a
   root → genuine spelling leak); **exclude `motiv-sem`** (suppletive, e.g. `école`/`scolaire` —
   no shared letters, not a spelling reveal, and including it over-rejects legitimate semantic
   clues). `accidentel` is already dropped by the ingest. Leak-specific: the dedup/theming
   workstreams keep `motiv-sem`.
4. **Scope = derivational leaks only.** Acronym-decomposition (`NO` = nord-ouest) and
   meta-orthographic (`CA` = "Ça sans cédille") leaks are a **separate follow-up**, not this PR.

## Verification (acceptance evidence)

Prototype run: ≤2-hop graph (motiv-sem excluded) over the real corpus + prod reports, clue and
answer lemmatised via the corpus `(surface→lemma)` column (grammalecte-derived):

| Answer | Lemma | Démonette ≤2-hop | String check |
|---|---|---|---|
| FILENT | filer | ✅ DETECT `fil`→fil (hop 1) | ❌ miss |
| DELIMITERA | délimiter | ✅ DETECT `limites`→limite (hop 2) | ❌ miss |
| RECAPITALISERA | recapitaliser | ❌ miss — coverage gap (not a node) | ❌ miss |
| NO | no | ❌ miss — acronym/meta, out of scope | ❌ miss |
| CA | ca | ❌ miss — meta-orthographic, out of scope | ❌ miss |
| ANS | ans | ❌ miss — an/année suppletive+short, out of scope | ❌ miss |

Both in-scope derivational leaks are caught; every miss is an out-of-scope class or the
documented 24 % coverage gap. These 6 rows become regression fixtures.

## Architecture

Five units, each independently testable:

### 1. Leak-graph builder — `scripts/demonette/build_leak_graph.py`
Reads the ingested Démonette relations (`data/external/demonette/relations.csv`, the raw
tab-separated dump fetched by `scripts/demonette/fetch.py`) and the runtime corpus
(`words-fr.csv` `lemma` column, same lowercase-accented space as ADR-0100). Emits a compact,
corpus-scoped artifact:

- **Output:** `data/external/demonette/derived/demonette_leak.csv`, columns
  `answer_lemma, related_lemma, hop` — for every corpus answer-lemma, its ≤2-hop related lemmas
  with the hop distance (1 or 2). The filter needs only membership; `hop` is for audit triage
  (hop-1 leaks are more egregious than hop-2).
  Relatives may be **any** Démonette node (not corpus-restricted — that's what makes it 76 %,
  not the 48.7 % of the dedup artifact).
- **Filters:** drop `complexite ∈ {accidentel, motiv-sem}`; hop bound = 2 (documented build
  constant, rebuild to change).
- **Licence:** the derived artifact inherits CC BY-SA (ADR-0058 posture) → gitignored under
  `data/external/`, private tier (ADR-0097), never shipped. Sibling to the existing
  `ingest.py` outputs; reuses its corpus-loading + accidentel-drop helpers.

### 2. Leak-graph loader — `scripts/clue_generation/pipeline_v2/demonette_leak.py`
- `load_leak_graph(path) -> dict[str, frozenset[str]]` (answer_lemma → related lemmas).
- Lazy module singleton (mirrors `_get_lingua_detector`); **returns an empty graph when the
  artifact is absent**, so every consumer degrades to a no-op.
- `is_derivational_leak(clue, target_lemma, graph, index) -> str | None`: lemmatise each clue
  token via the existing `MorphologyIndex` (a token may map to several lemmas → leak if *any*
  candidate is in `graph[target_lemma]`); returns the offending token or None. Accent handling
  matches the ADR-0100 join (lowercase-accented, with a folded fallback for the answer surface).

### 3. Generation-gate wiring — `pipeline_v2/filters.py` + `run_pipeline.py`
- New `filter_11_derivational_leak(row)` (there is already a `filter_10_pleonasm`) → `reject`
  with the offending token in the trace, `accept` when the graph is empty. Appended to
  `PIPELINE_FILTERS`. Uses `row["mot"]` as the target lemma (pipeline_v2 judges at lemma form).
- The filter needs a `MorphologyIndex` to lemmatise clue tokens; `pipeline_v2` filters take only
  `row`, so `demonette_leak.py` lazy-loads its own `MorphologyIndex` singleton (as it does the
  graph). Order matters: **check graph-empty first and return `accept` before constructing the
  index** — so CI (no graph, and no grammalecte lexique either) never tries to build it.

### 4. Runtime-validator wiring — `scripts/eval/validate_clue.py`
- New flag `derivational-leak` in `validate_lemma_clue` (already receives a `MorphologyIndex`),
  ordered after the existing `_find_stem_leak`. No-op when the graph is absent.

### 5. Corpus audit — `scripts/clue_generation/audit_derivational_leaks.py`
- One-shot: runs `is_derivational_leak` over the committed `words-fr.csv`, prints
  `(word, clue, offending_token, related_lemma, hop)` for every existing leak. This is how the
  reported live leaks (FILENT, DELIMITERA, …) get **found** for correction/regeneration —
  output is a report, never auto-applied.

## Where it runs (critical constraint)

The Démonette graph is **private** (SA, ADR-0058), absent from public CI. Therefore the
Démonette check is an **offline mint-time gate** — it runs where the clue pipeline has the
private artifact (maintainer machine / corpus build), exactly like the LLM judge. **Public CI
(`pytest scripts/eval/`) stays on the string-check floor**; the empty-graph no-op keeps it green
without the 39 MB dump. This is a deliberate, documented boundary, not a gap.

## Testing

Unit tests with a tiny hand-built fixture leak-map + a `MorphologyIndex` stub (no dump in CI):
- ≤2-hop membership (hop 1 and hop 2 both fire; hop 3 does not).
- Augment union: a token the string check catches but Démonette misses still rejects, and vice
  versa.
- No-op when the graph file is absent (returns accept / None) — the CI-safety invariant.
- Multi-lemma clue token: leak if any candidate lemma is related.
- The 6 prod-report rows as fixtures (2 detect, 4 documented misses).
- `build_leak_graph.py`: motiv-sem excluded, accidentel excluded, corpus-scoped, ≤2-hop, on a
  small fixture relations table (extends `scripts/demonette/test_ingest.py` style).

## Housekeeping

- **ADR-0121** (Accepted) — the leak-detection decision, ≤2-hop + augment + motiv-sem-exclusion,
  the private leak artifact, the offline-gate boundary. Points at ADR-0119 item 2 and the
  ADR-0058 matrix (no new licence litigation — Démonette row already exists).
- `docs/adr/INDEX.md` updated in the same PR (registry-coherence gate).
- NOTICE.md / licence: already handled by ADR-0119; no change.

## Scope / PR shape

Out of scope (separate ADRs/PRs per ADR-0119): acronym & meta leaks; grid family-dedup (item 1);
clue propagation (item 3); family cooldown / theming / difficulty (items 4–6).

Likely two PRs to stay under the 400-line cap:
1. ADR-0121 (schema/policy-style, merges first) + INDEX.md.
2. Builder + loader + filter/validator wiring + audit + tests.

The reported leaks are **not** fixed by merging this — that needs an audit run + a corpus
correction/regeneration pass (tracked as the in-session follow-up), which this filter enables.
