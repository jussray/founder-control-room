#!/usr/bin/env python3
"""Credential-free exact-tuple source, peer, and federation verification.

This is a candidate test. It does NOT prove runtime interoperability or authorize release.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from portfolio_manifest_io import load_unique

KEYS = ("storyengine", "chiefAi", "sekretBip")
SOURCE_NAMES = {"storyengine": "StoryEngine", "chiefAi": "chief-ai-machine", "sekretBip": "Sekret-Bip"}
EXPECTED_REMOTE_PREFIX = "https://github.com/"

def run_git(directory, *args, valid=(0,)):
    process = subprocess.run(["git", "-C", str(directory), *args],
        text=True, capture_output=True, timeout=60, check=False)
    if process.returncode not in valid:
        raise ValueError("git " + " ".join(args) + " failed: " +
                         (process.stderr.strip() or str(process.returncode)))
    return process

def ancestor(source, ancestor_sha, selected_sha):
    result = run_git(source, "merge-base", "--is-ancestor",
                     ancestor_sha, selected_sha, valid=(0, 1))
    return result.returncode == 0

def read_json(path):
    value, unused_digest = load_unique(path)
    return value

def checkout_checks(manifest, policy, sources):
    checked = []
    for key in KEYS:
        item = manifest["repositories"][key]
        path = sources / SOURCE_NAMES[key]
        if not path.is_dir():
            raise ValueError("missing checkout for " + key)
        expected_remote = EXPECTED_REMOTE_PREFIX + item["repository"]
        remote = run_git(path, "remote", "get-url", "origin").stdout.strip()
        if remote.rstrip("/").removesuffix(".git") != expected_remote:
            raise ValueError("unexpected origin for " + key)
        actual = run_git(path, "rev-parse", "HEAD").stdout.strip()
        if actual != item["commit"]:
            raise ValueError("checkout does not match manifest: " + key)
        if run_git(path, "rev-parse", "--is-shallow-repository").stdout.strip() != "false":
            raise ValueError("shallow checkout cannot verify history: " + key)
        approved = run_git(path, "rev-parse", "--verify", "origin/main^{commit}").stdout.strip()
        if not ancestor(path, actual, approved):
            raise ValueError("commit not in approved main history: " + key)
        for recovery_sha in policy.get("requiredRecoveryAncestors", {}).get(key, []):
            if not re.fullmatch("[0-9a-f]{40}", recovery_sha):
                raise ValueError("trusted recovery SHA must be full: " + key)
            if not ancestor(path, recovery_sha, actual):
                raise ValueError("required recovery ancestor absent: " + key + " " + recovery_sha)
        checked.append({"key": key, "repository": item["repository"],
                        "commit": actual, "approvedHeadSnapshot": approved,
                        "recoveryAncestorsChecked": len(
                            policy.get("requiredRecoveryAncestors", {}).get(key, []))})
    return {"verified": checked}

def peer_checks(manifest, policy, sources):
    expected = {value["repository"].lower(): value["commit"]
                for value in manifest["repositories"].values()}
    summary = []
    for key in KEYS:
        path = sources / SOURCE_NAMES[key] / ".peer-dependencies.json"
        required = policy.get("peerManifestRequired", {}).get(key, False)
        if not path.is_file():
            if required:
                raise ValueError("missing required peer manifest for " + key)
            summary.append({"key": key, "declaredPeers": 0, "manifestPresent": False})
            continue
        data = read_json(path)
        if data.get("schema") != "juss/peer-dependencies@v1" or not isinstance(data.get("peers"), list):
            raise ValueError("invalid peer manifest: " + key)
        seen = set()
        for entry in data["peers"]:
            peer_name = entry.get("repository", "").lower()
            advertised = entry.get("expectedCommit", "")
            if peer_name in seen:
                raise ValueError("duplicate peer entry in " + key)
            seen.add(peer_name)
            if peer_name not in expected or peer_name == manifest["repositories"][key]["repository"].lower():
                raise ValueError("unknown or self peer in " + key)
            if not re.fullmatch(r"[0-9a-f]{7,40}", advertised):
                raise ValueError("invalid expectedCommit in " + key)
            if not expected[peer_name].startswith(advertised):
                raise ValueError("EXACT PEER CONFLICT: " + key + " expects " +
                    peer_name + "@" + advertised + " but selected " + expected[peer_name])
        summary.append({"key": key, "declaredPeers": len(seen), "manifestPresent": True})
    return {"peerConstraints": summary}

def federation_checks(manifest, sources):
    result = []
    for key in KEYS:
        path = sources / SOURCE_NAMES[key] / "control-room.manifest.json"
        data = read_json(path)
        if data.get("repository") != manifest["repositories"][key]["repository"]:
            raise ValueError("federation identity mismatch: " + key)
        if data.get("portfolioHub") != "jussray/founder-control-room":
            raise ValueError("federation hub mismatch: " + key)
        if data.get("authority", {}).get("productionMutation") != "separate-founder-gate":
            raise ValueError("missing separate production mutation gate: " + key)
        if data.get("controlRoom", {}).get("privateContentAllowed") is not False:
            raise ValueError("private content must not federate: " + key)
        result.append({"key": key, "federationMetadataChecked": True})
    return {"federation": result, "runtimeInteroperabilityTested": False}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=("sources", "peers", "federation"))
    parser.add_argument("--sources", default="sources", type=Path)
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest, digest = load_unique(root / "releases/portfolio-v0.1.0.json")
    policy = read_json(root / "release-policy/repositories.json")
    for key, identity in policy["repositories"].items():
        if manifest["repositories"][key]["repository"] != identity:
            raise ValueError("policy identity mismatch")
    env_digest = os.environ.get("EXPECTED_MANIFEST_SHA256")
    if env_digest and digest != env_digest:
        raise ValueError("manifest digest changed between jobs")
    if args.mode == "sources":
        details = checkout_checks(manifest, policy, args.sources)
    elif args.mode == "peers":
        details = peer_checks(manifest, policy, args.sources)
    else:
        details = federation_checks(manifest, args.sources)
    evidence = {"contract": "juss/portfolio-candidate-evidence@v1",
        "release": manifest["release"], "manifestSha256": digest,
        "mode": args.mode, "status": "pass", "workflowRunId": os.environ.get("GITHUB_RUN_ID"),
        "validatorCommit": os.environ.get("GITHUB_SHA"),
        **details}
    if args.evidence:
        args.evidence.parent.mkdir(parents=True, exist_ok=True)
        args.evidence.write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired) as exc:
        print("CANDIDATE CHECK BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
