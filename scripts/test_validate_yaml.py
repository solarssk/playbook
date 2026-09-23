import pathlib
import runpy
import sys

import pytest

import validate_yaml

SCRIPT = pathlib.Path(__file__).parent / "validate_yaml.py"


def test_all_valid_yaml_passes(tmp_path, monkeypatch, capsys):
    (tmp_path / "a.yml").write_text("key: value\n", encoding="utf-8")
    (tmp_path / "b.yaml").write_text("- one\n- two\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert validate_yaml.main() == 0
    out = capsys.readouterr().out
    assert "Parsed 2 YAML file(s), 0 failure(s)." in out


def test_invalid_yaml_fails(tmp_path, monkeypatch, capsys):
    (tmp_path / "good.yml").write_text("key: value\n", encoding="utf-8")
    (tmp_path / "bad.yml").write_text("key: [unclosed\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert validate_yaml.main() == 1
    captured = capsys.readouterr()
    assert "Parsed 2 YAML file(s), 1 failure(s)." in captured.out
    assert "FAIL" in captured.err
    assert "bad.yml" in captured.err


def test_skip_dirs_are_not_checked(tmp_path, monkeypatch, capsys):
    broken_in_git = tmp_path / ".git" / "nested"
    broken_in_git.mkdir(parents=True)
    (broken_in_git / "broken.yml").write_text("key: [unclosed\n", encoding="utf-8")
    broken_in_modules = tmp_path / "node_modules" / "pkg"
    broken_in_modules.mkdir(parents=True)
    (broken_in_modules / "broken.yaml").write_text(": :\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert validate_yaml.main() == 0
    assert "Parsed 0 YAML file(s), 0 failure(s)." in capsys.readouterr().out


def test_non_yaml_files_are_ignored(tmp_path, monkeypatch, capsys):
    (tmp_path / "notes.md").write_text("# not yaml\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert validate_yaml.main() == 0
    assert "Parsed 0 YAML file(s), 0 failure(s)." in capsys.readouterr().out


def test_command_line_entry_point_exits_with_main_s_return_code(tmp_path, monkeypatch):
    (tmp_path / "bad.yml").write_text("key: [unclosed\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["validate_yaml.py"])

    with pytest.raises(SystemExit) as exc_info:
        runpy.run_path(str(SCRIPT), run_name="__main__")
    assert exc_info.value.code == 1
