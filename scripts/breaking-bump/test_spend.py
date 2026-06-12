"""Unit tests for spend — rendering per-stage cost (USD) lines for the spine issue."""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import spend  # noqa: E402

# Mirror of claude-code-action@v1's execution_file: a JSON array whose
# type=="result" entry carries total_cost_usd (verified against the action's
# test/fixtures/sample-turns.json — total_cost_usd: 0.0347, no usage field).
RESULT_LOG = [
    {"type": "assistant", "message": {"usage": {"input_tokens": 1200, "output_tokens": 340}}},
    {"type": "result", "total_cost_usd": 0.0347, "duration_ms": 4210},
]


def test_format_spend_reports_cost(tmp_path):
    f = tmp_path / "execution.json"
    f.write_text(json.dumps(RESULT_LOG), encoding="utf-8")
    line = spend.format_spend("agent-a", str(f))
    assert line == "breaking-bump spend · agent-a: $0.0347"


def test_format_spend_none_path_is_unavailable():
    # STUB runs produce no execution_file → must degrade, not crash.
    line = spend.format_spend("agent-d", None)
    assert line == "breaking-bump spend · agent-d: cost unavailable"


def test_format_spend_missing_file_is_unavailable(tmp_path):
    line = spend.format_spend("c_round2", str(tmp_path / "nope.json"))
    assert line == "breaking-bump spend · c_round2: cost unavailable"


def test_format_spend_garbage_json_is_unavailable(tmp_path):
    f = tmp_path / "garbage.json"
    f.write_text("{ this is not json", encoding="utf-8")
    line = spend.format_spend("b_round1", str(f))
    assert line == "breaking-bump spend · b_round1: cost unavailable"


def test_format_spend_no_result_entry_is_unavailable(tmp_path):
    f = tmp_path / "no_result.json"
    f.write_text(json.dumps([{"type": "assistant", "message": {}}]), encoding="utf-8")
    line = spend.format_spend("agent-a", str(f))
    assert line == "breaking-bump spend · agent-a: cost unavailable"


# --- upsert_body: the running marker-tagged ledger body builder ---


def test_upsert_body_first_call_seeds_marker():
    # No ledger yet (existing is None) → marker + the first line.
    body = spend.upsert_body(None, "breaking-bump spend · agent-a: $0.0347")
    assert body == f"{spend.MARKER}\nbreaking-bump spend · agent-a: $0.0347"


def test_upsert_body_appends_under_existing_ledger():
    existing = f"{spend.MARKER}\nbreaking-bump spend · agent-a: $0.0347"
    body = spend.upsert_body(existing, "breaking-bump spend · b_round1: $0.0102")
    assert body == (
        f"{spend.MARKER}\n"
        "breaking-bump spend · agent-a: $0.0347\n"
        "breaking-bump spend · b_round1: $0.0102"
    )


def test_upsert_body_marker_appears_exactly_once_after_several_appends():
    body = None
    for stage in ("agent-a", "b_round1", "c_round1", "agent-d"):
        body = spend.upsert_body(body, f"breaking-bump spend · {stage}: $0.0100")
    assert body.count(spend.MARKER) == 1
    assert body.startswith(spend.MARKER + "\n")
    assert body.count("breaking-bump spend ·") == 4


def test_upsert_body_empty_string_treated_as_no_ledger():
    body = spend.upsert_body("", "breaking-bump spend · agent-a: $0.0347")
    assert body == f"{spend.MARKER}\nbreaking-bump spend · agent-a: $0.0347"


# --- CLI: `spend.py line <stage> <execution_file>` and `spend.py body <line>` ---


def test_cli_line_prints_format_spend(tmp_path, capsys):
    f = tmp_path / "execution.json"
    f.write_text(json.dumps(RESULT_LOG), encoding="utf-8")
    rc = spend.main(["line", "agent-a", str(f)])
    assert rc == 0
    assert capsys.readouterr().out.strip() == "breaking-bump spend · agent-a: $0.0347"


def test_cli_line_missing_exec_is_unavailable(capsys):
    rc = spend.main(["line", "agent-d"])
    assert rc == 0
    assert capsys.readouterr().out.strip() == "breaking-bump spend · agent-d: cost unavailable"


def test_cli_body_seeds_marker_when_stdin_empty(monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin", io.StringIO(""))
    rc = spend.main(["body", "breaking-bump spend · agent-a: $0.0347"])
    assert rc == 0
    assert capsys.readouterr().out.rstrip("\n") == (
        f"{spend.MARKER}\nbreaking-bump spend · agent-a: $0.0347"
    )


def test_cli_body_appends_to_stdin_ledger(monkeypatch, capsys):
    existing = f"{spend.MARKER}\nbreaking-bump spend · agent-a: $0.0347"
    monkeypatch.setattr("sys.stdin", io.StringIO(existing))
    rc = spend.main(["body", "breaking-bump spend · b_round1: $0.0102"])
    assert rc == 0
    out = capsys.readouterr().out.rstrip("\n")
    assert out == (
        f"{spend.MARKER}\n"
        "breaking-bump spend · agent-a: $0.0347\n"
        "breaking-bump spend · b_round1: $0.0102"
    )
    assert out.count(spend.MARKER) == 1
