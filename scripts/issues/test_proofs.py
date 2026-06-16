from __future__ import annotations

from proofs import check_citations, check_placeholders, run_all


def test_citation_to_a_real_line_passes(tmp_path):
    (tmp_path / "dir").mkdir()
    (tmp_path / "dir" / "f.yaml").write_text("a\nb\nc\n")
    assert check_citations("see `dir/f.yaml:2` for the wiring", tmp_path) == []


def test_citation_to_a_missing_file_is_flagged(tmp_path):
    problems = check_citations("mirrors .github/workflows/image-digest-guard.yml:32", tmp_path)
    assert len(problems) == 1
    assert "image-digest-guard.yml:32" in problems[0].detail
    assert "does not exist" in problems[0].detail


def test_citation_past_end_of_file_is_flagged(tmp_path):
    (tmp_path / "dir").mkdir()
    (tmp_path / "dir" / "f.yaml").write_text("a\nb\n")
    problems = check_citations("dir/f.yaml:99", tmp_path)
    assert len(problems) == 1 and "only 2 lines" in problems[0].detail


def test_bare_filename_citation_without_a_directory_is_flagged(tmp_path):
    problems = check_citations("mirrors image-digest-guard.yml:32 (confirmed)", tmp_path)
    assert len(problems) == 1 and "image-digest-guard.yml:32" in problems[0].detail


def test_bare_real_filename_citation_passes(tmp_path):
    (tmp_path / "values.yaml").write_text("a\nb\nc\n")
    assert check_citations("see values.yaml:2", tmp_path) == []


def test_times_versions_and_host_ports_are_not_citations(tmp_path):
    assert check_citations("at 12:30, python 3.14.6, host.com:443, ratio 5:1", tmp_path) == []


def test_bare_path_without_line_is_not_checked(tmp_path):
    # a proposed new file is named without a line number — not a citation.
    assert check_citations("create scripts/cnpg_image_sync/check.py", tmp_path) == []


def test_placeholders_are_flagged_but_unvalidated_is_not():
    assert [p.detail for p in check_placeholders("- TODO: wire it\n- UNVALIDATED — confirm X")] \
        == ["left-in marker 'TODO'"]


def test_run_all_aggregates(tmp_path):
    kinds = {p.kind for p in run_all("TODO fix nonexistent/a.py:3", tmp_path)}
    assert kinds == {"placeholder", "citation"}
