#!/usr/bin/env python3
"""Fail-closed release preflight: structural checks only; never authorizes publication."""
import hashlib
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


def load_unique(path):
    def no_duplicate_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key: " + key)
            result[key] = value
        return result

    raw = Path(path).read_bytes()
    if len(raw) > 65536:
        raise ValueError("input too large: " + str(path))
    return json.loads(raw, object_pairs_hook=no_duplicate_keys), hashlib.sha256(raw).hexdigest()


def validate_candidate_decision(manifest, record):
    """Confirm supplied candidate decision refers to the exact tuple.

    The PR-controlled record is NOT independently authenticated founder approval.
    """
    if not isinstance(record, dict):
        raise ValueError("invalid candidate-decision record")
    if set(record) != {
        "schemaVersion", "release", "decision", "decisionDate",
        "decisionTime", "decisionSource", "scope", "repositories",
        "releaseStatus", "notReleaseEvidence"
    }:
        raise ValueError("unexpected or missing candidate-decision fields")
    if record["schemaVersion"] != 1 or record["release"] != manifest["release"]:
        raise ValueError("candidate-decision release mismatch")
    if record["decision"] != "candidate-selection-authorized":
        raise ValueError("candidate decision does not authorize this selection")
    if record["releaseStatus"] != "CANDIDATE" or record["notReleaseEvidence"] is not True:
        raise ValueError("candidate decision falsely claims release evidence")
    if not isinstance(record["decisionDate"], str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}", record["decisionDate"]
    ):
        raise ValueError("decision date must be YYYY-MM-DD")
    if record["decisionTime"] is not None:
        raise ValueError("decisionTime must remain null until independently evidenced")
    if not isinstance(record["decisionSource"], str) or not record["decisionSource"]:
        raise ValueError("missing decision provenance")
    if record["repositories"] != manifest["repositories"]:
        raise ValueError("candidate-decision tuple differs from manifest")
    return True


def main():
    root = Path(__file__).resolve().parents[1]
    manifest, digest = load_unique(root / "releases/portfolio-v0.1.0.json")
    schema, _ = load_unique(root / "schemas/portfolio-release.schema.json")
    policy, _ = load_unique(root / "release-policy/repositories.json")
    record, record_digest = load_unique(
        root / "releases/approvals/portfolio-v0.1.0.candidate.json"
    )
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(manifest)
    if set(policy["repositories"]) != set(manifest["repositories"]):
        raise ValueError("trusted policy repository list differs from release tuple")
    for key, expected in policy["repositories"].items():
        if manifest["repositories"][key]["repository"] != expected:
            raise ValueError("repository mismatch: " + key)
    validate_candidate_decision(manifest, record)
    print(json.dumps({
        "release": manifest["release"],
        "manifestSha256": digest,
        "candidateDecisionSha256": record_digest,
        "pins": {key: value["commit"] for key, value in manifest["repositories"].items()},
        "structureValidated": True,
        "candidateDecisionTupleMatched": True,
        "founderApprovalIndependentlyAuthenticated": False,
        "ancestryVerifiedByThisJob": False,
        "peerConstraintsTested": False,
        "compatibilityTested": False,
        "releasePromotionAuthorized": False,
    }, indent=2), flush=True)
    suites = policy.get("testCommands", {})
    required = (
        "storyengine", "chiefAi", "sekretBip",
        "peerContracts", "portfolioIntegration", "securityRegression"
    )
    missing = [key for key in required if not suites.get(key)]
    if missing:
        raise ValueError("PROMOTION BLOCKED: missing mandatory test suites: " +
                         ", ".join(missing))
    raise ValueError("PROMOTION BLOCKED: trusted integration executor not yet wired")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
