from __future__ import annotations

import json

from github import GitHubTracker
from models import Status


class FakeRunner:
    def __init__(self, outputs: list[str]):
        self.outputs = list(outputs)
        self.calls: list[list[str]] = []

    def __call__(self, argv: list[str]) -> str:
        self.calls.append(argv)
        return self.outputs.pop(0) if self.outputs else ""


def test_get_parses_gh_json():
    payload = json.dumps({
        "number": 5, "title": "T", "body": "B",
        "labels": [{"name": "status:ready"}, {"name": "priority:high"}],
        "state": "OPEN", "url": "https://x/5",
    })
    runner = FakeRunner([payload])
    issue = GitHubTracker(runner=runner).get(5)
    assert issue.id == 5
    assert issue.status is Status.READY
    assert runner.calls[0][:3] == ["gh", "issue", "view"]
    assert "--json" in runner.calls[0]


def test_add_label_calls_gh_edit():
    runner = FakeRunner([""])
    GitHubTracker(runner=runner).add_label(5, "needs-human")
    assert runner.calls[0] == ["gh", "issue", "edit", "5", "--add-label", "needs-human"]


def test_create_returns_ref_from_url():
    runner = FakeRunner(["https://github.com/o/r/issues/42\n"])
    ref = GitHubTracker(runner=runner).create("T", "B", labels=("status:idea",))
    assert ref.id == 42
    assert runner.calls[0][:3] == ["gh", "issue", "create"]


def test_ensure_label_calls_gh_label_create_force():
    runner = FakeRunner([""])
    GitHubTracker(runner=runner).ensure_label("status:ready", "0E8A16", "Ready")
    assert runner.calls[0] == [
        "gh", "label", "create", "status:ready",
        "--color", "0E8A16", "--description", "Ready", "--force",
    ]
