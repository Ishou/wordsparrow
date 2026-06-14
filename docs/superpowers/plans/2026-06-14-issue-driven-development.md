# Issue-Driven Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub issues the prioritizable, comment-steered home for feature work, behind a portable `IssueTracker` port so the same workflow runs against GitLab later.

**Architecture:** A Python `IssueTracker` ABC (`scripts/issues/`) with all lifecycle invariants in shared concrete methods; a `GitHubTracker` adapter that shells to `gh` through an injectable runner; an `AuditingTracker` decorator that comments on every mutation; an `InMemoryTracker` fake for offline tests; a `python -m issues` CLI. Skills/commands and (later) CI call only the CLI.

**Tech Stack:** Python 3.14, pytest + hypothesis, `gh` CLI. Mirrors `scripts/breaking-bump/` conventions (flat modules, `test_*.py` siblings, `python -m pytest`).

---

## Wave roadmap (each wave = one PR, ≤400 non-blank/non-generated lines)

Per ADR-0001 §6a and the maintainer's wave convention: **each wave is reviewed and merged before the next starts, and review of an early wave may reshape later ones.** Waves 1–3 (the foundation/port) are fully detailed below. Waves 4–8 are scoped here and detailed just-in-time after Wave 3 merges — this is a deliberate decision (later command waves depend on the dispatch internals they wire into, which the port may reshape), **not** a placeholder gap.

| Wave | PR scope | Depends on | Rough size |
|---|---|---|---|
| 1 | ADR-0069 + INDEX entry (spec already committed on this branch) | — | docs |
| 2 | Port core: `models`, `tracker` ABC + invariants, `InMemoryTracker`, contract+fake tests, `requirements`, `conftest`, CI gate | 1 | ~280 |
| 3 | `GitHubTracker` (runner-injected) + `AuditingTracker` + `cli` + tests | 2 | ~320 |
| 4 | Labels/board bootstrap: `status:*` labels via a `bootstrap` CLI verb + board-setup docs (GitHub + GitLab) | 3 | ~150 |
| 5 | `/launch` skill+command: port → `dispatch` flow + auto-merge cron | 3,4 | ~250 |
| 6 | `/capture` + `/backlog` commands | 3,4 | ~180 |
| 7 | `/spec` + `/refine` commands (brainstorm-into-issue + comment refine) | 3,4 | ~300 |
| 8 | *(later)* CI-native triggers: scheduled poll on `status:ready`; comment-event refine (GitHub) | 5,6,7 | ~200 |

---

## Wave 1 — ADR-0069 + INDEX

**Files:**
- Create: `docs/adr/0069-issue-driven-development.md`
- Modify: `docs/adr/INDEX.md`
- (already committed on this branch: `docs/superpowers/specs/2026-06-14-issue-driven-development-design.md`)

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0069-issue-driven-development.md` using the repo ADR template:

```markdown
# ADR-0069: Issue-driven development — tracker port + label lifecycle

## Status
Accepted

## Context
Feature work currently lives in files (`docs/superpowers/specs/*`, `plans/*`)
driven by `/orchestrate`. Those are invisible, unrankable at a glance, and not
steerable remotely. We want GitHub issues to be the entry point and living spec:
an online prioritizable backlog, an idea inbox, comment-driven refinement, and
low-friction implementer launch — while staying portable to another forge
(GitLab CI). Full design:
`docs/superpowers/specs/2026-06-14-issue-driven-development-design.md`.

## Decision
Introduce an `IssueTracker` port (`scripts/issues/`) that every skill, launcher,
and CI step calls instead of `gh` directly. A `GitHubTracker` adapter shells to
`gh` (no new dependency); a `GitLabTracker` (shells to `glab`) is added later
with zero caller changes. An `AuditingTracker` decorator comments on every
mutation. Lifecycle is label-driven so it renders as a board on either platform:
`status:idea|ready|building` columns (Done = closed issue), `priority:*` ranks
within a column, `needs-human` for escalation. Port invariants: at most one
`status:*` and one `priority:*` at a time; close clears `status:*`. Commands
(`/capture`, `/spec`, `/refine`, `/launch`, `/backlog`) call the CLI; a
CI-native scheduled-poll trigger is the portable automation path (GitHub
issue-event triggers are an optional accelerator).

## Consequences
Specs move from reviewed files to issue bodies (intent, not shipped code — the
implementer PR still gets §6a; ADR-worthy decisions still go through reviewed
ADR files). The workflow gains portability and remote steerability. Cost: a new
python module + CLI to maintain, and `gh` rate-limit care under polling.
Relates to ADR-0001 (file-based plans, still used) and ADR-0068 (issues as
breaking-bump spines).
```

- [ ] **Step 2: Add the INDEX entry**

In `docs/adr/INDEX.md`, add a registry row mapping the new paths to ADR-0069 (follow the existing table format):

```
| `scripts/issues/**`, issue-driven workflow | ADR-0069 |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0069-issue-driven-development.md docs/adr/INDEX.md
git commit -s -m "docs(adr): ADR-0069 issue-driven development (tracker port + label lifecycle)"
```

Expected: `registry-coherence` CI gate passes (ADR ↔ INDEX paired in one PR).

---

## Wave 2 — Port core

**Files:**
- Create: `scripts/issues/__init__.py` (empty)
- Create: `scripts/issues/conftest.py` (empty)
- Create: `scripts/issues/requirements.txt`
- Create: `scripts/issues/models.py`
- Create: `scripts/issues/tracker.py`
- Create: `scripts/issues/memory.py`
- Create: `scripts/issues/test_models.py`
- Create: `scripts/issues/test_contract.py`
- Create: `.github/workflows/issues-tests.yml`

### Task 2.1 — Models

- [ ] **Step 1: Write the failing test** — `scripts/issues/test_models.py`

```python
from __future__ import annotations

from models import Issue, Status, Priority


def test_status_and_priority_derived_from_labels():
    issue = Issue(
        id=7, title="t", body="b",
        labels=("status:ready", "priority:high", "ai-driven"),
        state="open", url="u",
    )
    assert issue.status is Status.READY
    assert issue.priority is Priority.HIGH


def test_missing_status_and_priority_are_none():
    issue = Issue(id=7, title="t", body="b", labels=("ai-driven",), state="open")
    assert issue.status is None
    assert issue.priority is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/issues && python -m pytest test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'models'`.

- [ ] **Step 3: Write minimal implementation** — `scripts/issues/models.py`

```python
"""Domain types for the issue-tracker port. No I/O, no vendor SDKs."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Status(str, Enum):
    IDEA = "status:idea"
    READY = "status:ready"
    BUILDING = "status:building"


class Priority(str, Enum):
    HIGH = "priority:high"
    MEDIUM = "priority:medium"
    LOW = "priority:low"


STATUS_LABELS = frozenset(s.value for s in Status)
PRIORITY_LABELS = frozenset(p.value for p in Priority)


@dataclass(frozen=True)
class IssueRef:
    id: int
    url: str


@dataclass(frozen=True)
class Comment:
    author: str
    body: str
    created_at: str


@dataclass(frozen=True)
class Issue:
    id: int
    title: str
    body: str
    labels: tuple[str, ...]
    state: str  # "open" | "closed"
    url: str = ""

    def _single(self, allowed: frozenset[str], enum: type) -> object | None:
        hit = [lbl for lbl in self.labels if lbl in allowed]
        return enum(hit[0]) if hit else None

    @property
    def status(self) -> Status | None:
        return self._single(STATUS_LABELS, Status)

    @property
    def priority(self) -> Priority | None:
        return self._single(PRIORITY_LABELS, Priority)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/issues && python -m pytest test_models.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/issues/models.py scripts/issues/test_models.py scripts/issues/__init__.py scripts/issues/conftest.py
git commit -s -m "feat(issues): add IssueTracker domain models"
```

### Task 2.2 — Port ABC + invariants + in-memory fake

- [ ] **Step 1: Write the failing contract test** — `scripts/issues/test_contract.py`

This is the shared contract every adapter must satisfy; Wave 3 reuses it against `GitHubTracker`.

```python
from __future__ import annotations

import pytest

from memory import InMemoryTracker
from models import Priority, Status
from tracker import IssueTracker


@pytest.fixture
def tracker() -> IssueTracker:
    return InMemoryTracker()


def test_create_then_get_roundtrip(tracker: IssueTracker):
    ref = tracker.create("Title", "Body", labels=("status:idea",))
    issue = tracker.get(ref.id)
    assert issue.title == "Title"
    assert issue.body == "Body"
    assert issue.status is Status.IDEA


def test_set_status_keeps_exactly_one_status_label(tracker: IssueTracker):
    ref = tracker.create("t", "b", labels=("status:idea",))
    tracker.set_status(ref.id, Status.BUILDING)
    labels = tracker.get(ref.id).labels
    assert [l for l in labels if l.startswith("status:")] == ["status:building"]


def test_set_priority_keeps_exactly_one_priority_label(tracker: IssueTracker):
    ref = tracker.create("t", "b", labels=("priority:low",))
    tracker.set_priority(ref.id, Priority.HIGH)
    labels = tracker.get(ref.id).labels
    assert [l for l in labels if l.startswith("priority:")] == ["priority:high"]


def test_close_clears_status_and_marks_closed(tracker: IssueTracker):
    ref = tracker.create("t", "b", labels=("status:building",))
    tracker.close(ref.id, reason="completed")
    issue = tracker.get(ref.id)
    assert issue.state == "closed"
    assert [l for l in issue.labels if l.startswith("status:")] == []


def test_list_filters_by_label_and_state(tracker: IssueTracker):
    a = tracker.create("a", "b", labels=("status:ready", "priority:high"))
    tracker.create("b", "b", labels=("status:idea",))
    ready = tracker.list(labels=("status:ready",), state="open")
    assert [i.id for i in ready] == [a.id]


def test_comments_roundtrip(tracker: IssueTracker):
    ref = tracker.create("t", "b")
    tracker.comment(ref.id, "hello")
    bodies = [c.body for c in tracker.comments(ref.id)]
    assert bodies == ["hello"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/issues && python -m pytest test_contract.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tracker'`.

- [ ] **Step 3: Write the port ABC** — `scripts/issues/tracker.py`

All invariants live here, in concrete methods built on abstract primitives, so every adapter inherits them and the contract test covers them once.

```python
"""IssueTracker port — invariants in concrete methods; no vendor SDK imports."""
from __future__ import annotations

from abc import ABC, abstractmethod

from models import (
    PRIORITY_LABELS,
    STATUS_LABELS,
    Comment,
    Issue,
    IssueRef,
    Priority,
    Status,
)


class IssueTracker(ABC):
    # --- primitives every adapter implements ---
    @abstractmethod
    def create(self, title: str, body: str, labels: tuple[str, ...] = ()) -> IssueRef: ...

    @abstractmethod
    def get(self, id: int) -> Issue: ...

    @abstractmethod
    def list(self, labels: tuple[str, ...] = (), state: str = "open") -> list[Issue]: ...

    @abstractmethod
    def update_body(self, id: int, body: str) -> None: ...

    @abstractmethod
    def comment(self, id: int, body: str) -> None: ...

    @abstractmethod
    def comments(self, id: int) -> list[Comment]: ...

    @abstractmethod
    def add_label(self, id: int, label: str) -> None: ...

    @abstractmethod
    def remove_label(self, id: int, label: str) -> None: ...

    @abstractmethod
    def _close(self, id: int, reason: str) -> None: ...

    # --- shared lifecycle (invariants enforced once, for all adapters) ---
    def _swap(self, id: int, target: str, family: frozenset[str]) -> None:
        labels = self.get(id).labels
        for lbl in labels:
            if lbl in family and lbl != target:
                self.remove_label(id, lbl)
        if target not in labels:
            self.add_label(id, target)

    def set_status(self, id: int, status: Status) -> None:
        self._swap(id, status.value, STATUS_LABELS)

    def set_priority(self, id: int, priority: Priority) -> None:
        self._swap(id, priority.value, PRIORITY_LABELS)

    def close(self, id: int, reason: str = "completed") -> None:
        for lbl in self.get(id).labels:
            if lbl in STATUS_LABELS:
                self.remove_label(id, lbl)
        self._close(id, reason)
```

- [ ] **Step 4: Write the in-memory fake** — `scripts/issues/memory.py`

```python
"""In-memory IssueTracker for offline tests. Real implementation, not a mock."""
from __future__ import annotations

from dataclasses import replace

from models import Comment, Issue, IssueRef
from tracker import IssueTracker


class InMemoryTracker(IssueTracker):
    def __init__(self) -> None:
        self._issues: dict[int, Issue] = {}
        self._comments: dict[int, list[Comment]] = {}
        self._seq = 0

    def create(self, title: str, body: str, labels: tuple[str, ...] = ()) -> IssueRef:
        self._seq += 1
        id_ = self._seq
        self._issues[id_] = Issue(
            id=id_, title=title, body=body, labels=tuple(labels),
            state="open", url=f"memory://issue/{id_}",
        )
        self._comments[id_] = []
        return IssueRef(id=id_, url=self._issues[id_].url)

    def get(self, id: int) -> Issue:
        return self._issues[id]

    def list(self, labels: tuple[str, ...] = (), state: str = "open") -> list[Issue]:
        want = set(labels)
        return [
            i for i in self._issues.values()
            if (state == "all" or i.state == state) and want.issubset(set(i.labels))
        ]

    def update_body(self, id: int, body: str) -> None:
        self._issues[id] = replace(self._issues[id], body=body)

    def comment(self, id: int, body: str) -> None:
        self._comments[id].append(Comment(author="fake", body=body, created_at="t"))

    def comments(self, id: int) -> list[Comment]:
        return list(self._comments[id])

    def add_label(self, id: int, label: str) -> None:
        issue = self._issues[id]
        if label not in issue.labels:
            self._issues[id] = replace(issue, labels=issue.labels + (label,))

    def remove_label(self, id: int, label: str) -> None:
        issue = self._issues[id]
        self._issues[id] = replace(issue, labels=tuple(l for l in issue.labels if l != label))

    def _close(self, id: int, reason: str) -> None:
        self._issues[id] = replace(self._issues[id], state="closed")
```

- [ ] **Step 5: Run the contract test to verify it passes**

Run: `cd scripts/issues && python -m pytest test_contract.py -v`
Expected: PASS (6 passed).

- [ ] **Step 6: Add requirements + CI gate**

Create `scripts/issues/requirements.txt`:

```
pytest>=8.0
hypothesis>=6.100
```

Create `.github/workflows/issues-tests.yml` (mirror `breaking-bump-tests.yml`):

```yaml
name: issues-tests
on:
  pull_request:
    paths:
      - 'scripts/issues/**'
      - '.github/workflows/issues-tests.yml'
jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with:
          python-version: '3.14.6'
      - name: Install deps
        run: pip install -r scripts/issues/requirements.txt
      - name: Run tests
        run: cd scripts/issues && python -m pytest -v
```

- [ ] **Step 7: Commit**

```bash
git add scripts/issues/ .github/workflows/issues-tests.yml
git commit -s -m "feat(issues): add IssueTracker port, invariants, and in-memory fake"
```

---

## Wave 3 — GitHub adapter + auditing decorator + CLI

**Files:**
- Create: `scripts/issues/github.py`
- Create: `scripts/issues/auditing.py`
- Create: `scripts/issues/cli.py`
- Create: `scripts/issues/__main__.py`
- Create: `scripts/issues/test_github.py`
- Create: `scripts/issues/test_auditing.py`
- Create: `scripts/issues/test_cli.py`

### Task 3.1 — GitHubTracker (runner-injected, no network in tests)

- [ ] **Step 1: Write the failing test** — `scripts/issues/test_github.py`

The adapter shells to `gh`; tests inject a fake runner and assert argv + parse canned JSON, so no network/auth is needed (boundary mock = the subprocess runner).

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/issues && python -m pytest test_github.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'github'`.

- [ ] **Step 3: Write the adapter** — `scripts/issues/github.py`

```python
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

    def _close(self, id: int, reason: str) -> None:
        self._run(["gh", "issue", "close", str(id), "--reason", reason])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/issues && python -m pytest test_github.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/issues/github.py scripts/issues/test_github.py
git commit -s -m "feat(issues): add GitHubTracker adapter (gh-shelling, runner-injected)"
```

### Task 3.2 — AuditingTracker decorator

- [ ] **Step 1: Write the failing test** — `scripts/issues/test_auditing.py`

```python
from __future__ import annotations

from auditing import AuditingTracker
from memory import InMemoryTracker
from models import Status


def _audit_comments(inner, id):
    return [c.body for c in inner.comments(id) if c.body.startswith("🤖")]


def test_set_status_emits_one_audit_comment_with_transition():
    inner = InMemoryTracker()
    audited = AuditingTracker(inner, actor="run-1", now=lambda: "2026-06-14T11:42Z")
    ref = audited.create("t", "b", labels=("status:idea",))
    audited.set_status(ref.id, Status.BUILDING)
    audits = _audit_comments(inner, ref.id)
    assert any("status: status:idea → status:building" in a for a in audits)
    assert sum("status:" in a for a in audits) == 1


def test_create_emits_audit_and_comment_is_not_audited():
    inner = InMemoryTracker()
    audited = AuditingTracker(inner, actor="run-1", now=lambda: "t")
    ref = audited.create("t", "b")
    audited.comment(ref.id, "human-facing note")
    audits = _audit_comments(inner, ref.id)
    assert len(audits) == 1  # the create audit only; comment() is not audited
    assert "create" in audits[0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/issues && python -m pytest test_auditing.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'auditing'`.

- [ ] **Step 3: Write the decorator** — `scripts/issues/auditing.py`

Overrides every public mutating method to delegate to the inner tracker, then post exactly one audit comment. Read methods and `comment()` pass straight through (a comment is the audit channel, not a state change). Delegating `set_status`/`set_priority`/`close` to the inner's shared methods keeps invariants atomic and audit-noise-free.

```python
"""Decorator that records every mutation as an audit comment on the issue."""
from __future__ import annotations

from typing import Callable

from models import Comment, Issue, IssueRef, Priority, Status
from tracker import IssueTracker


class AuditingTracker(IssueTracker):
    def __init__(self, inner: IssueTracker, actor: str,
                 now: Callable[[], str] | None = None) -> None:
        from datetime import datetime, timezone
        self._inner = inner
        self._actor = actor
        self._now = now or (lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"))

    def _audit(self, id: int, action: str, detail: str = "") -> None:
        sep = " · " if detail else ""
        self._inner.comment(id, f"🤖 {action}{sep}{detail} · actor: {self._actor} · {self._now()}")

    def get(self, id: int) -> Issue: return self._inner.get(id)
    def list(self, labels=(), state="open") -> list[Issue]: return self._inner.list(labels, state)
    def comments(self, id: int) -> list[Comment]: return self._inner.comments(id)

    # comment is the audit channel — not itself audited
    def comment(self, id: int, body: str) -> None: self._inner.comment(id, body)

    def create(self, title, body, labels=()) -> IssueRef:
        ref = self._inner.create(title, body, labels)
        self._audit(ref.id, "create", f"labels: {','.join(labels) or '-'}")
        return ref

    def update_body(self, id: int, body: str) -> None:
        self._inner.update_body(id, body)
        self._audit(id, "update_body")

    def add_label(self, id: int, label: str) -> None:
        self._inner.add_label(id, label)
        self._audit(id, "add_label", label)

    def remove_label(self, id: int, label: str) -> None:
        self._inner.remove_label(id, label)
        self._audit(id, "remove_label", label)

    def set_status(self, id: int, status: Status) -> None:
        before = self._inner.get(id).status
        self._inner.set_status(id, status)
        self._audit(id, "set_status", f"status: {before.value if before else '-'} → {status.value}")

    def set_priority(self, id: int, priority: Priority) -> None:
        before = self._inner.get(id).priority
        self._inner.set_priority(id, priority)
        self._audit(id, "set_priority", f"{before.value if before else '-'} → {priority.value}")

    def close(self, id: int, reason: str = "completed") -> None:
        self._inner.close(id, reason)
        self._audit(id, "close", reason)

    # primitive required by ABC; never called directly on the decorator
    def _close(self, id: int, reason: str) -> None:
        self._inner._close(id, reason)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/issues && python -m pytest test_auditing.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/issues/auditing.py scripts/issues/test_auditing.py
git commit -s -m "feat(issues): add AuditingTracker decorator (audit comment per mutation)"
```

### Task 3.3 — CLI

- [ ] **Step 1: Write the failing test** — `scripts/issues/test_cli.py`

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/issues && python -m pytest test_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'cli'`.

- [ ] **Step 3: Write the CLI** — `scripts/issues/cli.py`

```python
"""`python -m issues <verb>` — the single surface skills and CI call."""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys

from auditing import AuditingTracker
from github import GitHubTracker
from models import Priority, Status
from tracker import IssueTracker


def _default_tracker() -> IssueTracker:
    backend = os.environ.get("ISSUE_TRACKER", "github")
    if backend != "github":
        raise SystemExit(f"unknown ISSUE_TRACKER={backend!r} (only 'github' so far)")
    actor = os.environ.get("ISSUE_ACTOR", "claude-session")
    return AuditingTracker(GitHubTracker(), actor=actor)


def _emit(obj) -> None:
    def conv(o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        raise TypeError
    print(json.dumps(obj, default=conv, indent=2))


def main(argv: list[str], tracker: IssueTracker | None = None) -> None:
    t = tracker or _default_tracker()
    p = argparse.ArgumentParser(prog="issues")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create"); c.add_argument("--title", required=True)
    c.add_argument("--body", default=""); c.add_argument("--label", action="append", default=[])
    g = sub.add_parser("get"); g.add_argument("id", type=int)
    li = sub.add_parser("list"); li.add_argument("--label", action="append", default=[])
    li.add_argument("--state", default="open")
    ub = sub.add_parser("update-body"); ub.add_argument("id", type=int); ub.add_argument("--body", required=True)
    cm = sub.add_parser("comment"); cm.add_argument("id", type=int); cm.add_argument("--body", required=True)
    cs = sub.add_parser("comments"); cs.add_argument("id", type=int)
    ss = sub.add_parser("set-status"); ss.add_argument("id", type=int); ss.add_argument("status", choices=[s.name.lower() for s in Status])
    sp = sub.add_parser("set-priority"); sp.add_argument("id", type=int); sp.add_argument("priority", choices=[p.name.lower() for p in Priority])
    al = sub.add_parser("add-label"); al.add_argument("id", type=int); al.add_argument("label")
    rl = sub.add_parser("remove-label"); rl.add_argument("id", type=int); rl.add_argument("label")
    cl = sub.add_parser("close"); cl.add_argument("id", type=int); cl.add_argument("--reason", default="completed")

    a = p.parse_args(argv)
    if a.cmd == "create": _emit(t.create(a.title, a.body, tuple(a.label)))
    elif a.cmd == "get": _emit(t.get(a.id))
    elif a.cmd == "list": _emit(t.list(tuple(a.label), a.state))
    elif a.cmd == "update-body": t.update_body(a.id, a.body)
    elif a.cmd == "comment": t.comment(a.id, a.body)
    elif a.cmd == "comments": _emit(t.comments(a.id))
    elif a.cmd == "set-status": t.set_status(a.id, Status[a.status.upper()])
    elif a.cmd == "set-priority": t.set_priority(a.id, Priority[a.priority.upper()])
    elif a.cmd == "add-label": t.add_label(a.id, a.label)
    elif a.cmd == "remove-label": t.remove_label(a.id, a.label)
    elif a.cmd == "close": t.close(a.id, a.reason)


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv[1:])
```

Create `scripts/issues/__main__.py`:

```python
import sys
from cli import main

main(sys.argv[1:])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/issues && python -m pytest test_cli.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Run the full suite + commit**

Run: `cd scripts/issues && python -m pytest -v`
Expected: all pass.

```bash
git add scripts/issues/cli.py scripts/issues/__main__.py scripts/issues/test_cli.py
git commit -s -m "feat(issues): add python -m issues CLI over the tracker port"
```

---

## Waves 4–8 — scoped now, detailed just-in-time

Each gets its own `writing-plans` pass after the prior wave merges (review may reshape it). Scope locked here so the boundaries don't drift:

- **Wave 4 — Labels/board bootstrap.** Add a `bootstrap` CLI verb that idempotently creates the `status:*` labels (priority labels already exist) via `add_label`-style `gh label create`, and a `docs/issue-board.md` documenting how to build the board on GitHub (Projects, label-backed columns) and GitLab (Issue Board, label lists). Acceptance: running `bootstrap` twice is a no-op; docs show both platforms.
- **Wave 5 — `/launch`.** A `launch` skill + command: read issue body + comments via the CLI, `set-status building`, dispatch the existing `dispatch` worktree-agent flow with the brief, open PR(s) with `Closes #<id>`, schedule the default auto-merge cron; on failure add `needs-human`. Acceptance: launching a `status:ready` issue produces a PR linked to it and moves it to Building.
- **Wave 6 — `/capture` + `/backlog`.** `capture` creates a `status:idea` + `ai-driven` issue; `backlog` lists `status:ready` grouped by priority. Acceptance: round-trip an idea → appears in backlog after `/spec`.
- **Wave 7 — `/spec` + `/refine`.** `/spec` runs brainstorming with the issue body as the terminal artifact and flips to `status:ready`; `/refine` reads new comments, updates the body, replies with the diff summary. Acceptance: a comment instruction is reflected in the body and audit-logged.
- **Wave 8 *(later)* — CI-native triggers.** A scheduled workflow polling `list(status:ready)` (portable) plus an optional GitHub `issue_comment` trigger for refine. Acceptance: a ready issue is picked up without a local session.

---

## Self-review

**Spec coverage:** port + adapter + auditing + fake + CLI → Waves 2–3 (full). Label/lifecycle + invariants → Wave 2 (`tracker.py`) + Wave 4 (label creation). Flows/commands → Waves 5–7. Portability seam → Wave 8 + the runner/backend-env design in Wave 3. Testing strategy → Waves 2–3 tests. ADR-first → Wave 1. No spec section is unmapped.

**Placeholder scan:** Waves 1–3 contain complete code and exact commands. Waves 4–8 are intentionally scoped (not placeholder steps) per the reshape-later convention, with explicit acceptance criteria.

**Type consistency:** `Issue/Comment/IssueRef/Status/Priority` defined in `models.py` (2.1) and used unchanged in `tracker.py` (2.2), `memory.py` (2.2), `github.py` (3.1), `auditing.py` (3.2), `cli.py` (3.3). Primitive set (`create/get/list/update_body/comment/comments/add_label/remove_label/_close`) is identical across ABC, fake, adapter, and decorator. CLI verb names map 1:1 to port methods.
