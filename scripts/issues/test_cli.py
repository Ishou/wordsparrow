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
