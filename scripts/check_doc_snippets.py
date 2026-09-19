"""Checks the code snippets in the repository's Markdown.

Every fenced `yaml`/`yml` and `json` block must parse: this repository's own rule
is that a snippet an agent pastes into a real CI file has to be valid. Fences are
read as CommonMark defines them: a run of three or more backticks or tildes opens a
block (indented, when nested under a list item), and only a line holding a run of
the same character, at least as long, closes it. Content inside a fence is never
scanned for further fences, so a four-backtick block can quote a three-backtick one.

With `--extract`, a YAML block that is a complete GitHub Actions workflow (has `on`
and `jobs`) is also written to `.snippet-workflows/`, so actionlint can check its
expressions and embedded shell as well. The directory is fixed on purpose: nothing
about where files are written comes from the command line.
"""

import json
import pathlib
import re
import sys
from dataclasses import dataclass, field

import yaml

FENCE_CLOSE = re.compile(r"^[ \t]*(`{3,}|~{3,})[ \t]*$")
CHECKED_LANGUAGES = {"yaml", "yml", "json"}
SKIP_DIRS = {".git", "node_modules", ".snippet-workflows"}
EXTRACT_DIR = pathlib.Path(".snippet-workflows")


@dataclass
class Fence:
    indent: str
    marker: str
    language: str
    start: int
    body: list = field(default_factory=list)

    def closed_by(self, line: str) -> bool:
        closing = FENCE_CLOSE.match(line)
        return bool(closing) and closing.group(1)[0] == self.marker[0] and len(closing.group(1)) >= len(self.marker)

    def add(self, line: str) -> None:
        self.body.append(line[len(self.indent):] if line.startswith(self.indent) else line.lstrip())


def parse_fence_open(line: str):
    """Return (indent, marker, language) if `line` opens a fence, else None.

    Indentation is accepted at any depth, unlike in verify-lib: this scanner validates examples
    nested under list items, whose fences are indented to the item's content. The info string of
    a backtick fence may not contain a backtick.
    """
    stripped = line.lstrip(" \t")
    if not stripped or stripped[0] not in "`~":
        return None
    marker = stripped[: len(stripped) - len(stripped.lstrip(stripped[0]))]
    info = stripped[len(marker):]
    if len(marker) < 3 or (marker[0] == "`" and "`" in info):
        return None
    words = info.split()
    return line[: len(line) - len(stripped)], marker, (words[0].lower() if words else "")


def iter_fences(text: str):
    """Yield every closed fenced block in a Markdown document."""
    fence = None
    for number, line in enumerate(text.splitlines(), start=1):
        if fence is None:
            opened = parse_fence_open(line)
            if opened:
                fence = Fence(*opened, number)
        elif fence.closed_by(line):
            yield fence
            fence = None
        else:
            fence.add(line)


def is_workflow(document) -> bool:
    # PyYAML parses the bare key `on` as the boolean True.
    return isinstance(document, dict) and "jobs" in document and ("on" in document or True in document)


def iter_snippets():
    """Yield (path, line, language, body, index) for every checked fenced block."""
    for path in sorted(pathlib.Path(".").rglob("*.md")):
        if SKIP_DIRS & set(path.parts):
            continue
        checked = [f for f in iter_fences(path.read_text(encoding="utf-8")) if f.language in CHECKED_LANGUAGES]
        for index, fence in enumerate(checked):
            yield path, fence.start, fence.language, "\n".join(fence.body) + "\n", index


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
