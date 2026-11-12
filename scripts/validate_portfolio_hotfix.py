#!/usr/bin/env python3
"""Fail-closed single-repository hotfix tuple validator; never modifies releases."""
import argparse
import json
import re
import sys
from pathlib import Path

REPOS = ("storyengine", "chiefAi", "sekretBip")
VERSION = re.compile(r"^portfolio-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")

def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key: " + key)
        result[key] = value
    return result

def load(path):
    raw = Path(path).read_bytes()
    if len(raw) > 65536:
        raise ValueError("manifest exceeds 65536 bytes")
    return json.loads(raw, object_pairs_hook=unique_pairs)

def version(value):
    match = VERSION.fullmatch(value)
    if not match:
        raise ValueError("invalid portfolio release version")
    return tuple(map(int, match.groups()))

def validate(old, new, changed):
    if changed not in REPOS:
        raise ValueError("unknown changed repository")
    if old.get("schemaVersion") != 1 or new.get("schemaVersion") != 1:
        raise ValueError("schema version mismatch")
    old_v, new_v = version(old["release"]), version(new["release"])
    if new_v <= old_v:
        raise ValueError("release version must increase")
    if set(old["repositories"]) != set(REPOS) or set(new["repositories"]) != set(REPOS):
        raise ValueError("repository set changed")
    for key in REPOS:
        before, after = old["repositories"][key], new["repositories"][key]
        if key == changed:
            if before["repository"] != after["repository"]:
                raise ValueError("repository identity changed: " + key)
            if before["commit"] == after["commit"]:
                raise ValueError("hotfix pin did not change: " + key)
        elif before != after:
            raise ValueError("unrelated repository pin changed: " + key)
    return {"previousRelease": old["release"], "candidateRelease": new["release"],
        "changedRepository": changed, "unchangedRepositories":
        [key for key in REPOS if key != changed],
        "pinIsolationPassed": True, "compatibilityTested": False,
        "promotionAuthorized": False}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--previous", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--changed", required=True, choices=REPOS)
    args = parser.parse_args()
    result = validate(load(args.previous), load(args.candidate), args.changed)
    print(json.dumps(result, indent=2))
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
