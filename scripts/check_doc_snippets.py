"""Checks the code snippets in the repository's Markdown.

Every fenced `yaml`/`yml` and `json` block must parse: this repository's own rule
is that a snippet an agent pastes into a real CI file has to be valid.

With `--extract`, a YAML block that is a complete GitHub Actions workflow (has `on`
and `jobs`) is also written to `.snippet-workflows/`, so actionlint can check its
expressions and embedded shell as well. The directory is fixed on purpose: nothing
about where files are written comes from the command line.
"""

import json
import pathlib
import re
import sys

import yaml

# A fenced block nested under a list item is indented; the closing fence repeats the same indent.
FENCE = re.compile(r"^([ \t]*)```(yaml|yml|json)[^\n]*\n(.*?)^\1```[ \t]*$", re.MULTILINE | re.DOTALL)
SKIP_DIRS = {".git", "node_modules", ".snippet-workflows"}
EXTRACT_DIR = pathlib.Path(".snippet-workflows")


def is_workflow(document) -> bool:
    # PyYAML parses the bare key `on` as the boolean True.
    return isinstance(document, dict) and "jobs" in document and ("on" in document or True in document)


def iter_snippets():
    """Yield (path, line, language, body, index) for every checked fenced block."""
    for path in sorted(pathlib.Path(".").rglob("*.md")):
        if SKIP_DIRS & set(path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        for index, match in enumerate(FENCE.finditer(text)):
            line = text[: match.start()].count("\n") + 1
            indent, language, body = match.groups()
            if indent:
                body = re.sub(rf"^{re.escape(indent)}", "", body, flags=re.MULTILINE)
            yield path, line, language, body, index


def parse(language: str, body: str):
    return json.loads(body) if language == "json" else yaml.safe_load(body)


def main(argv: list[str]) -> int:
    extract = "--extract" in argv
    if extract:
        EXTRACT_DIR.mkdir(exist_ok=True)
    checked = failures = workflows = 0
    for path, line, language, body, index in iter_snippets():
        checked += 1
        try:
            document = parse(language, body)
        except (json.JSONDecodeError, yaml.YAMLError) as error:
            failures += 1
            print(f"FAIL {path}:{line} ({language} block): {error}", file=sys.stderr)
            continue
        if extract and language != "json" and is_workflow(document):
            workflows += 1
            (EXTRACT_DIR / f"{path.name}.{index}.yml").write_text(body, encoding="utf-8")
    print(f"Checked {checked} snippet(s), {failures} failure(s), extracted {workflows} workflow(s).")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
