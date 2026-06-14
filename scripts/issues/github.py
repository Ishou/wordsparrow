"""GitHub adapter: shells to `gh`. The only GitHub-specific code in the port."""
from __future__ import annotations

import json
import os
import subprocess
from typing import Callable

from models import Comment, Issue, IssueRef, Status
from tracker import IssueTracker

Runner = Callable[[list[str]], str]


def _run(argv: list[str]) -> str:
    return subprocess.run(argv, check=True, capture_output=True, text=True).stdout


_VIEW_FIELDS = "number,title,body,labels,state,url"

# abstract Status ↔ native Projects single-select option name (Done has no enum)
_STATUS_TO_OPTION = {Status.IDEA: "Idea", Status.NEEDS_INPUT: "Needs Input",
                     Status.READY: "Ready", Status.BUILDING: "Building"}
_OPTION_TO_STATUS = {v: k for k, v in _STATUS_TO_OPTION.items()}
_DONE_OPTION = "Done"
_FIELD_OPTIONS = ("Idea", "Needs Input", "Ready", "Building", "Done")
_OPTION_COLORS = {"Idea": "GRAY", "Needs Input": "ORANGE", "Ready": "GREEN",
                  "Building": "BLUE", "Done": "PURPLE"}


class GitHubTracker(IssueTracker):
    def __init__(self, runner: Runner = _run) -> None:
        self._run = runner
        self._owner = os.environ.get("ISSUE_PROJECT_OWNER", "Ishou")
        self._number = os.environ.get("ISSUE_PROJECT_NUMBER", "4")
        self._field = os.environ.get("ISSUE_STATUS_FIELD", "Status")

    def _issue_from_json(self, data: dict, status: "Status | None" = None) -> Issue:
        return Issue(
            id=data["number"],
            title=data.get("title", ""),
            body=data.get("body", "") or "",
            labels=tuple(l["name"] for l in data.get("labels", [])),
            state=str(data.get("state", "open")).lower(),
            url=data.get("url", ""),
            status=status,
        )

    def create(self, title: str, body: str, labels: tuple[str, ...] = ()) -> IssueRef:
        argv = ["gh", "issue", "create", "--title", title, "--body", body]
        for lbl in labels:
            argv += ["--label", lbl]
        url = self._run(argv).strip()
        return IssueRef(id=int(url.rstrip("/").rsplit("/", 1)[-1]), url=url)

    def get(self, id: int) -> Issue:
        out = self._run(["gh", "issue", "view", str(id), "--json", _VIEW_FIELDS])
        data = json.loads(out)
        item = self._find_item(id)
        return self._issue_from_json(data, status=self._item_status(item))

    def list(
        self, labels: tuple[str, ...] = (), state: str = "open",
        status: "Status | None" = None,
    ) -> list[Issue]:
        if status is not None:
            issues = self._list_by_status(status)
            want = set(labels)
            return [
                i for i in issues
                if (state == "all" or i.state == state)
                and want.issubset(set(i.labels))
            ]
        argv = ["gh", "issue", "list", "--state", state, "--json", _VIEW_FIELDS, "--limit", "1000"]
        for lbl in labels:
            argv += ["--label", lbl]
        return [self._issue_from_json(d) for d in json.loads(self._run(argv))]

    def update_body(self, id: int, body: str) -> None:
        self._run(["gh", "issue", "edit", str(id), "--body", body])

    def comment(self, id: int, body: str) -> None:
        self._run(["gh", "issue", "comment", str(id), "--body", body])

    def comments(self, id: int) -> list[Comment]:
        out = self._run(["gh", "issue", "view", str(id), "--json", "comments"])
        return [
            Comment(author=c.get("author", {}).get("login", ""),
                    body=c.get("body", ""), created_at=c.get("createdAt", ""))
            for c in json.loads(out).get("comments", [])
        ]

    def add_label(self, id: int, label: str) -> None:
        self._run(["gh", "issue", "edit", str(id), "--add-label", label])

    def remove_label(self, id: int, label: str) -> None:
        self._run(["gh", "issue", "edit", str(id), "--remove-label", label])

    def ensure_label(self, name: str, color: str, description: str) -> None:
        self._run(["gh", "label", "create", name, "--color", color,
                   "--description", description, "--force"])

    # --- native status board (Projects v2 single-select field) ---

    def ensure_status_field(self, options: tuple[str, ...] = _FIELD_OPTIONS) -> None:
        field = self._field_json()
        if field is None:
            self._run(["gh", "project", "field-create", self._number, "--owner", self._owner,
                       "--name", self._field, "--data-type", "SINGLE_SELECT",
                       "--single-select-options", ",".join(options)])
            return
        if tuple(o.get("name") for o in field.get("options", [])) == tuple(options):
            return
        self._set_field_options(field["id"], options)

    def _set_field_options(self, field_id: str, options: tuple[str, ...]) -> None:
        opts = ", ".join(
            f'{{name: "{n}", color: {_OPTION_COLORS.get(n, "GRAY")}, description: ""}}'
            for n in options
        )
        mutation = (
            f'mutation {{ updateProjectV2Field(input: {{fieldId: "{field_id}", '
            f'singleSelectOptions: [{opts}]}}) {{ projectV2Field {{ '
            f'... on ProjectV2SingleSelectField {{ id }} }} }} }}'
        )
        self._run(["gh", "api", "graphql", "-f", f"query={mutation}"])

    def set_status(self, id: int, status: Status) -> None:
        self._move_to_option(id, _STATUS_TO_OPTION[status])

    def close(self, id: int, reason: str = "completed") -> None:
        self._move_to_option(id, _DONE_OPTION)
        self._close(id, reason)

    def _close(self, id: int, reason: str) -> None:
        self._run(["gh", "issue", "close", str(id), "--reason", reason])

    # --- Projects v2 helpers (all via the injected runner) ---

    def _project_id(self) -> str:
        out = self._run(["gh", "project", "view", self._number, "--owner", self._owner,
                         "--format", "json"])
        return json.loads(out)["id"]

    def _field_json(self) -> "dict | None":
        out = self._run(["gh", "project", "field-list", self._number, "--owner", self._owner,
                         "--format", "json"])
        for f in json.loads(out).get("fields", []):
            if f.get("name") == self._field:
                return f
        return None

    def _option_id(self, field: dict, option_name: str) -> "str | None":
        for opt in field.get("options", []):
            if opt.get("name") == option_name:
                return opt.get("id")
        return None

    def _items(self) -> list[dict]:
        out = self._run(["gh", "project", "item-list", self._number, "--owner", self._owner,
                         "--format", "json"])
        return json.loads(out).get("items", [])

    def _find_item(self, id: int) -> "dict | None":
        for item in self._items():
            if (item.get("content") or {}).get("number") == id:
                return item
        return None

    def _item_status(self, item: "dict | None") -> "Status | None":
        if not item:
            return None
        # gh project item-list keys single-select values by the lowercased field name
        return _OPTION_TO_STATUS.get(item.get(self._field.lower()))

    def _move_to_option(self, id: int, option_name: str) -> None:
        item = self._find_item(id)
        if item is None:
            url = json.loads(self._run(["gh", "issue", "view", str(id), "--json", "url"]))["url"]
            out = self._run(["gh", "project", "item-add", self._number, "--owner", self._owner,
                             "--url", url, "--format", "json"])
            item_id = json.loads(out)["id"]
        else:
            item_id = item["id"]
        field = self._field_json() or {}
        self._run(["gh", "project", "item-edit", "--project-id", self._project_id(),
                   "--id", item_id, "--field-id", field.get("id", ""),
                   "--single-select-option-id", self._option_id(field, option_name) or ""])

    def _list_by_status(self, status: Status) -> list[Issue]:
        target = _STATUS_TO_OPTION[status]
        out = []
        for item in self._items():
            if item.get(self._field.lower()) != target:
                continue
            content = item.get("content") or {}
            if "number" not in content:
                continue
            out.append(self._issue_from_json(content, status=status))
        return out
