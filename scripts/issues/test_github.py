from __future__ import annotations

import json

import pytest

from github import GitHubTracker, _run
from models import Status


def test_run_surfaces_stderr_on_failure():
    with pytest.raises(RuntimeError) as exc:
        _run(["bash", "-c", "echo 'boom: bad credentials' >&2; exit 7"])
    msg = str(exc.value)
    assert "boom: bad credentials" in msg
    assert "exited 7" in msg


class FakeRunner:
    def __init__(self, outputs: list[str]):
        self.outputs = list(outputs)
        self.calls: list[list[str]] = []

    def __call__(self, argv: list[str]) -> str:
        self.calls.append(argv)
        return self.outputs.pop(0) if self.outputs else ""


def _issue_json(number=5, **over):
    base = {
        "number": number, "title": "T", "body": "B",
        "labels": [{"name": "priority:high"}],
        "state": "OPEN", "url": f"https://x/{number}",
    }
    base.update(over)
    return json.dumps(base)


def test_get_parses_issue_and_native_status():
    item_list = json.dumps({"items": [{"id": "IT", "status": "Ready",
                                       "content": {"number": 5}}]})
    runner = FakeRunner([_issue_json(), item_list])
    issue = GitHubTracker(runner=runner).get(5)
    assert issue.id == 5
    assert issue.status is Status.READY
    assert issue.priority.value == "priority:high"
    assert runner.calls[0][:3] == ["gh", "issue", "view"]
    assert runner.calls[1][:3] == ["gh", "project", "item-list"]


def test_add_label_calls_gh_edit():
    runner = FakeRunner([""])
    GitHubTracker(runner=runner).add_label(5, "needs-human")
    assert runner.calls[0] == ["gh", "issue", "edit", "5", "--add-label", "needs-human"]


def test_create_returns_ref_from_url():
    runner = FakeRunner(["https://github.com/o/r/issues/42\n"])
    ref = GitHubTracker(runner=runner).create("T", "B", labels=("priority:high",))
    assert ref.id == 42
    assert runner.calls[0][:3] == ["gh", "issue", "create"]


def test_ensure_status_field_creates_when_absent():
    # field-list returns no Status field → field-create runs
    runner = FakeRunner([json.dumps({"fields": [{"name": "Title"}]})])
    GitHubTracker(runner=runner).ensure_status_field()
    assert runner.calls[0][:3] == ["gh", "project", "field-list"]
    create = runner.calls[1]
    assert create[:3] == ["gh", "project", "field-create"]
    assert "--data-type" in create and "SINGLE_SELECT" in create
    assert "Idea,Needs Input,Ready,Plan Review,Planned,Building,Done" in create


def test_ensure_status_field_is_noop_when_options_match():
    runner = FakeRunner([json.dumps({"fields": [{"name": "Status", "id": "FID", "options": [
        {"name": "Idea"}, {"name": "Needs Input"}, {"name": "Ready"},
        {"name": "Plan Review"}, {"name": "Planned"},
        {"name": "Building"}, {"name": "Done"}]}]})])
    GitHubTracker(runner=runner).ensure_status_field()
    assert [c[:3] for c in runner.calls] == [["gh", "project", "field-list"]]


def test_ensure_status_field_updates_options_when_present_but_differ():
    # built-in Status field exists with default options → graphql updates them
    runner = FakeRunner([json.dumps({"fields": [{"name": "Status", "id": "FID", "options": [
        {"name": "Todo"}, {"name": "In Progress"}, {"name": "Done"}]}]})])
    GitHubTracker(runner=runner).ensure_status_field()
    mut = runner.calls[-1]
    assert mut[:3] == ["gh", "api", "graphql"]
    query = mut[-1]
    assert "updateProjectV2Field" in query and "FID" in query
    assert '"Idea"' in query and '"Ready"' in query and '"Building"' in query


def test_set_status_edits_existing_item_single_select():
    field = json.dumps({"fields": [{"name": "Status", "id": "FID",
                                    "options": [{"name": "Building", "id": "OID"}]}]})
    items = json.dumps({"items": [{"id": "ITEM-1", "content": {"number": 5}}]})
    project = json.dumps({"id": "PID"})
    runner = FakeRunner([items, field, project])
    GitHubTracker(runner=runner).set_status(5, Status.BUILDING)
    edit = runner.calls[-1]
    assert edit[:2] == ["gh", "project"]
    assert edit[2] == "item-edit"
    assert "--project-id" in edit and "PID" in edit
    assert "--id" in edit and "ITEM-1" in edit
    assert "--field-id" in edit and "FID" in edit
    assert "--single-select-option-id" in edit and "OID" in edit


def test_set_status_adds_item_when_missing():
    field = json.dumps({"fields": [{"name": "Status", "id": "FID",
                                    "options": [{"name": "Ready", "id": "OID"}]}]})
    empty = json.dumps({"items": []})
    url = json.dumps({"url": "https://x/9"})
    added = json.dumps({"id": "NEW-ITEM"})
    project = json.dumps({"id": "PID"})
    runner = FakeRunner([empty, url, added, field, project])
    GitHubTracker(runner=runner).set_status(9, Status.READY)
    assert any(c[:3] == ["gh", "project", "item-add"] for c in runner.calls)
    assert "NEW-ITEM" in runner.calls[-1]


def test_list_by_status_filters_items():
    items = json.dumps({"items": [
        {"id": "a", "status": "Ready", "content": _issue_dict(1)},
        {"id": "b", "status": "Idea", "content": _issue_dict(2)},
    ]})
    runner = FakeRunner([items])
    out = GitHubTracker(runner=runner).list(status=Status.READY)
    assert [i.id for i in out] == [1]
    assert runner.calls[0][:3] == ["gh", "project", "item-list"]


def _issue_dict(number):
    return {"number": number, "title": "T", "body": "B", "labels": [],
            "state": "OPEN", "url": f"https://x/{number}"}
