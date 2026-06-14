from __future__ import annotations

import json

from memory import InMemoryTracker
import cli


def test_create_then_list_via_cli(capsys):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "B", "--label", "status:ready"],
             tracker=tracker)
    capsys.readouterr()
    cli.main(["list", "--label", "status:ready"], tracker=tracker)
    out = json.loads(capsys.readouterr().out)
    assert out[0]["title"] == "T"


def test_set_status_via_cli(capsys):
    tracker = InMemoryTracker()
    cli.main(["create", "--title", "T", "--body", "B", "--label", "status:idea"],
             tracker=tracker)
    capsys.readouterr()
    cli.main(["set-status", "1", "building"], tracker=tracker)
    cli.main(["get", "1"], tracker=tracker)
    out = json.loads(capsys.readouterr().out)
    assert "status:building" in out["labels"]


def test_bootstrap_ensures_six_workflow_labels(capsys):
    tracker = InMemoryTracker()
    cli.main(["bootstrap"], tracker=tracker)
    capsys.readouterr()
    defs = tracker.label_definitions()
    assert set(defs) == {
        "status:idea", "status:ready", "status:building",
        "priority:high", "priority:medium", "priority:low",
    }
