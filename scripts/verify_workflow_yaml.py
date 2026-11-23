#!/usr/bin/env python3
"""Fail closed when a GitHub Actions workflow file is not parseable YAML.

GitHub rejects an invalid workflow at dispatch time, and no other check in this
repository parses workflow files, so a broken file can merge while every check
stays green. This guard parses each .github/workflows/*.yml and *.yaml with
yaml.safe_load and exits non-zero on any parse error, any unreadable file, or
an empty workflow set. It checks YAML syntax only; it does not validate the
GitHub Actions schema.

Usage: python3 scripts/verify_workflow_yaml.py [repo_root]
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml


WORKFLOW_SUFFIXES = (".yml", ".yaml")


def workflow_files(root: Path) -> list[Path]:
    directory = root / ".github" / "workflows"
    if not directory.is_dir():
        return []
    return sorted(
        path
        for path in directory.iterdir()
        if path.is_file() and path.suffix in WORKFLOW_SUFFIXES
    )


def parse_error(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return f"unreadable: {exc}"
    try:
        yaml.safe_load(text)
    except yaml.YAMLError as exc:
        return str(exc)
    return None


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path(".")
    files = workflow_files(root)
    if not files:
        print(
            "verify_workflow_yaml: no workflow files found under .github/workflows (failing closed)",
            file=sys.stderr,
        )
        return 1
    invalid = 0
    for path in files:
        error = parse_error(path)
        if error is not None:
            invalid += 1
            print(f"INVALID {path}: {error}", file=sys.stderr)
    print(f"verify_workflow_yaml: checked {len(files)} workflow file(s), {invalid} invalid")
    return 1 if invalid else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
