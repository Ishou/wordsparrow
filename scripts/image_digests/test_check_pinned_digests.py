"""Unit tests for the image tag/digest guard (no registry/network needed)."""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))

import check_pinned_digests as guard  # noqa: E402


def test_deep_merge_override_wins_and_recurses():
    base = {"image": {"repository": "natsio/nats-box", "tag": "0.19.5", "digest": ""}}
    prod = {"image": {"digest": "sha256:aaa"}}
    assert guard.deep_merge(base, prod) == {
        "image": {"repository": "natsio/nats-box", "tag": "0.19.5", "digest": "sha256:aaa"}
    }


def test_find_pinned_images_skips_empty_digest():
    # Deploy-time-resolved images (digest: "") are not pins — skip them.
    node = {"image": {"repository": "matomo", "tag": "5.11.1", "digest": ""}}
    assert list(guard.find_pinned_images(node)) == []


def test_find_pinned_images_finds_nested_pins():
    node = {
        "natsBox": {"image": {"repository": "natsio/nats-box", "tag": "0.19.5", "digest": "sha256:box"}},
        "exporter": {"image": {"repository": "natsio/prometheus-nats-exporter", "tag": "0.15.0", "digest": "sha256:exp"}},
    }
    found = {(repo, tag, digest) for _, repo, tag, digest in guard.find_pinned_images(node)}
    assert found == {
        ("natsio/nats-box", "0.19.5", "sha256:box"),
        ("natsio/prometheus-nats-exporter", "0.15.0", "sha256:exp"),
    }


def _write_chart(tmp_path: Path, values: dict, prod: dict | None = None) -> Path:
    chart = tmp_path / "nats"
    chart.mkdir()
    (chart / "values.yaml").write_text(yaml.safe_dump(values))
    if prod is not None:
        (chart / "values-prod.yaml").write_text(yaml.safe_dump(prod))
    return tmp_path


def test_check_passes_when_digest_matches(tmp_path):
    # tag lives in base values, digest in the prod override — the merge reunites them.
    root = _write_chart(
        tmp_path,
        values={"image": {"repository": "natsio/nats-box", "tag": "0.19.5", "digest": ""}},
        prod={"image": {"digest": "sha256:correct"}},
    )
    problems = guard.check([root], resolve=lambda image: "sha256:correct")
    assert problems == []


def test_check_flags_stale_digest_after_tag_bump(tmp_path):
    # Tag bumped to 0.19.7 but the pinned (prod) digest still points at 0.19.5 -> the no-op.
    root = _write_chart(
        tmp_path,
        values={"image": {"repository": "natsio/nats-box", "tag": "0.19.7", "digest": ""}},
        prod={"image": {"digest": "sha256:old-0.19.5"}},
    )
    problems = guard.check([root], resolve=lambda image: "sha256:new-0.19.7")
    assert len(problems) == 1
    assert "stale" in problems[0] or "registry digest" in problems[0]
