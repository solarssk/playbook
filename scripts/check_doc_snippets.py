"""Checks the code snippets in the repository's Markdown.

Every fenced `yaml`/`yml` and `json` block must parse: this repository's own rule
is that a snippet an agent pastes into a real CI file has to be valid. A YAML
block that is a complete GitHub Actions workflow (has `on` and `jobs`) is also
written out under the directory given as the first argument, so actionlint can
check its expressions and embedded shell as well.
"""

import json
import pathlib
import re
import sys

import yaml

FENCE = re.compile(r"^```(yaml|yml|json)[^\n]*\n(.*?)^```[ \t]*$", re.MULTILINE | re.DOTALL)
SKIP_DIRS = {".git", "node_modules"}


def is_workflow(document) -> bool:
    # PyYAML parses the bare key `on` as the boolean True.
    return isinstance(document, dict) and "jobs" in document and ("on" in document or True in document)


def main() -> int:
    out_dir = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
    failures = 0
    checked = 0
    workflows = 0
    for path in sorted(pathlib.Path(".").rglob("*.md")):
        if SKIP_DIRS & set(path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        for index, match in enumerate(FENCE.finditer(text)):
            language, body = match.group(1), match.group(2)
            line = text[: match.start()].count("\n") + 1
            checked += 1
            try:
                document = json.loads(body) if language == "json" else yaml.safe_load(body)
            except (json.JSONDecodeError, yaml.YAMLError) as error:
                failures += 1
                print(f"FAIL {path}:{line} ({language} block): {error}", file=sys.stderr)
                continue
            if out_dir and language != "json" and is_workflow(document):
                workflows += 1
                (out_dir / f"{path.name}.{index}.yml").write_text(body, encoding="utf-8")
    print(f"Checked {checked} snippet(s), {failures} failure(s), extracted {workflows} workflow(s).")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
