#!/usr/bin/env python3
"""Clone public, allowlisted portfolio sources by immutable SHA without credentials.

No branch pushes, environment credentials, or release actions.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from portfolio_manifest_io import load_unique

NAMES = {"storyengine": "StoryEngine", "chiefAi": "chief-ai-machine", "sekretBip": "Sekret-Bip"}

def git(*args, cwd=None):
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    p = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True,
        env=env, check=False, timeout=900)
    if p.returncode:
        raise ValueError("git command failed: " + " ".join(args[:3]) + " " +
                         (p.stderr.strip()[-600:] or str(p.returncode)))
    return p.stdout.strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=("all", *NAMES), default="all")
    parser.add_argument("--sources", type=Path, default=Path("sources"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest, digest = load_unique(root / "releases/portfolio-v0.1.0.json")
    policy, _ = load_unique(root / "release-policy/repositories.json")
    expected_digest = os.environ.get("EXPECTED_MANIFEST_SHA256")
    if expected_digest and expected_digest != digest:
        raise ValueError("manifest changed after preflight")
    keys = NAMES if args.only == "all" else {args.only: NAMES[args.only]}
    args.sources.mkdir(parents=True, exist_ok=True)
    receipts = []
    for key, dirname in keys.items():
        item = manifest["repositories"][key]
        identity = policy["repositories"].get(key)
        if identity != item["repository"] or identity != "jussray/" + dirname:
            raise ValueError("untrusted repository identity " + key)
        sha = item["commit"]
        if not re.fullmatch("[0-9a-f]{40}", sha):
            raise ValueError("invalid SHA: " + key)
        destination = args.sources / dirname
        if destination.exists():
            raise ValueError("source directory already exists: " + key)
        remote = "https://github.com/" + identity + ".git"
        git("clone", "--no-checkout", "--filter=blob:none",
            "--single-branch", "--branch", "main", remote, str(destination))
        git("checkout", "--detach", sha, cwd=destination)
        head = git("rev-parse", "HEAD", cwd=destination)
        if head != sha:
            raise ValueError("checkout SHA mismatch: " + key)
        receipts.append({"repository": identity, "selectedCommit": head})
    print(json.dumps({"manifestSha256": digest, "credentialFree": True,
        "selected": receipts, "runtimeCompatibilityTested": False}, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.TimeoutExpired) as e:
        print("EXACT CHECKOUT BLOCKED: " + str(e), file=sys.stderr)
        sys.exit(1)
