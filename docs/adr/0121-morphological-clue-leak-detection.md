# ADR-0121: Morphological clue-leak detection (Démonette)

## Status
Accepted

## Context
The clue leak gate is string-based (`_find_stem_leak` / `filter_9_stem_leak`:
LCP ≥ 5 or mutual substring). It misses prefix-masked and short-root
derivational leaks — a clue token sharing a *root* with the answer through
derivation, not surface spelling. Verified against the 6 prod
`definition_revele` signalements, the string check catches **zero** of them
(`FILENT` ← "…en fil", `DELIMITERA` ← "…les limites", …). ADR-0119 adopted
Démonette-2 and scoped this as roadmap item 2. This ADR is that item.

## Decision
Add a derivational-leak check using the Démonette-2 relation graph:
reject a clue when any clue token's lemma is derivationally related to the
answer's lemma within **≤2 hops**.

- **Relatedness = direct edge + ≤2 hops.** Measured: `délimiter → limite`
  is 2 hops (direct-only would miss it); ≤2-hop neighbourhoods are small
  (median 5, p90 12; 0.4 % exceed 30), so giant-family FP risk is negligible.
- **Augment, not replace.** Keep the string stem-leak as the always-on floor;
  add Démonette as a parallel layer. Leak coverage (answer-lemma is a
  Démonette node) is 76.2 %; the uncovered 24 % is dominated by underived
  base words (nothing to leak) but includes real derived words where the
  string check is the only backstop.
- **Exclude `complexite ∈ {motiv-sem, accidentel}`** from the leak graph.
  `accidentel` = false friends; `motiv-sem` = suppletive pairs
  (`école`/`scolaire`) that share no letters, so they are not spelling
  reveals and including them over-rejects legitimate semantic clues.
- **Offline mint-time gate.** The Démonette graph is private (SA, ADR-0058),
  absent from public CI, so the check runs where the clue pipeline has the
  artifact (like the LLM judge). Consumers no-op when the graph is absent;
  the string floor stays the CI gate.
- **Scope = derivational leaks only.** Acronym-decomposition (`NO` = nord-ouest)
  and meta-orthographic (`CA` = "Ça sans cédille") leaks are a separate
  follow-up.

## Alternatives rejected
- **Generic prefix-stripping** (strip `re/pré/dé/…`, check residue is valid,
  run the leak check on it): measured ≈50–60 % false-positive rate over the
  corpus — French's Latinate stratum is full of pseudo-prefixed words whose
  residue is a real but unrelated word (`répondre`≠`pondre`,
  `imposer`≠`poser`, `surface`≠`face`). The "valid residue" gate does not
  help. And it cannot close the target gap (`recapitaliser` is absent from
  Démonette, so there is no edge to confirm the strip).
- **Lemma-aware substring containment** (flag if the clue-token lemma is a
  substring of the answer, min length 6): catches `recapitaliser ⊃ capital`
  but equally flags `pardonner ⊃ donner`, `comprendre ⊃ prendre` (opaque
  false friends). It cannot separate these from the real case without a
  derivation database — discarding Démonette's core precision.

`recapitaliser → capitaux` is a documented residual miss (absent from
Démonette; the string floor misses it too). Closing it soundly means
improving Démonette coverage — a separate workstream, not a string heuristic.

## Consequences
- **Easier:** principled derivational-leak detection replacing substring luck
  where Démonette has coverage; the reported live leaks become findable via
  the audit.
- **Harder / new:** a private build artifact to regenerate on a Démonette or
  corpus bump; best-effort (76 % coverage), not a guarantee.
- **Different:** the same Démonette resource both gates clues (here) and, in
  future roadmap items, generates them (propagation).
