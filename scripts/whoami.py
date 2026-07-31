#!/usr/bin/env python3
"""Founder Control Room identity and repository truth snapshot.

This command is intentionally read-only. It reports founder-safe identity context,
Python/runtime details, and Git repository state without printing secrets or raw
tokens. It never executes a shell and never mutates the repository.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence


REDACTED = "[redacted]"
SENSITIVE_MARKERS = ("TOKEN", "SECRET", "PASSWORD", "KEY", "CREDENTIAL")


@dataclass(frozen=True)
class RepositorySnapshot:
    root: str | None
    branch: str | None
    head: str | None
    dirty: bool | None


@dataclass(frozen=True)
class WhoAmISnapshot:
    schema_version: int
    display_name: str
    role: str
    email: str | None
    environment: str
    python_version: str
    platform: str
    repository: RepositorySnapshot


def _run_git(args: Sequence[str], cwd: Path) -> str | None:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None
    return completed.stdout.strip()


def repository_snapshot(cwd: Path | None = None) -> RepositorySnapshot:
    current = (cwd or Path.cwd()).resolve()
    root_text = _run_git(["rev-parse", "--show-toplevel"], current)
    if not root_text:
        return RepositorySnapshot(root=None, branch=None, head=None, dirty=None)

    root = Path(root_text).resolve()
    branch = _run_git(["branch", "--show-current"], root) or None
    head = _run_git(["rev-parse", "HEAD"], root) or None
    status = _run_git(["status", "--porcelain"], root)
    dirty = None if status is None else bool(status)

    return RepositorySnapshot(root=str(root), branch=branch, head=head, dirty=dirty)


def safe_environment_value(name: str, default: str) -> str:
    upper_name = name.upper()
    if any(marker in upper_name for marker in SENSITIVE_MARKERS):
        return REDACTED
    value = os.getenv(name, default).strip()
    return value or default


def build_snapshot(*, include_email: bool = False, cwd: Path | None = None) -> WhoAmISnapshot:
    email = os.getenv("FOUNDER_EMAIL", "").strip() or None
    if not include_email:
        email = None

    return WhoAmISnapshot(
        schema_version=1,
        display_name=safe_environment_value("FOUNDER_DISPLAY_NAME", "Juss"),
        role=safe_environment_value("FOUNDER_ROLE", "Founder"),
        email=email,
        environment=safe_environment_value("CONTROL_ROOM_ENV", "local"),
        python_version=platform.python_version(),
        platform=platform.platform(),
        repository=repository_snapshot(cwd),
    )


def validate_expectations(
    snapshot: WhoAmISnapshot,
    *,
    expected_repo: str | None,
    expected_head: str | None,
) -> list[str]:
    errors: list[str] = []
    repository = snapshot.repository

    if expected_repo:
        actual_name = Path(repository.root).name if repository.root else None
        if actual_name != expected_repo:
            errors.append(f"expected repository {expected_repo!r}, found {actual_name!r}")

    if expected_head and repository.head != expected_head:
        errors.append(f"expected HEAD {expected_head!r}, found {repository.head!r}")

    return errors


def render_text(snapshot: WhoAmISnapshot) -> str:
    repository = snapshot.repository
    lines = [
        f"Who: {snapshot.display_name}",
        f"Role: {snapshot.role}",
        f"Environment: {snapshot.environment}",
        f"Python: {snapshot.python_version}",
        f"Platform: {snapshot.platform}",
        f"Repository: {repository.root or 'not detected'}",
        f"Branch: {repository.branch or 'not detected'}",
        f"HEAD: {repository.head or 'not detected'}",
        f"Dirty: {repository.dirty if repository.dirty is not None else 'unknown'}",
    ]
    if snapshot.email:
        lines.insert(2, f"Email: {snapshot.email}")
    return "\n".join(lines)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Show founder and repository identity truth.")
    parser.add_argument("--json", action="store_true", help="Emit structured JSON.")
    parser.add_argument(
        "--include-email",
        action="store_true",
        help="Include FOUNDER_EMAIL. Omitted by default to reduce accidental PII exposure.",
    )
    parser.add_argument("--expected-repo", help="Fail unless the detected repository name matches.")
    parser.add_argument("--expected-head", help="Fail unless the detected Git HEAD matches exactly.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    snapshot = build_snapshot(include_email=args.include_email)
    errors = validate_expectations(
        snapshot,
        expected_repo=args.expected_repo,
        expected_head=args.expected_head,
    )

    if args.json:
        payload = asdict(snapshot)
        payload["ok"] = not errors
        payload["errors"] = errors
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_text(snapshot))
        if errors:
            print("\nExpectation failures:", file=sys.stderr)
            for error in errors:
                print(f"- {error}", file=sys.stderr)

    return 0 if not errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
