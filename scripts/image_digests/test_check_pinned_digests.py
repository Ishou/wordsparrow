"""Unit tests for the diff-based image tag/digest guard (no git/network needed)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import check_pinned_digests as guard  # noqa: E402


def test_deep_merge_override_wins_and_recurses():
    base = {"image": {"repository": "natsio/nats-box", "tag": "0.19.5", "digest": ""}}
    prod = {"image": {"digest": "sha256:aaa"}}
    assert guard.deep_merge(base, prod) == {
        "image": {"repository": "natsio/nats-box", "tag": "0.19.5", "digest": "sha256:aaa"}
    }


def test_find_images_includes_empty_digest():
    node = {"image": {"repository": "matomo", "tag": "5.11.1", "digest": ""}}
    assert list(guard.find_images(node)) == [("image", "matomo", "5.11.1", "")]


def _block(tag: str, digest: str) -> dict:
    return {"natsBox": {"image": {"repository": "natsio/nats-box", "tag": tag, "digest": digest}}}


def test_flags_tag_bumped_without_digest():
    # The exact no-op: tag 0.19.5 -> 0.19.7, digest left pointing at 0.19.5.
    base = _block("0.19.5", "sha256:old")
    head = _block("0.19.7", "sha256:old")
    problems = guard.diff_problems("infra/nats", base, head)
    assert len(problems) == 1
    assert "0.19.5 -> 0.19.7" in problems[0]


def test_ok_when_both_tag_and_digest_change():
    base = _block("0.19.5", "sha256:old")
    head = _block("0.19.7", "sha256:new")
    assert guard.diff_problems("infra/nats", base, head) == []


def test_ignores_frozen_pin_with_unchanged_tag():
    # nats:2.14-alpine case: tag unchanged, digest frozen to an older build — fine.
    base = _block("2.14-alpine", "sha256:frozen")
    head = _block("2.14-alpine", "sha256:frozen")
    assert guard.diff_problems("infra/nats", base, head) == []


def test_ignores_deploy_resolved_empty_digest():
    base = _block("5.11.1", "")
    head = _block("5.11.2", "")  # tag bumped, digest empty (resolved at deploy)
    assert guard.diff_problems("infra/nats", base, head) == []


def test_check_wires_readers_and_merges_base_and_prod(tmp_path):
    # tag in base values.yaml, digest in values-prod.yaml -> the merge reunites them.
    chart = tmp_path / "nats"
    chart.mkdir()
    (chart / "values.yaml").write_text(
        "image:\n  repository: natsio/nats-box\n  tag: '0.19.7'\n  digest: ''\n"
    )
    (chart / "values-prod.yaml").write_text("image:\n  digest: 'sha256:old'\n")

    def base_reader(path: str) -> str | None:
        # Base ref had tag 0.19.5 with the same (now stale) prod digest.
        if path.endswith("values.yaml"):
            return "image:\n  repository: natsio/nats-box\n  tag: '0.19.5'\n  digest: ''\n"
        if path.endswith("values-prod.yaml"):
            return "image:\n  digest: 'sha256:old'\n"
        return None

    problems = guard.check("BASE", [str(tmp_path)], base_reader=base_reader)
    assert len(problems) == 1
    assert "0.19.5 -> 0.19.7" in problems[0]
