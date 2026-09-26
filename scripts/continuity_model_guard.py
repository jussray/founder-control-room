#!/usr/bin/env python3
"""Attack FCR's combined PR-rollover and deployment-candidate continuity model."""
from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEPLOY_GUARD = ROOT / "scripts" / "deploy_candidate_guard.py"
POLICY = ROOT / ".deployment-authority.json"
PR_LAW = ROOT / "docs" / "PR_CONTINUITY.md"
LEASE_LAW = ROOT / "docs" / "DEPLOYMENT_CANDIDATE_LEASE.md"
MODEL = ROOT / "docs" / "CONTINUITY_MODEL.md"


def fail(message: str) -> None:
    print(f"CONTINUITY MODEL FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def run(cwd: pathlib.Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        fail(f"command failed: {' '.join(args)}\n{result.stdout}{result.stderr}")
    return result


def require_text(path: pathlib.Path, needles: list[str]) -> None:
    if not path.exists():
        fail(f"missing required contract: {path.relative_to(ROOT)}")
    text = path.read_text(encoding="utf-8")
    for needle in needles:
        if needle not in text:
            fail(f"{path.name} lost required rule: {needle}")


def verify_contracts() -> None:
    require_text(PR_LAW, [
        "successor head is a new proof subject",
        "predecessor CI/review/runtime/Playwright proof expires",
        "Approval never carries across base/head movement",
    ])
    require_text(LEASE_LAW, [
        "candidate SHA is exact and immutable",
        "Unknown paths fail closed and revoke the lease",
        "Production deploys the candidate SHA",
    ])
    require_text(MODEL, [
        "Candidate leases never excuse active work from rolling forward",
        "PR rollover never proves that an older deployment artifact changed",
        "Work continuity and deployment-proof continuity are separate receipts",
    ])


def attack_git_model() -> None:
    if not DEPLOY_GUARD.exists() or not POLICY.exists():
        fail("deployment candidate guard/policy missing")

    with tempfile.TemporaryDirectory() as tmp:
        repo = pathlib.Path(tmp)
        run(repo, "git", "init", "-q", "-b", "main")
        run(repo, "git", "config", "user.email", "continuity@example.invalid")
        run(repo, "git", "config", "user.name", "FCR Continuity Guard")

        (repo / "src").mkdir()
        (repo / "docs").mkdir()
        (repo / "src" / "runtime.ts").write_text("export const runtime = 1;\n", encoding="utf-8")
        (repo / "docs" / "receipt.md").write_text("baseline\n", encoding="utf-8")
        (repo / ".deployment-authority.json").write_text(POLICY.read_text(encoding="utf-8"), encoding="utf-8")
        run(repo, "git", "add", ".")
        run(repo, "git", "commit", "-qm", "baseline candidate")
        candidate = run(repo, "git", "rev-parse", "HEAD").stdout.strip()

        run(repo, "git", "checkout", "-qb", "feature")
        (repo / "src" / "feature.ts").write_text("export const feature = true;\n", encoding="utf-8")
        run(repo, "git", "add", "src/feature.ts")
        run(repo, "git", "commit", "-qm", "active feature")
        predecessor_head = run(repo, "git", "rev-parse", "HEAD").stdout.strip()

        run(repo, "git", "checkout", "-q", "main")
        (repo / "docs" / "receipt.md").write_text("baseline\nsafe receipt drift\n", encoding="utf-8")
        run(repo, "git", "add", "docs/receipt.md")
        run(repo, "git", "commit", "-qm", "safe docs drift")
        docs_main = run(repo, "git", "rev-parse", "HEAD").stdout.strip()

        safe = run(repo, sys.executable, str(DEPLOY_GUARD), candidate, docs_main, check=False)
        if safe.returncode != 0:
            fail("docs-only drift incorrectly revoked deployment candidate:\n" + safe.stdout + safe.stderr)

        run(repo, "git", "checkout", "-q", "feature")
        run(repo, "git", "merge", "--no-edit", "main")
        successor_head = run(repo, "git", "rev-parse", "HEAD").stdout.strip()
        if successor_head == predecessor_head:
            fail("active work did not mint a successor head after trusted base movement")
        if run(repo, "git", "merge-base", "--is-ancestor", docs_main, successor_head, check=False).returncode != 0:
            fail("rolled-forward successor does not contain the new trusted main base")

        run(repo, "git", "checkout", "-q", "main")
        (repo / "src" / "runtime.ts").write_text("export const runtime = 2;\n", encoding="utf-8")
        run(repo, "git", "add", "src/runtime.ts")
        run(repo, "git", "commit", "-qm", "runtime drift")
        runtime_main = run(repo, "git", "rev-parse", "HEAD").stdout.strip()

        unsafe = run(repo, sys.executable, str(DEPLOY_GUARD), candidate, runtime_main, check=False)
        if unsafe.returncode == 0:
            fail("runtime drift incorrectly preserved deployment candidate")


def main() -> None:
    verify_contracts()
    attack_git_model()
    print("CONTINUITY MODEL PASS: active work rolls forward; safe deploy drift leases; runtime drift revokes")


if __name__ == "__main__":
    main()
