"""Deterministic registry resolution + sub-chart discovery + fetch-and-enumerate (ADR-0068 W2)."""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import yaml

# A registry release-listing line links each real tag; we parse what EXISTS, never increment.
_TAG_HREF = re.compile(r'/releases/tag/([A-Za-z0-9._-]+)')


@dataclass(frozen=True)
class FetchResult:
    url: str
    status: int
    body: str


Fetcher = Callable[[str], FetchResult]


def load_registry(path: str | Path) -> dict:
    """Parse tools-upgrade-sources.yaml into a dict (modeA/modeB lists)."""
    return yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}


def resolve_entry(registry: dict, dep: str) -> dict | None:
    """Return the modeA registry entry for `dep`, or None if unregistered."""
    for entry in registry.get("modeA") or []:
        if entry.get("name") == dep:
            return entry
    return None


def discover_subcharts(chart_yaml_text: str) -> list[dict]:
    """Return [{name, version}] from Chart.yaml dependencies; version is the chart's declared pin."""
    chart = yaml.safe_load(chart_yaml_text or "") or {}
    deps = chart.get("dependencies") or []
    return [{"name": d["name"], "version": d.get("version")}
            for d in deps if isinstance(d, dict) and d.get("name")]


def _parse_version(tag: str) -> tuple[int, ...]:
    """Numeric-tuple key for a dotted version (non-numeric segments sort as -1)."""
    parts = []
    for seg in tag.split("."):
        parts.append(int(seg) if seg.isdigit() else -1)
    return tuple(parts)


def enumerate_tags_in_range(listing_body: str, prefix: str, from_v: str, to_v: str) -> list[str]:
    """Return tags from the releases listing that fall in (from_v, to_v]; never arithmetic."""
    found: set[str] = set()
    for raw in _TAG_HREF.findall(listing_body):
        if raw.startswith(prefix):
            found.add(raw[len(prefix):])
    lo, hi = _parse_version(from_v), _parse_version(to_v)
    in_range = [v for v in found if lo < _parse_version(v) <= hi]
    return sorted(in_range, key=_parse_version)


def _listing_url(template: str) -> str:
    """Strip the tag path from a GitHub per-tag URL to reach the /releases listing."""
    base = template.split("{version}")[0].rstrip("-/")
    return re.sub(r"/tag/[^/]+$", "", base).rstrip("/") or base


def _status_label(status: int) -> str:
    """Map an HTTP status to a provenance-friendly outcome (notFound != fetchFail)."""
    if status == 200:
        return "ok"
    if status == 404:
        return "notFound"
    return "fetchFail"


def _slug(url: str) -> str:
    """Filesystem-safe slug for an on-disk fetched-body filename."""
    return re.sub(r"[^A-Za-z0-9._-]+", "-", url).strip("-")[:120] or "doc"


def _fetch_and_record(url: str, doc_type: str, fetch: Fetcher,
                      sources: list, fetched: list, seen: set) -> None:
    """Fetch one registered URL, append a registry-stamped source + body pointer."""
    if url in seen:
        return
    seen.add(url)
    res = fetch(url)
    label = _status_label(res.status)
    sources.append({
        "url": url,
        "type": doc_type,
        "fetchedOk": label == "ok",
        "status": label,
        "provenance": "registry",
    })
    fetched.append({"url": url, "slug": _slug(url), "fetchedOk": label == "ok", "body": res.body})


def _resolve_dep(registry: dict, dep: str, from_v: str, to_v: str, fetch: Fetcher,
                 sources: list, fetched: list, seen: set) -> None:
    """Resolve one dep's registered templates, range-walk releases, fetch each."""
    entry = resolve_entry(registry, dep)
    if entry is None:
        return
    release_tmpl = entry.get("releaseNotes")
    if release_tmpl and "{version}" in release_tmpl:
        listing = _listing_url(release_tmpl)
        listing_res = fetch(listing)
        tag_suffix = release_tmpl.split("/tag/", 1)[1] if "/tag/" in release_tmpl else f"{dep}-"
        prefix = tag_suffix.split("{version}")[0]
        for tag in enumerate_tags_in_range(listing_res.body, prefix, from_v, to_v):
            _fetch_and_record(release_tmpl.format(version=tag), "release", fetch,
                              sources, fetched, seen)
    elif release_tmpl:
        _fetch_and_record(release_tmpl, "release", fetch, sources, fetched, seen)
    if entry.get("extraDocs"):
        _fetch_and_record(entry["extraDocs"], "migration-guide", fetch, sources, fetched, seen)


def _resolve_subchart(registry: dict, name: str, version: str | None, fetch: Fetcher,
                      sources: list, fetched: list, seen: set) -> None:
    """Resolve a bundled sub-chart at its single pinned version (no range-walk)."""
    entry = resolve_entry(registry, name)
    if entry is None:
        return
    release_tmpl = entry.get("releaseNotes")
    if release_tmpl and "{version}" in release_tmpl and version:
        _fetch_and_record(release_tmpl.format(version=version), "release", fetch,
                          sources, fetched, seen)
    elif release_tmpl and "{version}" not in release_tmpl:
        _fetch_and_record(release_tmpl, "release", fetch, sources, fetched, seen)
    if entry.get("extraDocs"):
        _fetch_and_record(entry["extraDocs"], "migration-guide", fetch, sources, fetched, seen)


def build_manifest(registry: dict, dep: str, from_v: str, to_v: str, fetch: Fetcher,
                   chart_yaml_text: str | None = None) -> dict:
    """Assemble the registry manifest: registry-stamped sources + fetched-body pointers."""
    sources: list = []
    fetched: list = []
    seen: set = set()
    _resolve_dep(registry, dep, from_v, to_v, fetch, sources, fetched, seen)
    subcharts: list[str] = []
    for sub in discover_subcharts(chart_yaml_text or ""):
        if resolve_entry(registry, sub["name"]):
            subcharts.append(sub["name"])
            _resolve_subchart(registry, sub["name"], sub.get("version"), fetch,
                              sources, fetched, seen)
    return {"dep": dep, "from": from_v, "to": to_v,
            "subcharts": subcharts, "sources": sources, "fetched": fetched}


def _http_fetch(url: str) -> FetchResult:
    """Live fetch wrapper (urllib). Only used by the CLI; tests inject a fake."""
    import urllib.error
    import urllib.request
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310
            return FetchResult(url=url, status=resp.status, body=resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        return FetchResult(url=url, status=exc.code, body="")
    except (urllib.error.URLError, OSError):
        return FetchResult(url=url, status=599, body="")


def main(argv: list[str] | None = None) -> int:
    """CLI: resolve+fetch a dep's registry docs, write bodies + manifest to disk."""
    import argparse

    p = argparse.ArgumentParser(prog="sources")
    p.add_argument("--registry", required=True)
    p.add_argument("--dep", required=True)
    p.add_argument("--from", dest="from_v", required=True)
    p.add_argument("--to", dest="to_v", required=True)
    p.add_argument("--chart")
    p.add_argument("--docs-dir", required=True)
    p.add_argument("--manifest", required=True)
    args = p.parse_args(argv)

    registry = load_registry(args.registry)
    chart_text = Path(args.chart).read_text(encoding="utf-8") if args.chart and Path(args.chart).exists() else None
    manifest = build_manifest(registry, args.dep, args.from_v, args.to_v, _http_fetch, chart_text)

    docs_dir = Path(args.docs_dir)
    docs_dir.mkdir(parents=True, exist_ok=True)
    for body in manifest["fetched"]:
        (docs_dir / f"{body['slug']}.md").write_text(body["body"], encoding="utf-8")
    out = {k: v for k, v in manifest.items() if k != "fetched"}
    out["fetched"] = [{"url": b["url"], "slug": b["slug"], "fetchedOk": b["fetchedOk"]}
                      for b in manifest["fetched"]]
    Path(args.manifest).write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"::notice::registry pre-step resolved {len(manifest['sources'])} source(s) for {args.dep}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
