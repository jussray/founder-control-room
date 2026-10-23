#!/usr/bin/env python3
"""Read-only local commit ancestry audit; never substitutes HEAD for a missing commit."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

def git(repo, *args, allowed=(0,)):
    p = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=120)
    if p.returncode not in allowed:
        raise RuntimeError("git failed: " + (p.stderr.strip() or p.stdout.strip()))
    return p

def resolve(repo, prefix):
    if not re.fullmatch(r"[a-fA-F0-9]{7,40}", prefix):
        raise ValueError("expected 7-40 hexadecimal characters")
    oids = git(repo, "rev-parse", "--disambiguate=" + prefix.lower()).stdout.splitlines()
    matches = sorted(set(oid for oid in oids if git(repo, "cat-file", "-t", oid).stdout.strip() == "commit"))
    if len(matches) != 1:
        raise ValueError("commit prefix missing or ambiguous: " + prefix)
    return matches[0]

def ancestor(repo, first, second):
    return git(repo, "merge-base", "--is-ancestor", first, second, allowed=(0,1)).returncode == 0

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--repo", required=True, type=Path)
    p.add_argument("--commit", required=True)
    p.add_argument("--approved-ref", default="origin/main")
    p.add_argument("--requires", action="append", default=[])
    a = p.parse_args()
    if a.approved_ref.startswith("-"):
        raise ValueError("unsafe approved ref")
    repo = a.repo.resolve()
    git(repo, "rev-parse", "--git-dir")
    if git(repo, "rev-parse", "--is-shallow-repository").stdout.strip() != "false":
        raise ValueError("shallow history: blocked")
    candidate = resolve(repo, a.commit)
    approved = git(repo, "rev-parse", "--verify", "--end-of-options", a.approved_ref + "^{commit}").stdout.strip()
    requirements = [{"commit": resolve(repo, x)} for x in a.requires]
    for item in requirements:
        item["included"] = ancestor(repo, item["commit"], candidate)
    passed = ancestor(repo, candidate, approved) and all(x["included"] for x in requirements)
    print(json.dumps({"candidate": candidate, "approvedHeadSnapshot": approved,
        "candidateOnApprovedHistory": ancestor(repo, candidate, approved),
        "requiredAncestors": requirements, "historyAuditPassed": passed,
        "compatibilityTested": False}, indent=2))
    return 0 if passed else 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(2)
