import pathlib
import runpy
import sys

import pytest

import check_doc_snippets as cds

SCRIPT = pathlib.Path(__file__).parent / "check_doc_snippets.py"


# --- parse_fence_open -------------------------------------------------------

def test_parse_fence_open_plain_backtick_fence():
    assert cds.parse_fence_open("```yaml") == ("", "```", "yaml")


def test_parse_fence_open_indented_fence():
    assert cds.parse_fence_open("  ```yaml") == ("  ", "```", "yaml")


def test_parse_fence_open_tilde_fence_with_no_language():
    assert cds.parse_fence_open("~~~") == ("", "~~~", "")


def test_parse_fence_open_rejects_short_marker():
    assert cds.parse_fence_open("``") is None
    assert cds.parse_fence_open("~~") is None


def test_parse_fence_open_rejects_backtick_in_backtick_info_string():
    assert cds.parse_fence_open("```yaml `inline`") is None


def test_parse_fence_open_allows_backtick_in_tilde_info_string():
    # Only backtick fences forbid a backtick in the info string.
    assert cds.parse_fence_open("~~~ `yaml`") == ("", "~~~", "`yaml`")


def test_parse_fence_open_ignores_non_fence_lines():
    assert cds.parse_fence_open("just some text") is None
    assert cds.parse_fence_open("") is None


# --- Fence.closed_by / Fence.add --------------------------------------------

def test_fence_closed_by_same_marker():
    fence = cds.Fence(indent="", marker="```", language="yaml", start=1)
    assert fence.closed_by("```") is True


def test_fence_closed_by_longer_marker():
    fence = cds.Fence(indent="", marker="```", language="yaml", start=1)
    assert fence.closed_by("````") is True


def test_fence_not_closed_by_shorter_marker():
    fence = cds.Fence(indent="", marker="````", language="yaml", start=1)
    assert fence.closed_by("```") is False


def test_fence_not_closed_by_different_character():
    fence = cds.Fence(indent="", marker="```", language="yaml", start=1)
    assert fence.closed_by("~~~") is False


def test_fence_not_closed_by_ordinary_text():
    fence = cds.Fence(indent="", marker="```", language="yaml", start=1)
    assert fence.closed_by("key: value") is False


def test_fence_add_strips_indent():
    fence = cds.Fence(indent="  ", marker="```", language="yaml", start=1)
    fence.add("  key: value")
    fence.add("no-leading-indent")
    assert fence.body == ["key: value", "no-leading-indent"]


# --- iter_fences -------------------------------------------------------------

def test_iter_fences_yields_a_simple_block():
    text = "```yaml\nkey: 1\n```\n"
    fences = list(cds.iter_fences(text))
    assert len(fences) == 1
    assert fences[0].language == "yaml"
    assert fences[0].body == ["key: 1"]
    assert fences[0].start == 1


def test_iter_fences_ignores_an_unterminated_block():
    text = "```yaml\nkey: 1\n"
    assert list(cds.iter_fences(text)) == []


def test_iter_fences_four_backtick_fence_quotes_a_three_backtick_example():
    # A longer opening marker is only closed by a line with at least as many
    # backticks, so a real three-backtick example inside stays literal text.
    text = "````yaml\n```\nkey: 1\n```\n````\n"
    fences = list(cds.iter_fences(text))
    assert len(fences) == 1
    assert fences[0].language == "yaml"
    assert fences[0].body == ["```", "key: 1", "```"]


# --- is_workflow --------------------------------------------------------------

def test_is_workflow_true_for_a_real_workflow():
    document = cds.yaml.safe_load("on: push\njobs:\n  build: {}\n")
    assert cds.is_workflow(document) is True


def test_is_workflow_false_without_jobs():
    document = cds.yaml.safe_load("on: push\n")
    assert cds.is_workflow(document) is False


def test_is_workflow_false_for_a_non_mapping():
    assert cds.is_workflow(["a", "list"]) is False
    assert cds.is_workflow("a string") is False


def test_is_workflow_true_with_literal_true_key():
    # PyYAML parses a bare `on:` key as the boolean True.
    assert cds.is_workflow({True: "push", "jobs": {}}) is True


# --- iter_snippets -------------------------------------------------------------

def test_iter_snippets_only_yields_checked_languages_and_indexes_them(tmp_path, monkeypatch):
    doc = (
        "```python\nprint('skipped')\n```\n\n"
        "```yaml\nkey: 1\n```\n\n"
        "```python\nprint('skipped again')\n```\n\n"
        "```json\n{\"a\": 1}\n```\n"
    )
    (tmp_path / "doc.md").write_text(doc, encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    snippets = list(cds.iter_snippets())
    languages = [(language, index) for _path, _line, language, _body, index in snippets]
    assert languages == [("yaml", 0), ("json", 1)]


def test_iter_snippets_skips_configured_directories(tmp_path, monkeypatch):
    skipped = tmp_path / "node_modules"
    skipped.mkdir()
    (skipped / "doc.md").write_text("```yaml\nkey: 1\n```\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert list(cds.iter_snippets()) == []


# --- parse ----------------------------------------------------------------------

def test_parse_json():
    assert cds.parse("json", '{"a": 1}') == {"a": 1}


def test_parse_yaml():
    assert cds.parse("yaml", "a: 1\n") == {"a": 1}


# --- main -------------------------------------------------------------------------

def test_main_passes_with_valid_snippets(tmp_path, monkeypatch, capsys):
    (tmp_path / "doc.md").write_text("```yaml\nkey: 1\n```\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert cds.main([]) == 0
    out = capsys.readouterr().out
    assert "Checked 1 snippet(s), 0 failure(s), extracted 0 workflow(s)." in out


def test_main_fails_on_an_invalid_snippet(tmp_path, monkeypatch, capsys):
    (tmp_path / "doc.md").write_text("```json\n{not valid json}\n```\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert cds.main([]) == 1
    captured = capsys.readouterr()
    assert "Checked 1 snippet(s), 1 failure(s), extracted 0 workflow(s)." in captured.out
    assert "FAIL doc.md:1 (json block)" in captured.err


def test_main_extracts_only_yaml_workflows(tmp_path, monkeypatch, capsys):
    doc = (
        "```yaml\non: push\njobs:\n  build: {}\n```\n\n"
        "```yaml\nkey: not-a-workflow\n```\n\n"
        '```json\n{"on": "push", "jobs": {}}\n```\n'
    )
    (tmp_path / "doc.md").write_text(doc, encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert cds.main(["--extract"]) == 0
    out = capsys.readouterr().out
    assert "Checked 3 snippet(s), 0 failure(s), extracted 1 workflow(s)." in out

    extracted = list(cds.EXTRACT_DIR.glob("*"))
    assert len(extracted) == 1
    assert extracted[0].name == "doc.md.0.yml"
    assert extracted[0].read_text(encoding="utf-8") == "on: push\njobs:\n  build: {}\n"


def test_command_line_entry_point_exits_with_main_s_return_code(tmp_path, monkeypatch):
    (tmp_path / "doc.md").write_text("```json\n{not valid json}\n```\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["check_doc_snippets.py"])

    with pytest.raises(SystemExit) as exc_info:
        runpy.run_path(str(SCRIPT), run_name="__main__")
    assert exc_info.value.code == 1
