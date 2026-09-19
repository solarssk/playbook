"""Fails if any YAML file in the repository does not parse."""

import pathlib
import sys

import yaml

SKIP_DIRS = {".git", "node_modules"}


def main() -> int:
    failures = 0
    checked = 0
    for path in sorted(pathlib.Path(".").rglob("*")):
        if path.suffix not in {".yml", ".yaml"} or SKIP_DIRS & set(path.parts):
            continue
        checked += 1
        try:
            with path.open(encoding="utf-8") as handle:
                yaml.safe_load(handle)
        except yaml.YAMLError as error:
            failures += 1
            print(f"FAIL {path}: {error}", file=sys.stderr)
    print(f"Parsed {checked} YAML file(s), {failures} failure(s).")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
