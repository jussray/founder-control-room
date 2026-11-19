#!/usr/bin/env python3
"""Fail closed on missing/mismatched run evidence. No release or deployment authority."""
import argparse
import json
import os
from pathlib import Path
import re
import sys

from portfolio_manifest_io import load_unique

KEYS = ("storyengine", "chiefAi", "sekretBip")
def expect(condition, message):
    if not condition:
        raise ValueError(message)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, default=Path("evidence"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest, digest = load_unique(root / "releases/portfolio-v0.1.0.json")
    run_id = os.environ.get("GITHUB_RUN_ID")
    head = os.environ.get("EXPECTED_COORDINATOR_HEAD_SHA")
    expected_digest = os.environ.get("EXPECTED_MANIFEST_SHA256")
    expect(bool(run_id and run_id.isdigit()), "workflow run ID missing")
    expect(bool(head and re.fullmatch(r"[0-9a-f]{40}", head)), "coordinator head missing")
    expect(expected_digest == digest, "manifest digest mismatch")
    for key in KEYS:
        path = args.evidence / (key + "-suite.json")
        receipt, _ = load_unique(path)
        selected = manifest["repositories"][key]
        expected = {
            "contract": "juss/portfolio-suite-receipt@v1",
            "release": manifest["release"],
            "manifestSha256": digest,
            "coordinatorHead": head,
            "workflowRunId": run_id,
            "repository": selected["repository"],
            "commit": selected["commit"],
            "suite": key,
            "status": "success",
            "passed": True,
            "fullRuntimeCompatibilityProven": False,
        }
        expect(receipt == expected, "invalid or stale test receipt for " + key)
    for mode in ("sources", "peers", "federation"):
        receipt, _ = load_unique(args.evidence / (mode + ".json"))
        expect(receipt.get("contract") == "juss/portfolio-candidate-evidence@v1",
            "invalid contract: " + mode)
        expect(receipt.get("mode") == mode and receipt.get("status") == "pass",
            "missing passing contract: " + mode)
        expect(receipt.get("release") == manifest["release"] and
            receipt.get("manifestSha256") == digest,
            "wrong release or digest: " + mode)
        expect(str(receipt.get("workflowRunId")) == run_id, "wrong workflow run: " + mode)
        expect(receipt.get("validatorCommit") == head, "wrong validator head: " + mode)
    print(json.dumps({"manifestSha256": digest, "workflowRunId": run_id,
        "coordinatorHead": head, "exactSuiteReceiptsVerified": list(KEYS),
        "exactContractReceiptsVerified": ["sources", "peers", "federation"],
        "runtimeCompatibilityTested": False,
        "promotionAuthorized": False}, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print("EVIDENCE GATE BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
