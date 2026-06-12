"""Unit tests for valuesdiff — leaf diff + override cross-reference."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import valuesdiff as vd  # noqa: E402

OLD = {"clickhouse": {"replicas": 1, "image": "old"}, "removedKey": True}
NEW = {"clickhouse": {"replicas": 2, "image": "old"}, "addedKey": "x"}


def test_flatten_dots_nested_keys():
    assert vd.flatten({"a": {"b": 1}}) == {"a.b": 1}


def test_diff_values_reports_added_removed_changed():
    changes = {(c.path, c.kind) for c in vd.diff_values(OLD, NEW)}
    assert changes == {
        ("clickhouse.replicas", "changed"),
        ("removedKey", "removed"),
        ("addedKey", "added"),
    }


def test_diff_values_ignores_unchanged_leaf():
    paths = {c.path for c in vd.diff_values(OLD, NEW)}
    assert "clickhouse.image" not in paths


def test_mark_overrides_flags_repo_pinned_keys():
    changes = vd.diff_values(OLD, NEW)
    overrides = [{"clickhouse": {"replicas": 1}}]  # repo pins clickhouse.replicas
    marked = {c.path: c.overridden for c in vd.mark_overrides(changes, overrides)}
    assert marked["clickhouse.replicas"] is True
    assert marked["addedKey"] is False


def test_cli_emits_json(tmp_path, capsys):
    old = tmp_path / "old.yaml"
    old.write_text("a:\n  b: 1\n")
    new = tmp_path / "new.yaml"
    new.write_text("a:\n  b: 2\n")
    rc = vd.main(["--old", str(old), "--new", str(new)])
    assert rc == 0
    import json
    out = json.loads(capsys.readouterr().out)
    assert out == [{"path": "a.b", "kind": "changed", "old": 1, "new": 2, "overridden": False}]
