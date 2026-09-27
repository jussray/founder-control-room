#!/usr/bin/env python3
"""Fail-closed deployment candidate lease guard.

An exact approved candidate may remain deployable after main advances only when
all intervening paths match the repository's explicit non-deploying allowlist.
Unknown paths invalidate the candidate.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import pathlib
import re
import subprocess
import sys

SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def die(message: str) -> None:
    print(f"DEPLOY CANDIDATE INVALID: {message}", file=sys.stderr)
    raise SystemExit(1)


def git(*args: str) -> str:
    process = subprocess.run(["git", *args], text=True, capture_output=True, check=False)
    if process.returncode != 0:
        die(process.stderr.strip() or f"git {' '.join(args)} failed")
    return process.stdout.strip()


def load_policy(path: pathlib.Path) -> list[str]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        die(f"missing policy file: {path}")
    except json.JSONDecodeError as exc:
        die(f"invalid policy JSON: {exc}")

    if raw.get("version") != 1:
        die("unsupported policy version")
    if raw.get("policy") != "unknown-paths-invalidate-candidate":
        die("policy must remain fail-closed for unknown paths")

    globs = raw.get("safe_drift_globs")
    if not isinstance(globs, list) or not globs or not all(isinstance(item, str) and item for item in globs):
        die("safe_drift_globs must be a non-empty list of strings")
    return globs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate_sha")
    parser.add_argument("current_main_sha")
    parser.add_argument("--policy", default=".deployment-authority.json")
    args = parser.parse_args()

    candidate = args.candidate_sha.lower()
    current = args.current_main_sha.lower()
    if not SHA_RE.fullmatch(candidate):
        die("candidate SHA must be an exact lowercase 40-character commit SHA")
    if not SHA_RE.fullmatch(current):
        die("current main SHA must be an exact lowercase 40-character commit SHA")

    git("cat-file", "-e", f"{candidate}^{{commit}}")
    git("cat-file", "-e", f"{current}^{{commit}}")

    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", candidate, current],
        text=True,
        capture_output=True,
        check=False,
    )
    if ancestor.returncode != 0:
        die("approved candidate is not an ancestor of current main")

    safe_globs = load_policy(pathlib.Path(args.policy))
    changed = [
        line.strip()
        for line in git("diff", "--name-only", f"{candidate}..{current}").splitlines()
        if line.strip()
    ]
    unsafe = [
        path
        for path in changed
        if not any(fnmatch.fnmatchcase(path, pattern) for pattern in safe_globs)
    ]

    if unsafe:
        print("Deployment-sensitive drift detected:", file=sys.stderr)
        for path in unsafe:
            print(f"  - {path}", file=sys.stderr)
        die("main changed outside the explicit non-deploying allowlist; approve a new candidate")

    print(f"DEPLOY CANDIDATE VALID: {candidate}")
    print(f"CURRENT MAIN: {current}")
    if changed:
        print("SAFE DRIFT:")
        for path in changed:
            print(f"  - {path}")
    else:
        print("SAFE DRIFT: none")


if __name__ == "__main__":
    main()
