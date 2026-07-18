# ADR-0116: Reopen a triaged report and reverse its correction

## Status

Accepted (amends ADR-0108, ADR-0110, ADR-0115)

## Context

The `/signalements` Historique tab (ADR-0115) lists already-triaged reports.
Maintainers want to **undo** a triage decision from a Historique card: put the
report back in the À traiter queue, and — when the report was actioned through
the Corriger flow — reverse the correction that was applied.

Two hard facts shape what "undo the correction" can mean:

- **A correction cannot be truly rolled back.** The backfill (ADR-0108)
  overwrites `puzzles.payload` in place with no snapshot of the prior clue;
  `forbid` deletes the clue from the payload; `blocklist` regenerates dailies
  under fresh `puzzleId`s and deletes solo rows (ADR-0110). There is no stored
  pre-image to restore. ADR-0108 already frames reversibility as
  *supersede-by-a-later-correction*, not a rollback.
- **The report is not linked to its correction by id.** No `correctionId` is
  stored on `player_reports` or passed to the survey side; the survey `action`
  decision "records handling, not a composed correctif" (ADR-0103). But the
  grid `clue_corrections` audit table (`V10`) stores `(old_clue_text,
  new_clue_text, kind)`, and a report's `clueText` **is** that `old_clue_text`
  — for `replace`/`forbid`. A `blocklist` correction carries **no**
  `old_clue_text` (`V11` drops its `NOT NULL` specifically because blocklist
  rows populate only `word_text`), so it is recoverable only by
  `kind = 'blocklist_word' AND word_text = report.wordText`. That word is
  always present for a blocklist-actioned report: the Corriger dialog
  disables the blocklist action until a word is known (a UI invariant, not a
  DB one — a future UI change or a direct API call could violate it).

Given both, "undo" is implemented as **compensating corrections**, not
restoration of destroyed grid state.

## Decision

Undoing a handled report is two coordinated actions, orchestrated by the
frontend the way `applyCorrection` already orchestrates apply (grid write, then
survey decision):

### 1. Survey — reopen the report

`POST /v1/signalements/{reportId}/undo` (contribuer-gated, mirrors the existing
ratings `POST /v1/actions/undo`). Sets `status = 'pending'` and clears
`triaged_at` / `triaged_by`; the `player_reports_pending` partial index and
`LIST_PENDING_SQL` auto-reinclude it in À traiter. A new repo method
`revertToPending(id)` performs the null-clearing write (`updateStatus` cannot,
its triage params are non-null). Idempotent; `reporter_id` is never touched, so
the RGPD posture (ADR-0103) is unchanged even for an anonymized report.

### 2. Grid — reverse the correction (per kind)

`POST /v1/corrections/reverse` `{ oldClueText, wordText? }`
(`admin:signalements`-gated, maintainer-only, matching every other grid
correction route). The lookup predicate is kind-specific, because a
`blocklist_word` row never populates `old_clue_text` (`V11`):

- **replace** / **forbid** → the **active** correction matching
  `old_clue_text = oldClueText` (optionally narrowed by folded `wordText`).
- **blocklist** → the **active** correction matching
  `kind = 'blocklist_word' AND word_text = foldedWordText` instead —
  `old_clue_text` cannot participate in this match.

and reverses per kind:

- **replace** → deactivate the original correction (same `exported_at`
  mechanism the corpus-export batch worker uses, ADR-0013) **and** record a
  compensating `replace(new → old)` correction. Deactivating the original is
  required, not optional: `CorrectionAwareWordRepository.applyAll` folds
  active corrections newest-first against the *pristine* corpus word, so a
  compensating correction left beside a still-active original can never
  fire — the original's `old_clue_text` match against the pristine word
  wins every time, and it would keep rewriting every future puzzle
  indefinitely. The compensating correction's own job is narrower: its
  backfill re-matches the grids currently showing the new clue and
  **patches them back** to the old clue. Together, the two effects reverse
  both halves of the original apply — deactivation stops future generation,
  the compensating backfill fixes already-generated grids.
- **forbid** → deactivate the forbid correction in the overlay so the clue is
  **allowed again** for future generation. Existing grids keep the clue they
  re-picked when the forbid landed — they are **not** re-patched (no stored
  pre-image; a forced re-add is out of scope).
- **blocklist** → deactivate the blocklist correction so the word is **available
  again** for future generation. Already-regenerated dailies and deleted solo
  grids are **not** restored — **no grid regeneration** on undo.
- **no matching correction** (a plain "marqué comme traité", or a dismissed
  report) → **no-op**. Undo still reopens the report; it simply touches no grid.

The asymmetry is deliberate: `replace` restores the visible grids (a forward
compensating backfill), while `forbid`/`blocklist` only lift the overlay
restriction — matching the maintainer's intent ("make the word available again,
don't regenerate").

### 3. Frontend

A **Réouvrir** action on each Historique card calls the grid reverse endpoint
then the survey undo endpoint. The grid write is durable, so a survey failure
after it surfaces a decision-only retry (same pattern as `applyCorrection` /
`SurveyDecisionFailed`).

## Consequences

**Easier**

- A mis-triaged report can be reopened, and a wrong `replace` visibly rolled
  back in the grids, without database surgery.
- Re-allowing a forbidden clue or a blocklisted word is a one-click overlay
  change.

**Harder / watch-outs**

- Undo is *compensating*, not a rollback: `forbid`/`blocklist` undo does not
  restore the grids that were changed/destroyed when the correction applied —
  only future generation is affected. This is called out in the Réouvrir
  confirmation copy.
- The lookup can match more than one active correction for the same key
  (`old_clue_text` for replace/forbid, `word_text` for blocklist); the
  reverse endpoint reverses the active matches (newest wins for the
  overlay). If this proves ambiguous in practice, a stored `correctionId`
  link is the follow-up.
- `blocklist` undo followed by daily pre-generation will reintroduce the word;
  that is the intended "available again" behaviour.

## Threat Model

The survey undo is `contribuer`-gated (ADR-0079, ADR-0103); the grid reverse is
`admin:signalements`-gated, maintainer-only (ADR-0108 §5), consistent with every
other grid correction route. Anonymous/non-maintainer callers get 403 on both.
No new PII. The survey revert does not repopulate `reporter_id` (RGPD,
ADR-0103). The grid reverse only records/deactivates corrections through the
existing audited `clue_corrections` path — no new destructive primitive.
