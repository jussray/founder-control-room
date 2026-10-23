#!/usr/bin/env python3
"""Emit sanitized per-job exact-tuple receipt (job result is checked by GitHub needs gate)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from validate_portfolio_release import load_unique

KEYS = ("storyengine", "chiefAi", "sekretBip")
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, choices=KEYS)
    parser.add_argument("--status", required=True, choices=("success", "failure", "cancelled"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest, digest = load_unique(root / "releases/portfolio-v0.1.0.json")
    expected_digest = os.environ.get("EXPECTED_MANIFEST_SHA256", "")
    if digest != expected_digest:
        raise ValueError("job manifest digest differs from preflight")
    coordinator_head = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"],
        text=True, capture_output=True, check=True).stdout.strip()
    expected_head = os.environ.get("EXPECTED_COORDINATOR_HEAD_SHA", "")
    if coordinator_head != expected_head:
        raise ValueError("coordinator head changed")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    if not run_id.isdigit():
        raise ValueError("missing workflow run identity")
    repo = manifest["repositories"][args.repo]
    receipt = {"contract": "juss/portfolio-suite-receipt@v1",
        "release": manifest["release"], "manifestSha256": digest,
        "coordinatorHead": coordinator_head, "workflowRunId": run_id,
        "repository": repo["repository"], "commit": repo["commit"],
        "suite": args.repo, "status": args.status,
        "passed": args.status == "success", "fullRuntimeCompatibilityProven": False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as e:
        print("RECEIPT BLOCKED: " + str(e), file=sys.stderr)
        sys.exit(1)
