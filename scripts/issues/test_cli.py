from __future__ import annotations

import json

from memory import InMemoryTracker
import cli


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
    assert out["status_field"] == ["Idea", "Ready", "Building", "Done"]
