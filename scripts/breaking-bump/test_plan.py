import json

import plan


def _round1():
    return {
        "a": ["mandatory: bump version pin"],
        "b": ["doc: update README version"],
        "c": ["opportunistic: adopt new API"],
        "dispositions": {"--force": "not used — 0 helm-flag hits"},
        "_amendments": {"removed": []},
    }


def test_identical_plans_ok():
    p = _round1()
    assert plan.assert_monotonic(p, dict(p)) == []


def test_added_disposition_ok():
    prev = _round1()
    new = _round1()
    new["dispositions"]["--create-pods"] = "not used — 0 hits"
    assert plan.assert_monotonic(prev, new) == []


def test_added_action_entry_ok():
    prev = _round1()
    new = _round1()
    new["a"].append("mandatory: another step")
    assert plan.assert_monotonic(prev, new) == []


def test_reworded_disposition_reason_same_key_ok():
    prev = _round1()
    new = _round1()
    new["dispositions"]["--force"] = "reworded: still not used"
    assert plan.assert_monotonic(prev, new) == []


def test_dropped_disposition_key_unaccounted_flagged():
    prev = _round1()
    new = _round1()
    del new["dispositions"]["--force"]
    assert plan.assert_monotonic(prev, new) == ["--force"]


def test_dropped_action_entry_unaccounted_flagged():
    prev = _round1()
    new = _round1()
    new["a"] = []
    assert plan.assert_monotonic(prev, new) == ["mandatory: bump version pin"]


def test_dropped_entry_recorded_in_amendments_ok():
    prev = _round1()
    new = _round1()
    del new["dispositions"]["--force"]
    new["_amendments"]["removed"] = [{"entry": "--force", "reason": "obsolete"}]
    assert plan.assert_monotonic(prev, new) == []


def test_empty_plans_no_raise():
    assert plan.assert_monotonic({}, {}) == []


def test_malformed_dispositions_string_no_raise():
    prev = {"a": ["x"], "dispositions": "oops not a dict"}
    new = {"a": ["x"]}
    assert plan.assert_monotonic(prev, new) == []


def test_sources_nonlist_and_nonstring_members_no_raise():
    prev = {"a": [1, "keep", None], "b": "not a list", "c": ["c-entry"]}
    new = {"a": ["keep"], "c": ["c-entry"]}
    assert plan.assert_monotonic(prev, new) == []


def test_entryless_round1_plan_no_raise():
    prev = {"a": [], "b": [], "c": []}
    new = {"a": [], "b": [], "c": []}
    assert plan.assert_monotonic(prev, new) == []


def test_load_plan_missing_returns_empty(tmp_path):
    assert plan.load_plan(str(tmp_path / "nope.json")) == {}


def test_load_plan_invalid_returns_empty(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{not json")
    assert plan.load_plan(str(p)) == {}


def test_load_plan_valid(tmp_path):
    p = tmp_path / "ok.json"
    p.write_text(json.dumps({"a": ["x"]}))
    assert plan.load_plan(str(p)) == {"a": ["x"]}


def test_entries_union():
    p = _round1()
    assert plan.entries(p) == {
        "--force",
        "mandatory: bump version pin",
        "doc: update README version",
        "opportunistic: adopt new API",
    }


def test_accounted_removals_filters_malformed():
    p = {"_amendments": {"removed": [{"entry": "x", "reason": "r"}, {"entry": 5}, "bad", None]}}
    assert plan.accounted_removals(p) == {"x"}


def test_multiple_drops_sorted():
    prev = {"a": ["zeta", "alpha"], "dispositions": {"mid": "r"}}
    new = {"a": []}
    assert plan.assert_monotonic(prev, new) == ["alpha", "mid", "zeta"]
