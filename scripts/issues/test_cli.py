from __future__ import annotations

import json

import pytest

from memory import InMemoryTracker
import cli


def test_check_plan_fails_when_no_plan_comment_posted(capsys):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "B"], tracker=tracker)
    capsys.readouterr()
    with pytest.raises(SystemExit) as exc:
        cli.main(["check-plan", "1"], tracker=tracker)
    assert exc.value.code == 1
    assert "missing" in capsys.readouterr().err


def test_check_fails_on_a_fabricated_citation(capsys):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T",
              "--body", "the guard mirrors .github/workflows/nope-guard.yml:9"], tracker=tracker)
    capsys.readouterr()
    with pytest.raises(SystemExit) as exc:
        cli.main(["check", "1"], tracker=tracker)
    assert exc.value.code == 1
    assert "nope-guard.yml:9" in capsys.readouterr().err


def test_check_passes_a_body_with_no_bad_citations(capsys):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "plain prose, no path:line evidence"], tracker=tracker)
    capsys.readouterr()
    cli.main(["check", "1"], tracker=tracker)
    assert "passes all proofs" in capsys.readouterr().out


def test_update_body_reads_from_body_file(capsys, tmp_path):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "old"], tracker=tracker)
    f = tmp_path / "spec.md"
    f.write_text("brand new spec body with backticks `x` and $vars")
    cli.main(["update-body", "1", "--body-file", str(f)], tracker=tracker)
    capsys.readouterr()
    cli.main(["get", "1"], tracker=tracker)
    assert "brand new spec body" in json.loads(capsys.readouterr().out)["body"]


def test_comment_reads_from_body_file(capsys, tmp_path):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "B"], tracker=tracker)
    f = tmp_path / "plan.md"
    f.write_text("## Implementation plan (Plan Review)\nfull plan text")
    capsys.readouterr()
    cli.main(["comment", "1", "--body-file", str(f)], tracker=tracker)
    cli.main(["comments", "1"], tracker=tracker)
    assert "full plan text" in capsys.readouterr().out


def test_update_body_requires_exactly_one_body_source():
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "B"], tracker=tracker)
    with pytest.raises(SystemExit):
        cli.main(["update-body", "1"], tracker=tracker)  # neither
    with pytest.raises(SystemExit):
        cli.main(["update-body", "1", "--body", "x", "--body-file", "/tmp/y"], tracker=tracker)  # both


def test_check_file_proofs_a_local_draft_before_posting(capsys, tmp_path):
    tracker = InMemoryTracker()
    clean = tmp_path / "ok.md"; clean.write_text("prose with no path:line evidence")
    cli.main(["check", "--file", str(clean)], tracker=tracker)
    assert "passes all proofs" in capsys.readouterr().out
    bad = tmp_path / "bad.md"; bad.write_text("cite .github/workflows/nope-guard.yml:9")
    with pytest.raises(SystemExit) as exc:
        cli.main(["check", "--file", str(bad)], tracker=tracker)
    assert exc.value.code == 1 and "nope-guard.yml:9" in capsys.readouterr().err


def test_check_plan_file_proofs_a_local_plan_draft(capsys, tmp_path):
    tracker = InMemoryTracker()
    f = tmp_path / "plan.md"; f.write_text("## Implementation plan\nclean prose, no citations")
    cli.main(["check-plan", "--file", str(f)], tracker=tracker)
    assert "passes all proofs" in capsys.readouterr().out


def test_create_then_list_by_status_via_cli(capsys):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "B", "--label", "priority:high"],
             tracker=tracker)
    cli.main(["set-status", "1", "ready"], tracker=tracker)
    capsys.readouterr()
    cli.main(["list", "--status", "ready"], tracker=tracker)
    out = json.loads(capsys.readouterr().out)
    assert out[0]["title"] == "T"


def test_set_status_via_cli_sets_field_not_label(capsys):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "B"], tracker=tracker)
    capsys.readouterr()
    cli.main(["set-status", "1", "building"], tracker=tracker)
    cli.main(["get", "1"], tracker=tracker)
    out = json.loads(capsys.readouterr().out)
    assert out["status"] == "building"
    assert not any(l.startswith("status:") for l in out["labels"])


def test_bootstrap_ensures_priority_labels_and_status_field(capsys):
    tracker = InMemoryTracker()
    cli.main(["bootstrap"], tracker=tracker)
    out = json.loads(capsys.readouterr().out)
    assert set(tracker.label_definitions()) == {
        "priority:high", "priority:medium", "priority:low",
    }
    assert out["status_field"] == ["Idea", "Needs Input", "Ready", "Plan Review",
                                    "Planned", "Building", "Done"]
