"""GitHub adapter: shells to `gh`. The only GitHub-specific code in the port."""
from __future__ import annotations

import json
import subprocess
from typing import Callable

from models import Comment, Issue, IssueRef
from tracker import IssueTracker

Runner = Callable[[list[str]], str]


def _run(argv: list[str]) -> str:
    return subprocess.run(argv, check=True, capture_output=True, text=True).stdout


_VIEW_FIELDS = "number,title,body,labels,state,url"


class GitHubTracker(IssueTracker):
    def __init__(self, runner: Runner = _run) -> None:
        self._run = runner

    def _issue_from_json(self, data: dict) -> Issue:
        return Issue(
            id=data["number"],
            title=data.get("title", ""),
            body=data.get("body", "") or "",
            labels=tuple(l["name"] for l in data.get("labels", [])),
            state=str(data.get("state", "open")).lower(),
            url=data.get("url", ""),
        )

    def create(self, title: str, body: str, labels: tuple[str, ...] = ()) -> IssueRef:
        argv = ["gh", "issue", "create", "--title", title, "--body", body]
        for lbl in labels:
            argv += ["--label", lbl]
        url = self._run(argv).strip()
        return IssueRef(id=int(url.rstrip("/").rsplit("/", 1)[-1]), url=url)

    def get(self, id: int) -> Issue:
        out = self._run(["gh", "issue", "view", str(id), "--json", _VIEW_FIELDS])
        return self._issue_from_json(json.loads(out))

    def list(self, labels: tuple[str, ...] = (), state: str = "open") -> list[Issue]:
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

    def _close(self, id: int, reason: str) -> None:
        self._run(["gh", "issue", "close", str(id), "--reason", reason])
