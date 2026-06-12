"""Unit tests for prmeta — extracting dep/from/to + update-type from a Renovate PR."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import prmeta  # noqa: E402

# A real-shaped Renovate PR body: the version table is the authoritative source.
_BODY = """\
This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| [signoz](https://github.com/SigNoz/charts) | helm | minor | `0.122.0` -> `0.128.0` |

---

### Release Notes
...
"""


def test_parse_versions_from_body_table():
    dep, frm, to = prmeta.parse_versions(
        "chore(deps): update helm release signoz to v0.128.0", _BODY
    )
    assert dep == "signoz"
    assert frm == "0.122.0"
    assert to == "0.128.0"


def test_parse_versions_strips_v_prefix_in_table():
    body = _BODY.replace("`0.122.0` -> `0.128.0`", "`v0.122.0` -> `v0.128.0`")
    _, frm, to = prmeta.parse_versions("chore(deps): update signoz", body)
    assert frm == "v0.122.0"
    assert to == "v0.128.0"  # routing.parse_semver normalises the prefix downstream


def test_parse_versions_returns_none_without_table():
    assert prmeta.parse_versions("chore(deps): update signoz", "no table here") is None


def test_update_type_label_reads_authoritative_label():
    assert prmeta.update_type_label(["dependencies", "update:minor"]) == "minor"
    assert prmeta.update_type_label(["update:major", "security"]) == "major"


def test_update_type_label_absent_returns_none():
    assert prmeta.update_type_label(["dependencies"]) is None
