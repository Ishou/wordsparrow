# Clue Judge — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a learned quality judge as a *shadow-mode* pre-filter in the Modal clue lane, trained on maintainer preference pairs, with honest held-out hygiene.

**Architecture:** A logistic-regression probe over frozen CamemBERT embeddings scores `(lemma, style, clue)`. It is inserted at `filter_8` ahead of human rating; the human stays the reward signal. Phase A ships it in shadow mode (scores logged, nothing rejected) so the false-negative rate can be measured before enforcing. Companion spec: `docs/superpowers/specs/2026-06-02-clue-judge-design.md`.

**Tech Stack:** Python 3.14 (`.venv`), psycopg2, sentence-transformers (CamemBERT), scikit-learn (LogisticRegression, GroupKFold), numpy; pytest.

**Binding constraints (every task):** own git worktree; never run git ops on the main checkout; prepend `scripts/adr-context.sh <paths>` output and read ADR-0057/0058/0059 before coding; DCO `-s` sign-off; one-line comments only (no multi-line docstrings/blocks); ≤400-line diff (prefer the A3a/A3b split over cap-override); commit frequently.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `docs/adr/00NN-clue-judge.md` | Record judge design decisions + ADR-0058 matrix entry | 1 |
| `docs/adr/INDEX.md` | Register the new ADR (path → ADR map) | 1 |
| `data/lora/modal_corpus_v1/manifest.toml` | Fix `exclude_lemmas_from` path | 2 |
| `scripts/clue_generation/modal/test_build_modal_corpus.py` | Fix fixture path to mirror prod | 2 |
| `scripts/clue_generation/extract_judge_pairs.py` | Survey DB → judge pairs JSONL (read-only) | 3 |
| `scripts/clue_generation/test_extract_judge_pairs.py` | Unit tests (stubbed DB) | 3 |
| `scripts/clue_generation/judge_features.py` | Pure feature/normalize helpers (shared by trainer + eval) | 4 |
| `scripts/clue_generation/test_judge_features.py` | Unit tests | 4 |
| `scripts/clue_generation/train_judge.py` | Train probe, pick backbone, save artifact + logbook row | 4 |
| `scripts/clue_generation/eval_judge.py` | Held-out AUROC + constructed-pair accuracy | 5 |
| `scripts/clue_generation/test_eval_judge.py` | Unit tests | 5 |
| `scripts/clue_generation/pipeline_v2/judge.py` | Load artifact + `score(lemma, style, clue)` | 6 |
| `scripts/clue_generation/pipeline_v2/filters.py` | Shadow-wire `filter_8` to log judge score | 6 |
| `scripts/clue_generation/pipeline_v2/test_filters.py` | Shadow-mode test (still accepts; logs score) | 6 |

---

## Task 0: Measure the held-out ↔ judge-pair lemma overlap (GATING)

**This decides whether the linear MVP is viable. Do it before anything else.** Read-only prod query. Authorization for prod DB reads is already granted in-session; URL at `~/.bliss/survey-db-url`.

**Files:** none (investigation).

- [ ] **Step 1: Run the overlap query against the read-only standby**

The port-forward dies between Bash calls — run the forward AND the query in ONE command.

Run:
```bash
KUBECONFIG=$HOME/.kube/wordsparrow-prod kubectl -n wordsparrow port-forward svc/wordsparrow-survey-api-pg-ro 5433:5432 >/tmp/pf.log 2>&1 & PF=$!; sleep 4; .venv/bin/python - <<'PY'
import psycopg2, pathlib, json
url = pathlib.Path.home().joinpath(".bliss/survey-db-url").read_text().strip()
held = set()
with open("data/lora_filter/eval_human.jsonl", encoding="utf-8") as f:
    for line in f:
        line=line.strip()
        if line: held.add(json.loads(line)["lemma"].lower())
conn = psycopg2.connect(url); cur = conn.cursor()
# correctif pair lemmas
cur.execute("""SELECT DISTINCT lower(orig.mot) FROM ratings r
  JOIN survey_items orig ON orig.item_id=r.item_id
  JOIN survey_items prop ON prop.item_id=r.proposed_item_id
  WHERE r.proposed_item_id IS NOT NULL
    AND r.user_id IN (SELECT user_id FROM maintainer_roles WHERE role='maintainer')
    AND prop.retired_at IS NULL""")
corr = {x[0] for x in cur.fetchall()}
# pair_ratings lemmas
cur.execute("""SELECT DISTINCT lower(li.mot) FROM pair_ratings pr
  JOIN survey_items li ON li.item_id=pr.left_item_id
  WHERE pr.user_id IN (SELECT user_id FROM maintainer_roles WHERE role='maintainer')
    AND pr.verdict IN ('left_wins','right_wins')""")
pairs = {x[0] for x in cur.fetchall()}
allj = corr | pairs
print(f"held-out lemmas: {len(held)}")
print(f"judge-pair lemmas (corr {len(corr)} + pairs {len(pairs)} = union {len(allj)})")
print(f"OVERLAP (judge-pair lemmas also in held-out): {len(allj & held)}")
print(f"  -> survive exclusion: {len(allj - held)} lemmas")
conn.close()
PY
kill $PF 2>/dev/null
```

Expected output shape (numbers will differ):
```
held-out lemmas: 60
judge-pair lemmas (corr 90 + pairs 53 = union 143)
OVERLAP (judge-pair lemmas also in held-out): <N>
  -> survive exclusion: <143 − N> lemmas
```

- [ ] **Step 2: Decide based on the survivor count (the gate)**

Read the printed `survive exclusion` number and pick a branch — write the decision into the PR body, do not silently proceed:

- **≥ ~110 surviving lemmas** → the linear MVP is viable on the shared held-out set. Proceed to Task 1 unchanged.
- **~70–110** → viable but thin. Proceed, but flag in the A3 PR body that `LogisticRegression(C)` may need loosening (more regularization) and that constructed-pair eval (§6.2) carries more weight than in-sample CV.
- **< ~70** → **stop and escalate to the maintainer.** The shared held-out set eats too much training signal; the judge likely needs its *own* held-out split (carved from judge pairs, disjoint from `eval_human.jsonl`). That changes Tasks 4–5 and is a design decision, not an implementation one.

There is no code or commit for Task 0 — it is a gate. Record the three printed numbers in the A3 PR body for traceability (§11).

---

## Task 1: ADR + INDEX registration (A0)

**Files:**
- Create: `docs/adr/0062-clue-judge.md`
- Modify: `docs/adr/INDEX.md` (add the path → ADR row)

No tests — this is a docs/registry task. CI's `registry-coherence.yml` gates ADR ↔ INDEX coherence, so both files must land together.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0062-clue-judge.md`:

```markdown
# ADR-0062: Learned clue quality judge (shadow pre-filter)

## Status
Accepted

## Context
The Modal clue-generation lane (ADR-0057) has no semantic quality gate.
`filter_8_llm_juge_mock` validates enums then always accepts; the human
rater in `/contribuer` is the de-facto judge. We want to reduce human
rating load by triaging obvious-bad clues before a human looks, without
letting an automated scorer become the reward signal (which would invite
reward hacking).

## Decision
Ship a learned **judge**: a logistic-regression probe over frozen
CamemBERT embeddings scoring `(lemma, style, clue)`, trained on
maintainer preference pairs (`pair_ratings` + correctifs) already in the
survey DB. It is inserted at `filter_8` as a **pre-filter ahead of human
rating** — the human stays the reward signal; the judge never grades the
data that becomes training data.

Phase A ships in **shadow mode**: the judge scores every candidate and
the score is logged, but `filter_8` still accepts everything. Enforcement
(actually rejecting below a loose threshold) is a later flip, gated on a
measured held-out false-negative rate.

Held-out hygiene: `data/lora_filter/eval_human.jsonl` lemmas are excluded
from judge training exactly as the corpus builder excludes them from
generator training (this PR also fixes a silent path bug that defeated
that exclusion — see ADR-0058 data matrix).

## Consequences
- Easier: human rating load drops once enforcement flips; the reject pile
  becomes a measurable drift signal (Phase B).
- Harder: a stale judge can exert "conservative drag" (prune novel-but-
  good clues). Mitigated by a deliberately loose threshold and a reject-
  pile audit, not by closing the loop.
- Companion spec: `docs/superpowers/specs/2026-06-02-clue-judge-design.md`.
  Phase B (flywheel) is a separate plan.

## Data licence (ADR-0058 matrix)
No new external data source. Training pairs come from the survey DB
(maintainer-authored). CamemBERT backbone is the same one used by the
existing filter lane. No DBnary definitions enter the judge artifact.
```

- [ ] **Step 2: Register in INDEX.md**

Open `docs/adr/INDEX.md`, find the ordered ADR list, and add a row mirroring the existing format (path glob → ADR). The judge code lives under `scripts/clue_generation/`, so add `scripts/clue_generation/judge_*` / `scripts/clue_generation/*judge*` and `scripts/clue_generation/pipeline_v2/judge.py` to the path map pointing at ADR-0062. Match the exact column/format of the surrounding rows — read three neighbours first.

- [ ] **Step 3: Verify registry coherence locally**

Run: `scripts/adr-context.sh scripts/clue_generation/pipeline_v2/judge.py`
Expected: emits the ADR-0062 body (proves the path → ADR mapping resolves).

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0062-clue-judge.md docs/adr/INDEX.md
git commit -s -m "docs(adr): record clue-judge shadow pre-filter (ADR-0062)"
```

---

## Task 2: Fix the held-out exclusion path (A1)

**Files:**
- Modify: `data/lora/modal_corpus_v1/manifest.toml:15`
- Modify/Test: `scripts/clue_generation/modal/test_build_modal_corpus.py`

The bug: `manifest.toml:15` declares `exclude_lemmas_from = "data/eval/eval_human.jsonl"`, which does not exist — the real file is `data/lora_filter/eval_human.jsonl`. The builder's `_load_held_out_lemmas` returns `set()` for a missing path (silent no-op), so ~54 of 60 held-out lemmas leak into the generator corpus. The fixture writes to the same wrong path, so CI is green. **The regression guard that was missing: a test asserting the manifest's declared path actually exists.**

- [ ] **Step 1: Write the failing guard test**

Add to `scripts/clue_generation/modal/test_build_modal_corpus.py`:

```python
def test_prod_manifest_exclude_path_exists():
    """The real manifest's exclude_lemmas_from must point at a file on disk.

    A missing path makes held-out exclusion a silent no-op (held-out lemmas
    leak into the generator corpus). This guards the 2026-06-02 path bug.
    """
    import tomllib
    repo_root = Path(__file__).resolve().parents[3]
    manifest = tomllib.loads(
        (repo_root / "data" / "lora" / "modal_corpus_v1" / "manifest.toml").read_text(encoding="utf-8")
    )
    rel = manifest["exclude_lemmas_from"]
    assert (repo_root / rel).exists(), f"exclude_lemmas_from points at a missing file: {rel}"
```

- [ ] **Step 2: Run it to confirm it fails on the current path**

Run: `.venv/bin/pytest scripts/clue_generation/modal/test_build_modal_corpus.py::test_prod_manifest_exclude_path_exists -v`
Expected: FAIL — `exclude_lemmas_from points at a missing file: data/eval/eval_human.jsonl`

- [ ] **Step 3: Fix the manifest path**

In `data/lora/modal_corpus_v1/manifest.toml`, line 15:

```toml
exclude_lemmas_from = "data/lora_filter/eval_human.jsonl"
```

- [ ] **Step 4: Make the fixture mirror prod**

The fixture currently writes the held-out file to `data/eval/eval_human.jsonl`. Change both the write path and the fixture manifest's `exclude_lemmas_from` to `data/lora_filter/eval_human.jsonl` so the test tree mirrors prod layout. In `scripts/clue_generation/modal/test_build_modal_corpus.py`:

```python
    # Held-out set: 1 lemma to exclude. Mirror the prod path (data/lora_filter/).
    (root / "data" / "lora_filter").mkdir(parents=True, exist_ok=True)
    (root / "data" / "lora_filter" / "eval_human.jsonl").write_text(
        '{"lemma": "POMME"}\n',
        encoding="utf-8",
    )
```

And in the fixture manifest string, change:

```toml
exclude_lemmas_from = "data/lora_filter/eval_human.jsonl"
```

- [ ] **Step 5: Run the whole module to confirm all green**

Run: `.venv/bin/pytest scripts/clue_generation/modal/test_build_modal_corpus.py -v`
Expected: PASS — including `test_prod_manifest_exclude_path_exists`, `test_excludes_held_out_lemmas`, and `test_rebuild_is_byte_identical`.

- [ ] **Step 6: Commit (flag the corpus bump in the body)**

```bash
git add data/lora/modal_corpus_v1/manifest.toml scripts/clue_generation/modal/test_build_modal_corpus.py
git commit -s -m "$(cat <<'EOF'
fix(clue-corpus): point held-out exclusion at the real eval_human path

manifest exclude_lemmas_from pointed at a non-existent data/eval/ path,
making held-out exclusion a silent no-op. ~54 held-out lemmas were
leaking into the generator corpus. Adds a guard test that the declared
path exists. By design this changes the corpus contents → next build
bumps modal_corpus_v1 → v2 and the next round must retrain.
EOF
)"
```

---

## Task 3: Judge-pair extractor (A2)

**Files:**
- Create: `scripts/clue_generation/extract_judge_pairs.py`
- Test: `scripts/clue_generation/test_extract_judge_pairs.py`

Read-only survey DB → JSONL of pointwise-labeled candidates. Mirrors `extract_winners.py`'s DB-URL loader and SQLite-shim test pattern. **Unlike** `extract_winners.py`, the judge extractor is **cumulative** (no campaign gate, no `-r<N>-` scope) and **excludes `eval_human.jsonl` lemmas** (held-out hygiene, spec §4 Fix 2). Output row schema:

```json
{"lemma": "couper", "style": "definition_directe", "clue": "Trancher net", "label": 1, "source": "pair_ratings", "verdict": "left_wins", "campaign_id": "…"}
```

`pair_ratings` verdict → labels: `left_wins`→left=1/right=0; `right_wins`→left=0/right=1; `both_good`→both=1; `both_bad`→both=0. Correctifs: proposed (human rewrite)=1, original (model)=0; drop pairs equal after normalization (punctuation/case-only edits).

- [ ] **Step 1: Write the failing test (label expansion + held-out exclusion + trivial-edit drop)**

Create `scripts/clue_generation/test_extract_judge_pairs.py`:

```python
"""Tests for extract_judge_pairs — pure label-expansion + exclusion logic."""

from __future__ import annotations

from . import extract_judge_pairs as ej


HELD_OUT = {"gamma"}  # lower-cased held-out lemma


def test_pair_verdict_left_wins_labels_left_one_right_zero():
    rows = list(ej.expand_pair_rows(
        [("couper", "definition_directe", "Trancher net",
          "couper", "definition_directe", "Action de couper",
          "left_wins", "camp-1")],
        held_out=set(),
    ))
    assert {(r["clue"], r["label"]) for r in rows} == {
        ("Trancher net", 1), ("Action de couper", 0),
    }
    assert all(r["lemma"] == "couper" and r["source"] == "pair_ratings" for r in rows)


def test_pair_verdict_both_good_labels_both_one():
    rows = list(ej.expand_pair_rows(
        [("nez", "metaphore", "Organe de l'odorat",
          "nez", "definition_directe", "Appendice facial",
          "both_good", "camp-1")],
        held_out=set(),
    ))
    assert sorted(r["label"] for r in rows) == [1, 1]


def test_pair_verdict_both_bad_labels_both_zero():
    rows = list(ej.expand_pair_rows(
        [("nez", "metaphore", "Truc", "nez", "definition_directe", "Machin",
          "both_bad", "camp-1")],
        held_out=set(),
    ))
    assert sorted(r["label"] for r in rows) == [0, 0]


def test_pair_held_out_lemma_excluded():
    rows = list(ej.expand_pair_rows(
        [("gamma", "definition_directe", "Rayon", "gamma", "metaphore", "Lettre",
          "left_wins", "camp-1")],
        held_out=HELD_OUT,
    ))
    assert rows == []


def test_correctif_proposed_is_chosen_original_is_rejected():
    rows = list(ej.expand_correctif_rows(
        [("couper", "definition_directe", "Action de couper",
          "Trancher net", "definition_directe", "camp-2")],
        held_out=set(),
    ))
    assert {(r["clue"], r["label"]) for r in rows} == {
        ("Trancher net", 1), ("Action de couper", 0),
    }
    assert all(r["source"] == "correctif" for r in rows)


def test_correctif_trivial_edit_dropped():
    # Only punctuation/case differs → not a real preference signal.
    rows = list(ej.expand_correctif_rows(
        [("couper", "definition_directe", "Trancher net",
          "Trancher net.", "definition_directe", "camp-2")],
        held_out=set(),
    ))
    assert rows == []
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest scripts/clue_generation/test_extract_judge_pairs.py -v`
Expected: FAIL — `module 'extract_judge_pairs' has no attribute 'expand_pair_rows'`

- [ ] **Step 3: Implement the extractor**

Create `scripts/clue_generation/extract_judge_pairs.py`:

```python
"""Survey DB → judge training pairs JSONL (read-only, cumulative, held-out-excluded)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata
from pathlib import Path
from typing import Any, Iterable, Iterator


# Cumulative across all campaigns; carries campaign_id for recency-weighting (spec §3).
PAIRS_SQL = """
SELECT li.mot, li.style, li.definition,
       ri.mot, ri.style, ri.definition,
       pr.verdict, pr.campaign_id
  FROM pair_ratings pr
  JOIN survey_items li ON li.item_id = pr.left_item_id
  JOIN survey_items ri ON ri.item_id = pr.right_item_id
 WHERE pr.user_id IN (SELECT user_id FROM maintainer_roles WHERE role = 'maintainer')
   AND pr.verdict IN ('left_wins', 'right_wins', 'both_good', 'both_bad')
   AND li.retired_at IS NULL AND ri.retired_at IS NULL
"""

CORRECTIFS_SQL = """
SELECT orig.mot, orig.style, orig.definition,
       prop.definition, prop.style, r.campaign_id
  FROM ratings r
  JOIN survey_items orig ON orig.item_id = r.item_id
  JOIN survey_items prop ON prop.item_id = r.proposed_item_id
 WHERE r.proposed_item_id IS NOT NULL
   AND r.user_id IN (SELECT user_id FROM maintainer_roles WHERE role = 'maintainer')
   AND orig.retired_at IS NULL AND prop.retired_at IS NULL
"""


def _norm(s: str) -> str:
    """Lower, strip accents + non-alphanumerics — for trivial-edit detection only."""
    nfd = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in nfd if c.isalnum())


def expand_pair_rows(rows: Iterable[tuple], held_out: set[str]) -> Iterator[dict]:
    """One labeled candidate per side, per the pair verdict. Drops held-out lemmas."""
    for left_mot, left_style, left_def, right_mot, right_style, right_def, verdict, camp in rows:
        if left_mot.lower() in held_out or right_mot.lower() in held_out:
            continue
        if verdict == "left_wins":
            labels = (1, 0)
        elif verdict == "right_wins":
            labels = (0, 1)
        elif verdict == "both_good":
            labels = (1, 1)
        elif verdict == "both_bad":
            labels = (0, 0)
        else:
            continue
        yield _row(left_mot, left_style, left_def, labels[0], "pair_ratings", verdict, camp)
        yield _row(right_mot, right_style, right_def, labels[1], "pair_ratings", verdict, camp)


def expand_correctif_rows(rows: Iterable[tuple], held_out: set[str]) -> Iterator[dict]:
    """Proposed (human) = chosen, original (model) = rejected. Drops trivial + held-out."""
    for orig_mot, orig_style, orig_def, prop_def, prop_style, camp in rows:
        if orig_mot.lower() in held_out:
            continue
        if _norm(orig_def) == _norm(prop_def):
            continue
        yield _row(orig_mot, prop_style or orig_style, prop_def, 1, "correctif", "correctif", camp)
        yield _row(orig_mot, orig_style, orig_def, 0, "correctif", "correctif", camp)


def _row(lemma: str, style: str, clue: str, label: int, source: str, verdict: str, camp: Any) -> dict:
    """Assemble one output record; campaign_id stringified for JSON."""
    return {
        "lemma": lemma,
        "style": style or "",
        "clue": clue.strip(),
        "label": label,
        "source": source,
        "verdict": verdict,
        "campaign_id": str(camp) if camp is not None else None,
    }


def _load_db_url() -> str:
    """Resolve SURVEY_DB_URL from env, else ~/.bliss/survey-db-url (read-only creds)."""
    env = os.environ.get("SURVEY_DB_URL", "").strip()
    if env:
        return env
    fallback = Path.home() / ".bliss" / "survey-db-url"
    if fallback.is_file():
        text = fallback.read_text(encoding="utf-8").strip()
        if text:
            return text
    raise SystemExit(
        "ERROR: no DB URL — set SURVEY_DB_URL or write a libpq URL to "
        "~/.bliss/survey-db-url (read-only credentials only)."
    )


def _load_held_out(path: Path) -> set[str]:
    """Lower-cased lemma set from the held-out JSONL (the judge must not train on these)."""
    out: set[str] = set()
    if not path.is_file():
        raise SystemExit(f"ERROR: held-out file not found: {path}")
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.add(json.loads(line)["lemma"].lower())
    return out


def fetch(conn: Any, sql: str) -> list[tuple]:
    """Run a read-only query and return all rows."""
    with conn.cursor() as cur:
        cur.execute(sql, ())
        return list(cur.fetchall())


def run(conn: Any, held_out: set[str], out_path: Path) -> dict:
    """Extract both sources, exclude held-out, write JSONL. Returns counts."""
    records = list(expand_pair_rows(fetch(conn, PAIRS_SQL), held_out))
    records += list(expand_correctif_rows(fetch(conn, CORRECTIFS_SQL), held_out))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    lemmas = {r["lemma"].lower() for r in records}
    counts = {"records": len(records), "lemmas": len(lemmas),
              "pair_ratings": sum(r["source"] == "pair_ratings" for r in records),
              "correctif": sum(r["source"] == "correctif" for r in records)}
    print(f"wrote {out_path}: {counts}", file=sys.stderr)
    return counts


def _connect(db_url: str) -> Any:
    """Open psycopg2 connection; lazy import so tests can stub."""
    import psycopg2
    return psycopg2.connect(db_url)


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True,
                        help="Output JSONL (e.g. data/lora_filter/judge_pairs.jsonl).")
    parser.add_argument("--held-out", type=Path,
                        default=Path("data/lora_filter/eval_human.jsonl"))
    args = parser.parse_args(argv)
    held_out = _load_held_out(args.held_out)
    conn = _connect(_load_db_url())
    try:
        run(conn, held_out, args.out)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest scripts/clue_generation/test_extract_judge_pairs.py -v`
Expected: PASS (all six tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/clue_generation/extract_judge_pairs.py scripts/clue_generation/test_extract_judge_pairs.py
git commit -s -m "feat(clue-judge): extract maintainer preference pairs (read-only)"
```

---

## Task 4: Feature helpers + trainer (A3a)

**Files:**
- Create: `scripts/clue_generation/judge_features.py`
- Test: `scripts/clue_generation/test_judge_features.py`
- Create: `scripts/clue_generation/train_judge.py`

`judge_features.py` is pure (no model): clue normalization, style one-hot, and feature assembly `[emb(clue), emb(clue) − emb(lemma), style_onehot]` (spike recipe extended with style, spec §5). `train_judge.py` does the model-touching parts (embed, GroupKFold CV, backbone compare, artifact save). Only the pure assembly + the probe-training core get unit tests; the embedding + backbone selection is exercised by the A4 feature-correctness run (spec §7).

- [ ] **Step 1: Write the failing feature test**

Create `scripts/clue_generation/test_judge_features.py`:

```python
"""Tests for judge_features — pure assembly, no model."""

from __future__ import annotations

import numpy as np

from . import judge_features as jf


def test_style_onehot_known_style():
    styles = ["definition_directe", "metaphore", "jeu_de_mots"]
    vec = jf.style_onehot("metaphore", styles)
    assert vec.tolist() == [0.0, 1.0, 0.0]


def test_style_onehot_unknown_style_is_all_zero():
    styles = ["definition_directe", "metaphore"]
    vec = jf.style_onehot("inconnu", styles)
    assert vec.tolist() == [0.0, 0.0]


def test_feature_vector_concatenates_clue_diff_and_style():
    emb_clue = np.array([1.0, 2.0])
    emb_lemma = np.array([0.5, 0.5])
    style_vec = np.array([1.0, 0.0])
    feat = jf.feature_vector(emb_clue, emb_lemma, style_vec)
    # [clue(2), clue-lemma(2), style(2)] = 6 dims
    assert feat.tolist() == [1.0, 2.0, 0.5, 1.5, 1.0, 0.0]


def test_normalize_clue_collapses_whitespace():
    assert jf.normalize_clue("  Trancher   net ") == "Trancher net"
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest scripts/clue_generation/test_judge_features.py -v`
Expected: FAIL — `No module named '...judge_features'`

- [ ] **Step 3: Implement the pure helpers**

Create `scripts/clue_generation/judge_features.py`:

```python
"""Pure feature helpers for the clue judge (shared by trainer + eval; no model)."""

from __future__ import annotations

import numpy as np


def normalize_clue(s: str) -> str:
    """Strip and collapse internal whitespace."""
    return " ".join(s.split())


def style_onehot(style: str, styles: list[str]) -> np.ndarray:
    """One-hot a style against a fixed ordered vocabulary; unknown → all-zero."""
    vec = np.zeros(len(styles), dtype=float)
    if style in styles:
        vec[styles.index(style)] = 1.0
    return vec


def feature_vector(emb_clue: np.ndarray, emb_lemma: np.ndarray, style_vec: np.ndarray) -> np.ndarray:
    """Spike recipe + style: [emb(clue), emb(clue) − emb(lemma), style_onehot]."""
    return np.concatenate([emb_clue, emb_clue - emb_lemma, style_vec])
```

- [ ] **Step 4: Run to verify the feature tests pass**

Run: `.venv/bin/pytest scripts/clue_generation/test_judge_features.py -v`
Expected: PASS (all four).

- [ ] **Step 5: Write the failing probe-training test**

Append to `scripts/clue_generation/test_judge_features.py` (the probe core is pure given vectors, so it lives behind a thin function in `train_judge`):

```python
def test_train_probe_separates_linearly_separable_labels():
    from . import train_judge as tj
    rng = np.random.default_rng(0)
    # Two clusters, lemma-grouped so GroupKFold has ≥2 groups per fold.
    X = np.vstack([rng.normal(+2, 0.1, (10, 4)), rng.normal(-2, 0.1, (10, 4))])
    y = np.array([1] * 10 + [0] * 10)
    groups = np.array(list(range(5)) * 2 + list(range(5, 10)) * 2)
    clf, auroc = tj.train_probe(X, y, groups, C=0.05)
    assert auroc > 0.9
    assert clf.predict(X[:1]).shape == (1,)
```

- [ ] **Step 6: Run to verify it fails**

Run: `.venv/bin/pytest scripts/clue_generation/test_judge_features.py::test_train_probe_separates_linearly_separable_labels -v`
Expected: FAIL — `No module named '...train_judge'`

- [ ] **Step 7: Implement the trainer**

Create `scripts/clue_generation/train_judge.py`:

```python
"""Train the clue-judge probe: embed pairs, GroupKFold CV, pick backbone, save artifact."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

from . import judge_features as jf

BACKBONES = {
    "camembert-base": "camembert-base",
    "filter-camembert-v5": "models/filter-camembert-v5",
}


def train_probe(X: np.ndarray, y: np.ndarray, groups: np.ndarray,
                C: float = 0.05) -> tuple[LogisticRegression, float]:
    """Lemma-grouped CV AUROC, then fit on all data. Returns (fitted clf, mean CV AUROC)."""
    n_groups = len(set(groups.tolist()))
    n_splits = min(5, n_groups)
    gkf = GroupKFold(n_splits=n_splits)
    aurocs: list[float] = []
    for train_idx, test_idx in gkf.split(X, y, groups):
        clf = LogisticRegression(C=C, max_iter=1000)
        clf.fit(X[train_idx], y[train_idx])
        scores = clf.decision_function(X[test_idx])
        if len(set(y[test_idx].tolist())) > 1:
            aurocs.append(roc_auc_score(y[test_idx], scores))
    final = LogisticRegression(C=C, max_iter=1000).fit(X, y)
    return final, (float(np.mean(aurocs)) if aurocs else float("nan"))


def _embed(model: Any, texts: list[str]) -> np.ndarray:
    """Encode texts → ndarray; isolated so it can be swapped/mocked."""
    return np.asarray(model.encode(texts, show_progress_bar=False))


def _build_matrix(model: Any, records: list[dict], styles: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Embed clues + lemmas, assemble feature matrix X, labels y, group ids."""
    clues = [jf.normalize_clue(r["clue"]) for r in records]
    lemmas = [r["lemma"] for r in records]
    emb_c = _embed(model, clues)
    emb_l = _embed(model, lemmas)
    X = np.vstack([
        jf.feature_vector(emb_c[i], emb_l[i], jf.style_onehot(records[i]["style"], styles))
        for i in range(len(records))
    ])
    y = np.array([r["label"] for r in records])
    lemma_ids = {lem: i for i, lem in enumerate(sorted(set(lemmas)))}
    groups = np.array([lemma_ids[r["lemma"]] for r in records])
    return X, y, groups


def _load_records(path: Path) -> list[dict]:
    """Read the extractor JSONL."""
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def main(argv: list[str] | None = None) -> int:
    """CLI: train on judge pairs, compare backbones, save the best artifact + logbook row."""
    from sentence_transformers import SentenceTransformer

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pairs", type=Path, default=Path("data/lora_filter/judge_pairs.jsonl"))
    parser.add_argument("--out-dir", type=Path, default=Path("models/clue-judge-v1"))
    parser.add_argument("--C", type=float, default=0.05)
    args = parser.parse_args(argv)

    records = _load_records(args.pairs)
    styles = sorted({r["style"] for r in records if r["style"]})

    best = None
    for name, ref in BACKBONES.items():
        if not (ref == "camembert-base" or Path(ref).exists()):
            print(f"skip backbone {name}: {ref} not present", file=sys.stderr)
            continue
        model = SentenceTransformer(ref)
        X, y, groups = _build_matrix(model, records, styles)
        clf, auroc = train_probe(X, y, groups, C=args.C)
        print(f"backbone {name}: CV AUROC {auroc:.3f}", file=sys.stderr)
        if best is None or auroc > best[1]:
            best = (name, auroc, clf)

    if best is None:
        raise SystemExit("ERROR: no backbone available to train.")

    name, auroc, clf = best
    args.out_dir.mkdir(parents=True, exist_ok=True)
    import joblib
    joblib.dump(clf, args.out_dir / "probe.joblib")
    (args.out_dir / "metadata.json").write_text(json.dumps({
        "backbone": name, "backbone_ref": BACKBONES[name],
        "styles": styles, "C": args.C,
        "cv_auroc": auroc, "n_records": len(records),
        "n_lemmas": len({r["lemma"] for r in records}),
        "trained_on": date.today().isoformat(),
        "held_out_set": "data/lora_filter/eval_human.jsonl",
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved judge: backbone={name} cv_auroc={auroc:.3f} → {args.out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 8: Run the probe test to verify it passes**

Run: `.venv/bin/pytest scripts/clue_generation/test_judge_features.py -v`
Expected: PASS (all five, including the probe-training test).

- [ ] **Step 9: Commit**

```bash
git add scripts/clue_generation/judge_features.py scripts/clue_generation/test_judge_features.py scripts/clue_generation/train_judge.py
git commit -s -m "feat(clue-judge): feature helpers + GroupKFold probe trainer"
```

---

## Task 5: Held-out evaluation (A3b)

**Files:**
- Create: `scripts/clue_generation/eval_judge.py`
- Test: `scripts/clue_generation/test_eval_judge.py`

Two offline measurements against `data/lora_filter/eval_human.jsonl` (spec §6): (1) pointwise AUROC over `RATING_RANK` (y=2/b=1/n=0, good = y), and (2) constructed same-lemma (y > n) pair accuracy. **Per-tier GOOD-rate is NOT here — that is an online Phase-B metric.** The pure functions (AUROC, pair construction, paired accuracy) are unit-tested; scoring the file is a CLI run.

- [ ] **Step 1: Write the failing test**

Create `scripts/clue_generation/test_eval_judge.py`:

```python
"""Tests for eval_judge — pure metric + pair-construction logic."""

from __future__ import annotations

from . import eval_judge as ev


def test_construct_same_lemma_y_gt_n_pairs():
    rows = [
        {"lemma": "couper", "candidate": "Trancher net", "rating": "y"},
        {"lemma": "couper", "candidate": "Action de couper", "rating": "n"},
        {"lemma": "gamma", "candidate": "Rayon", "rating": "n"},
        {"lemma": "gamma", "candidate": "Lettre grecque", "rating": "y"},
    ]
    pairs = ev.construct_pairs(rows)
    # One (y, n) pair per lemma that has both.
    assert ("Trancher net", "Action de couper") in pairs
    assert ("Lettre grecque", "Rayon") in pairs
    assert len(pairs) == 2


def test_construct_skips_lemma_without_both_classes():
    rows = [
        {"lemma": "x", "candidate": "a", "rating": "y"},
        {"lemma": "x", "candidate": "b", "rating": "y"},
    ]
    assert ev.construct_pairs(rows) == []


def test_paired_accuracy_counts_correct_orderings():
    pairs = [("good1", "bad1"), ("good2", "bad2")]
    scores = {"good1": 0.9, "bad1": 0.2, "good2": 0.4, "bad2": 0.6}  # 2nd is wrong
    assert ev.paired_accuracy(pairs, scores) == 0.5


def test_auroc_perfect_ranking_is_one():
    scores = [0.1, 0.4, 0.35, 0.8]
    labels = [0, 0, 1, 1]
    assert ev.auroc(scores, labels) == 1.0
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest scripts/clue_generation/test_eval_judge.py -v`
Expected: FAIL — `No module named '...eval_judge'`

- [ ] **Step 3: Implement eval**

Create `scripts/clue_generation/eval_judge.py`:

```python
"""Offline judge eval: held-out pointwise AUROC + constructed (y>n) paired accuracy (spec §6)."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from sklearn.metrics import roc_auc_score

RATING_RANK = {"y": 2, "b": 1, "n": 0}


def auroc(scores: list[float], labels: list[int]) -> float:
    """AUROC of good(=1) vs not-good(=0); thin wrapper for testability."""
    return float(roc_auc_score(labels, scores))


def construct_pairs(rows: list[dict]) -> list[tuple[str, str]]:
    """Per lemma, build (y-candidate, n-candidate) ordered pairs from absolute ratings."""
    by_lemma: dict[str, dict[str, list[str]]] = defaultdict(lambda: {"y": [], "n": []})
    for r in rows:
        if r["rating"] in ("y", "n"):
            by_lemma[r["lemma"]][r["rating"]].append(r["candidate"])
    pairs: list[tuple[str, str]] = []
    for buckets in by_lemma.values():
        for good in buckets["y"]:
            for bad in buckets["n"]:
                pairs.append((good, bad))
    return pairs


def paired_accuracy(pairs: list[tuple[str, str]], scores: dict[str, float]) -> float:
    """Fraction of (good, bad) pairs the judge orders correctly (good scored strictly higher)."""
    if not pairs:
        return float("nan")
    correct = sum(1 for good, bad in pairs if scores[good] > scores[bad])
    return correct / len(pairs)


def _load_rows(path: Path) -> list[dict]:
    """Read the held-out JSONL."""
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def main(argv: list[str] | None = None) -> int:
    """CLI: load the judge artifact, score the held-out set, print AUROC + paired accuracy."""
    from .pipeline_v2.judge import Judge

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--judge-dir", type=Path, default=Path("models/clue-judge-v1"))
    parser.add_argument("--held-out", type=Path, default=Path("data/lora_filter/eval_human.jsonl"))
    args = parser.parse_args(argv)

    rows = _load_rows(args.held_out)
    judge = Judge.load(args.judge_dir)
    # eval_human has no style column → score with empty style (style-blind on held-out).
    scores = {r["candidate"]: judge.score(r["lemma"], r.get("style", ""), r["candidate"]) for r in rows}

    labels = [1 if r["rating"] == "y" else 0 for r in rows]
    score_list = [scores[r["candidate"]] for r in rows]
    a = auroc(score_list, labels)
    pa = paired_accuracy(construct_pairs(rows), scores)
    print(f"held-out AUROC (y vs not-y): {a:.3f}", file=sys.stderr)
    print(f"constructed (y>n) paired accuracy: {pa:.3f}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest scripts/clue_generation/test_eval_judge.py -v`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add scripts/clue_generation/eval_judge.py scripts/clue_generation/test_eval_judge.py
git commit -s -m "feat(clue-judge): held-out AUROC + constructed-pair eval"
```

---

## Task 6: Load the judge + shadow-wire filter_8 (A4)

**Files:**
- Create: `scripts/clue_generation/pipeline_v2/judge.py`
- Modify: `scripts/clue_generation/pipeline_v2/filters.py` (`filter_8`)
- Modify: `scripts/clue_generation/pipeline_v2/run_pipeline.py:58` (dispatch the shadow filter)
- Test: `scripts/clue_generation/pipeline_v2/test_filters.py`

`judge.py` loads the artifact and exposes `score(lemma, style, clue) → float`. `filter_8` runs in **shadow mode**: it keeps the existing enum validation (still rejects invalid enums), and when a judge is injected it attaches `row["judge_score"]` but **always returns `accept`** on the score — nothing is rejected (spec §7). The dispatch passes `judge=None` by default so prod behavior is unchanged until an artifact is wired; tests inject a fake judge.

- [ ] **Step 1: Write the failing shadow-mode test**

Add to `scripts/clue_generation/pipeline_v2/test_filters.py`:

```python
class _FakeJudge:
    def score(self, lemma, style, clue):
        return 0.05  # low score — would be rejected under enforcement, accepted in shadow


def test_filter_8_shadow_attaches_score_and_still_accepts():
    r = _row("POMME", "Tentation d’Ève")
    out = F.filter_8_judge_shadow(
        r,
        valid_pos={"nom_commun"}, valid_categories={"autre"},
        valid_styles={"definition_directe"},
        judge=_FakeJudge(),
    )
    assert out.action == "accept", out.reason
    assert r["judge_score"] == 0.05


def test_filter_8_shadow_without_judge_accepts_and_sets_no_score():
    r = _row("POMME", "Tentation d’Ève")
    out = F.filter_8_judge_shadow(
        r,
        valid_pos={"nom_commun"}, valid_categories={"autre"},
        valid_styles={"definition_directe"},
        judge=None,
    )
    assert out.action == "accept", out.reason
    assert "judge_score" not in r


def test_filter_8_shadow_still_rejects_invalid_enum():
    r = _row("POMME", "Tentation d’Ève", style="inconnu")
    out = F.filter_8_judge_shadow(
        r,
        valid_pos={"nom_commun"}, valid_categories={"autre"},
        valid_styles={"definition_directe"},
        judge=_FakeJudge(),
    )
    assert out.action == "reject"
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest scripts/clue_generation/pipeline_v2/test_filters.py -k filter_8_shadow -v`
Expected: FAIL — `module 'filters' has no attribute 'filter_8_judge_shadow'`

- [ ] **Step 3: Implement the judge loader**

Create `scripts/clue_generation/pipeline_v2/judge.py`:

```python
"""Load the clue-judge artifact and score (lemma, style, clue). Shadow-mode scorer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from .. import judge_features as jf


class Judge:
    """A frozen backbone + linear probe; scores a single (lemma, style, clue)."""

    def __init__(self, probe: Any, backbone: Any, styles: list[str]) -> None:
        self._probe = probe
        self._backbone = backbone
        self._styles = styles

    @classmethod
    def load(cls, artifact_dir: Path) -> "Judge":
        """Load probe.joblib + metadata.json + the referenced sentence-transformer backbone."""
        import joblib
        from sentence_transformers import SentenceTransformer

        meta = json.loads((artifact_dir / "metadata.json").read_text(encoding="utf-8"))
        # trusted in-repo artifact (our own train_judge output), not untrusted input
        probe = joblib.load(artifact_dir / "probe.joblib")
        backbone = SentenceTransformer(meta["backbone_ref"])
        return cls(probe, backbone, meta["styles"])

    def score(self, lemma: str, style: str, clue: str) -> float:
        """Probability-like judge score in [0, 1] (higher = better clue)."""
        emb = self._backbone.encode([jf.normalize_clue(clue), lemma], show_progress_bar=False)
        feat = jf.feature_vector(np.asarray(emb[0]), np.asarray(emb[1]),
                                 jf.style_onehot(style, self._styles))
        return float(self._probe.predict_proba(feat.reshape(1, -1))[0, 1])
```

- [ ] **Step 4: Implement the shadow filter**

In `scripts/clue_generation/pipeline_v2/filters.py`, add a new function (keep `filter_8_llm_juge_mock` for now; the dispatch swap is Step 5):

```python
def filter_8_judge_shadow(row: dict, valid_pos: set[str],
                          valid_categories: set[str],
                          valid_styles: set[str],
                          judge=None) -> FilterResult:
    """Filtre 8 : juge appris en MODE SHADOW — score loggé, jamais de rejet sur le score."""
    enum_check = filter_8_llm_juge_mock(row, valid_pos, valid_categories, valid_styles)
    if enum_check.is_reject:
        return enum_check
    if judge is not None:
        row["judge_score"] = judge.score(row["mot"], row.get("style", ""), row["definition"])
    return FilterResult("accept")
```

- [ ] **Step 5: Swap the dispatch to the shadow filter**

In `scripts/clue_generation/pipeline_v2/run_pipeline.py`, line 58, change the registered filter from the mock to the shadow wrapper. The pipeline injects no judge yet (artifact ships separately), so default `judge=None` keeps prod behavior identical:

```python
    ("filter_8_judge_shadow", F.filter_8_judge_shadow, True),
```

(If `run_pipeline.py` calls the filter positionally with the three enum sets, `judge` defaults to `None` and nothing else changes. If you wire a real judge later, pass it via a module-level loader — out of scope for shadow.)

- [ ] **Step 6: Run the filter tests to verify they pass**

Run: `.venv/bin/pytest scripts/clue_generation/pipeline_v2/test_filters.py -v`
Expected: PASS (the three new shadow tests plus the existing filter tests).

- [ ] **Step 7: Feature-correctness check (spec §7 — not just unit tests)**

This step runs only after a real judge artifact exists (Task 4 executed against real pairs). Confirm good clues score high / bad score low on a handful of known lemmas:

```bash
.venv/bin/python - <<'PY'
from pathlib import Path
from scripts.clue_generation.pipeline_v2.judge import Judge
j = Judge.load(Path("models/clue-judge-v1"))
samples = [
    ("couper", "definition_directe", "Trancher net"),       # good → expect high
    ("couper", "definition_directe", "Action de couper"),   # stem-leak bad → expect low
    ("gamma",  "definition_directe", "Lettre grecque"),     # good → expect high
    ("gamma",  "definition_directe", "Rayon de lumière"),   # wrong-sense bad → expect low
]
for lemma, style, clue in samples:
    print(f"{j.score(lemma, style, clue):.3f}  {lemma:8s} | {clue}")
PY
```

Expected: the two "good" rows score visibly higher than the two "bad" rows. If they don't, the feature wiring or backbone choice is wrong — do **not** ship; revisit Task 4. (If no artifact exists yet, skip this step and note it in the PR body — shadow mode ships the wiring; the artifact lands when overlap from Task 0 confirms viability.)

- [ ] **Step 8: Commit**

```bash
git add scripts/clue_generation/pipeline_v2/judge.py scripts/clue_generation/pipeline_v2/filters.py scripts/clue_generation/pipeline_v2/run_pipeline.py scripts/clue_generation/pipeline_v2/test_filters.py
git commit -s -m "feat(clue-judge): shadow-wire filter_8 to log judge score"
```

---

## Final verification

- [ ] Run the full judge test surface:

```bash
.venv/bin/pytest scripts/clue_generation/test_extract_judge_pairs.py \
  scripts/clue_generation/test_judge_features.py \
  scripts/clue_generation/test_eval_judge.py \
  scripts/clue_generation/pipeline_v2/test_filters.py \
  scripts/clue_generation/modal/test_build_modal_corpus.py -v
```

Expected: all green.

- [ ] Confirm each PR is ≤400 lines of diff (prefer the A3a/A3b split over a cap-override). Map: A0=Task 1, A1=Task 2, A2=Task 3, A3a=Task 4, A3b=Task 5, A4=Task 6.

- [ ] Append a judge eval row to `docs/eval/clue-gen-v0.md` (or a new judge logbook): backbone choice, pair-extraction date + campaign range, held-out set hash, CV AUROC, held-out AUROC, constructed-pair accuracy (spec §11).