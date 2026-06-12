"""Unit tests for sources.py: registry resolution, sub-chart discovery, range enumeration. No network."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import sources  # noqa: E402

# A fixture registry mirroring infra/tools-upgrade-sources.yaml's shape.
REGISTRY = {
    "modeA": [
        {
            "name": "signoz",
            "repo": "https://charts.signoz.io",
            "releaseNotes": "https://github.com/SigNoz/charts/releases/tag/signoz-{version}",
            "extraDocs": "https://signoz.io/docs/operate/migration/",
        },
        {
            "name": "k8s-infra",
            "repo": "https://charts.signoz.io",
            "releaseNotes": "https://github.com/SigNoz/charts/releases/tag/k8s-infra-{version}",
        },
        {
            # Floating-pin entry: releaseNotes has no {version} placeholder — fetch verbatim once, no range-walk.
            "name": "nats",
            "releaseNotes": "https://github.com/nats-io/nats-server/releases",
            "extraDocs": "https://docs.nats.io/release-notes/whats_new",
        },
    ]
}

# A fixture Chart.yaml: the signoz umbrella bundles k8s-infra as a dependency.
CHART_YAML = """\
apiVersion: v2
name: signoz
version: 0.128.0
dependencies:
  - name: k8s-infra
    version: 0.16.0
    repository: https://charts.signoz.io
  - name: clickhouse
    version: 24.1.2
    repository: https://charts.signoz.io
"""

# Fixture releases-listing with a gap (no 0.123) + patches (0.126.1/0.127.1) — the arithmetic-increment trap.
SIGNOZ_LISTING = """\
<a href="/SigNoz/charts/releases/tag/signoz-0.121.0">signoz-0.121.0</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.122.0">signoz-0.122.0</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.124.0">signoz-0.124.0</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.126.0">signoz-0.126.0</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.126.1">signoz-0.126.1</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.127.0">signoz-0.127.0</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.127.1">signoz-0.127.1</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.128.0">signoz-0.128.0</a>
<a href="/SigNoz/charts/releases/tag/signoz-0.130.0">signoz-0.130.0</a>
"""

K8S_INFRA_LISTING = """\
<a href="/SigNoz/charts/releases/tag/k8s-infra-0.14.0">k8s-infra-0.14.0</a>
<a href="/SigNoz/charts/releases/tag/k8s-infra-0.16.0">k8s-infra-0.16.0</a>
"""


def make_fetch(responses):
    """Build an injectable fetcher. `responses` maps url -> (status, body)."""
    calls = []

    def fetch(url):
        calls.append(url)
        status, body = responses.get(url, (404, ""))
        return sources.FetchResult(url=url, status=status, body=body)

    fetch.calls = calls
    return fetch


# --- resolution -------------------------------------------------------------

def test_resolve_entry_finds_signoz():
    entry = sources.resolve_entry(REGISTRY, "signoz")
    assert entry is not None
    assert entry["releaseNotes"] == "https://github.com/SigNoz/charts/releases/tag/signoz-{version}"


def test_resolve_entry_missing_dep_is_none():
    assert sources.resolve_entry(REGISTRY, "no-such-dep") is None


# --- sub-chart discovery ----------------------------------------------------

def test_discover_subcharts_reads_chart_yaml_dependencies():
    subs = sources.discover_subcharts(CHART_YAML)
    names = {s["name"]: s["version"] for s in subs}
    assert names["k8s-infra"] == "0.16.0"  # the bundled pin, not the umbrella's range
    assert "clickhouse" in names


def test_discover_subcharts_only_registered_ones_resolve():
    # k8s-infra is registered; clickhouse is not -> only k8s-infra contributes docs.
    subs = sources.discover_subcharts(CHART_YAML)
    registered = [s["name"] for s in subs if sources.resolve_entry(REGISTRY, s["name"])]
    assert registered == ["k8s-infra"]


def test_discover_subcharts_empty_when_no_dependencies():
    assert sources.discover_subcharts("apiVersion: v2\nname: solo\n") == []


# --- fetch-and-enumerate — never arithmetic ---------------------------------

def test_enumerate_tags_parses_real_tags_in_range_with_gap():
    # 0.122 -> 0.128: the REAL sequence skips 0.123 and includes patches.
    tags = sources.enumerate_tags_in_range(SIGNOZ_LISTING, "signoz-", "0.122.0", "0.128.0")
    assert tags == ["0.124.0", "0.126.0", "0.126.1", "0.127.0", "0.127.1", "0.128.0"]
    assert "0.123.0" not in tags  # arithmetic increment would emit this non-existent tag


def test_enumerate_tags_excludes_out_of_range():
    tags = sources.enumerate_tags_in_range(SIGNOZ_LISTING, "signoz-", "0.122.0", "0.128.0")
    assert "0.121.0" not in tags  # below FROM
    assert "0.130.0" not in tags  # above TO


# --- manifest assembly: every entry provenance=registry ---------------------

def test_build_manifest_stamps_every_entry_registry():
    listing = "https://github.com/SigNoz/charts/releases"
    responses = {
        listing: (200, SIGNOZ_LISTING),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.124.0": (200, "v124"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.0": (200, "v126"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.1": (200, "v126.1"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.0": (200, "v127"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.1": (200, "v127.1"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.128.0": (200, "v128"),
        "https://signoz.io/docs/operate/migration/": (200, "migration guide"),
    }
    manifest = sources.build_manifest(
        REGISTRY, "signoz", "0.122.0", "0.128.0", make_fetch(responses)
    )
    assert manifest["sources"], "manifest must contain registry sources"
    assert all(s["provenance"] == "registry" for s in manifest["sources"])


def test_build_manifest_enumerated_release_urls_match_real_tags():
    listing = "https://github.com/SigNoz/charts/releases"
    responses = {
        listing: (200, SIGNOZ_LISTING),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.124.0": (200, "v124"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.0": (200, "v126"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.1": (200, "v126.1"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.0": (200, "v127"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.1": (200, "v127.1"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.128.0": (200, "v128"),
        "https://signoz.io/docs/operate/migration/": (200, "migration guide"),
    }
    manifest = sources.build_manifest(
        REGISTRY, "signoz", "0.122.0", "0.128.0", make_fetch(responses)
    )
    release_urls = {s["url"] for s in manifest["sources"] if s["type"] == "release"}
    assert "https://github.com/SigNoz/charts/releases/tag/signoz-0.124.0" in release_urls
    assert "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.1" in release_urls
    # the non-existent arithmetic tag is never fetched
    assert "https://github.com/SigNoz/charts/releases/tag/signoz-0.123.0" not in release_urls


def test_build_manifest_discovers_subchart_via_chart_yaml():
    listing = "https://github.com/SigNoz/charts/releases"
    responses = {
        listing: (200, SIGNOZ_LISTING),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.124.0": (200, "v"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.0": (200, "v"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.1": (200, "v"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.0": (200, "v"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.1": (200, "v"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.128.0": (200, "v"),
        "https://github.com/SigNoz/charts/releases/tag/k8s-infra-0.16.0": (200, "k8s break"),
        "https://signoz.io/docs/operate/migration/": (200, "guide"),
    }
    manifest = sources.build_manifest(
        REGISTRY, "signoz", "0.122.0", "0.128.0", make_fetch(responses),
        chart_yaml_text=CHART_YAML,
    )
    urls = {s["url"] for s in manifest["sources"]}
    # the sub-chart's registered docs were resolved + fetched too
    assert "https://github.com/SigNoz/charts/releases/tag/k8s-infra-0.16.0" in urls
    assert manifest["subcharts"] == ["k8s-infra"]


def test_build_manifest_no_version_template_fetched_verbatim_once():
    # nats: releaseNotes has no {version} -> fetch verbatim once, do not range-walk.
    nats_releases = "https://github.com/nats-io/nats-server/releases"
    responses = {
        nats_releases: (200, "nats releases listing"),
        "https://docs.nats.io/release-notes/whats_new": (200, "whats new"),
    }
    fetch = make_fetch(responses)
    manifest = sources.build_manifest(REGISTRY, "nats", "2.10.1", "2.10.9", fetch)
    urls = [s["url"] for s in manifest["sources"]]
    assert nats_releases in urls
    # fetched exactly once, not once-per-synthetic-version
    assert fetch.calls.count(nats_releases) == 1


# --- 404 vs 502 handled distinctly -----------------------------------------

def test_build_manifest_404_is_not_found_502_is_fetch_fail():
    listing = "https://github.com/SigNoz/charts/releases"
    responses = {
        listing: (200, SIGNOZ_LISTING),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.124.0": (404, ""),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.0": (502, ""),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.126.1": (200, "ok"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.0": (200, "ok"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.127.1": (200, "ok"),
        "https://github.com/SigNoz/charts/releases/tag/signoz-0.128.0": (200, "ok"),
        "https://signoz.io/docs/operate/migration/": (200, "guide"),
    }
    manifest = sources.build_manifest(
        REGISTRY, "signoz", "0.122.0", "0.128.0", make_fetch(responses)
    )
    by_url = {s["url"]: s for s in manifest["sources"]}
    not_found = by_url["https://github.com/SigNoz/charts/releases/tag/signoz-0.124.0"]
    fetch_fail = by_url["https://github.com/SigNoz/charts/releases/tag/signoz-0.126.0"]
    ok = by_url["https://github.com/SigNoz/charts/releases/tag/signoz-0.126.1"]
    assert not_found["fetchedOk"] is False
    assert not_found["status"] == "notFound"
    assert fetch_fail["fetchedOk"] is False
    assert fetch_fail["status"] == "fetchFail"
    assert ok["fetchedOk"] is True
    assert ok["status"] == "ok"


def test_build_manifest_includes_fetched_body_pointers():
    nats_releases = "https://github.com/nats-io/nats-server/releases"
    responses = {
        nats_releases: (200, "nats releases listing"),
        "https://docs.nats.io/release-notes/whats_new": (200, "whats new"),
    }
    manifest = sources.build_manifest(REGISTRY, "nats", "2.10.1", "2.10.9", make_fetch(responses))
    fetched = {b["url"]: b for b in manifest["fetched"]}
    assert fetched[nats_releases]["body"] == "nats releases listing"
    assert "slug" in fetched[nats_releases]


def test_build_manifest_empty_when_dep_unregistered():
    manifest = sources.build_manifest(REGISTRY, "ghost-dep", "1.0.0", "2.0.0", make_fetch({}))
    assert manifest["sources"] == []
    assert manifest["fetched"] == []
