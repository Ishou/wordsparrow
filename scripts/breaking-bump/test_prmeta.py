"""Unit tests for prmeta — extracting dep/from/to + update-type from a Renovate PR."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import prmeta  # noqa: E402

# Verbatim shape of a real Renovate PR body (signoz PR #841): a 3-column table,
# a unicode arrow (→), and a dep cell carrying a second ([source](url)) link.
_BODY = """\
This PR contains the following updates:

| Package | Update | Change |
|---|---|---|
| [signoz](https://signoz.io/) ([source](https://redirect.github.com/SigNoz/charts)) | minor | `0.122.0` → `0.128.0` |

---

### Release Notes
...
"""

# A 4-column ASCII-arrow body (older/other Renovate shapes) must still parse.
_BODY_ASCII = """\
| Package | Type | Update | Change |
|---|---|---|---|
| [foo](https://example.com/foo) | helm | patch | `1.2.3` -> `1.2.4` |
"""


def test_parse_versions_real_renovate_unicode_arrow():
    dep, frm, to = prmeta.parse_versions(
        "chore(deps): update helm release signoz to v0.128.0", _BODY
    )
    assert dep == "signoz"
    assert frm == "0.122.0"
    assert to == "0.128.0"


def test_parse_versions_ascii_arrow_backward_compat():
    dep, frm, to = prmeta.parse_versions("chore(deps): update foo", _BODY_ASCII)
    assert (dep, frm, to) == ("foo", "1.2.3", "1.2.4")


def test_parse_versions_strips_v_prefix_in_table():
    body = _BODY.replace("`0.122.0` → `0.128.0`", "`v0.122.0` → `v0.128.0`")
    _, frm, to = prmeta.parse_versions("chore(deps): update signoz", body)
    assert frm == "v0.122.0"
    assert to == "v0.128.0"  # routing.parse_semver normalises the prefix downstream


def test_parse_versions_returns_none_without_table():
    assert prmeta.parse_versions("chore(deps): update signoz", "no table here") is None


def test_parse_versions_returns_none_for_lockfile_pr():
    body = "| Package | Change |\n|---|---|\n| lockfile maintenance | |\n"
    assert prmeta.parse_versions("chore(deps): lock file maintenance", body) is None


def test_update_type_label_reads_authoritative_label():
    assert prmeta.update_type_label(["dependencies", "update:minor"]) == "minor"
    assert prmeta.update_type_label(["update:major", "security"]) == "major"


def test_update_type_label_absent_returns_none():
    assert prmeta.update_type_label(["dependencies"]) is None
