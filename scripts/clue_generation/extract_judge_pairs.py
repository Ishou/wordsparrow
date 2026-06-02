"""Survey DB → judge training pairs JSONL (read-only, cumulative, held-out-excluded)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata
from pathlib import Path
from typing import Any, Iterable, Iterator


# Cumulative across all campaigns; carries campaign_id for recency-weighting.
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
