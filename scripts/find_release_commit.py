#!/usr/bin/env python3
"""Read-only commit finder. Does not fetch, switch branches, or test compatibility."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

class AuditError(Exception):
    pass

def git(repo, *args, allowed=(0,)):
    result = subprocess.run(["git", "-C", str(repo), *args], text=True,
        capture_output=True, check=False, timeout=120)
    if result.returncode not in allowed:
        raise AuditError("git " + " ".join(args) + " failed: " +
            (result.stderr.strip() or result.stdout.strip()))
    return result

def resolve_commit(repo, value):
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", value):
        raise AuditError("Commit must be a 7-40 character hexadecimal SHA or prefix")
    objects = git(repo, "rev-parse", "--disambiguate=" + value.lower()).stdout.splitlines()
    matches = sorted(set(oid for oid in objects
        if git(repo, "cat-file", "-t", oid).stdout.strip() == "commit"))
    if len(matches) != 1:
        raise AuditError("Missing or ambiguous commit: " + value)
    return matches[0]

def is_ancestor(repo, ancestor, descendant):
    return git(repo, "merge-base", "--is-ancestor", ancestor, descendant,
        allowed=(0, 1)).returncode == 0

def main():
    parser = argparse.ArgumentParser(description="Read-only commit ancestry audit")
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--approved-ref", default="origin/main")
    parser.add_argument("--requires", action="append", default=[])
    args = parser.parse_args()
    if args.approved_ref.startswith("-"):
        raise AuditError("Approved ref cannot start with '-'")
    repo = args.repo.resolve()
    git(repo, "rev-parse", "--git-dir")
    if git(repo, "rev-parse", "--is-shallow-repository").stdout.strip() != "false":
        raise AuditError("Shallow history is not accepted")
    candidate = resolve_commit(repo, args.commit)
    approved = git(repo, "rev-parse", "--verify", "--end-of-options",
        args.approved_ref + "^{commit}").stdout.strip()
    required = [{"commit": resolve_commit(repo, value)} for value in args.requires]
    for item in required:
        item["included"] = is_ancestor(repo, item["commit"], candidate)
    on_history = is_ancestor(repo, candidate, approved)
    passed = on_history and all(item["included"] for item in required)
    subject = git(repo, "show", "-s", "--format=%s", candidate).stdout.strip()
    print(json.dumps({"candidate": candidate, "subject": subject,
        "approvedRef": args.approved_ref, "approvedHeadSnapshot": approved,
        "candidateOnApprovedHistory": on_history, "requiredAncestors": required,
        "historyAuditPassed": passed, "compatibilityTested": False}, indent=2))
    return 0 if passed else 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AuditError, OSError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(2)
