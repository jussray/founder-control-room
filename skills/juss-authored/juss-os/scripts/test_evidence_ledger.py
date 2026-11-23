#!/usr/bin/env python3
from copy import deepcopy
import unittest

from evidence_core import (
    assert_evidence_identity,
    assert_receipt_shape,
    can_candidate_proceed,
    classify_claim,
    evaluate_staleness,
    invalidate_if_stale,
    is_merge_eligible,
)

BASE_SHA = "a" * 40
NEXT_SHA = "b" * 40
LOCK_SHA = "c" * 64
NEXT_LOCK_SHA = "d" * 64


def identity():
    return {
        "source": {
            "canonical_remote": "https://github.com/jussray/example.git",
            "repository": "jussray/example",
            "branch": "main",
            "commit_sha": BASE_SHA,
        },
        "dependency": {
            "lockfile_path": "package-lock.json",
            "lockfile_sha256": LOCK_SHA,
            "package_manager": "npm",
        },
        "runtime": {
            "environment": "staging",
            "build_id": "build-100",
            "deployment_url": "https://staging.example.test",
        },
    }


def receipt(**overrides):
    out = {
        "id": "CQ-001",
        "finding_id": "FINDING-001",
        "check": "typecheck",
        "state": "VERIFIED",
        "observed_at": "2026-10-05T18:00:00.000Z",
        "identity": identity(),
        "summary": "Strict check passed against the candidate identity.",
        "evidence_refs": ["artifact://typecheck/CQ-001"],
        "invalidated_by": [],
        "non_authoritative_markers": [],
    }
    out.update(overrides)
    return out


class EvidenceLedgerTests(unittest.TestCase):
    def test_receipt_cannot_self_authorize_claim(self):
        label, _ = classify_claim([{
            "source_kind": "receipt", "supports": True, "direct": True, "fresh": True
        }])
        self.assertEqual(label, "PARTIAL")

    def test_required_runtime_kind_prevents_deployment_from_proving_runtime(self):
        label, _ = classify_claim([{
            "source_kind": "deployment", "supports": True, "direct": True, "fresh": True
        }], required_source_kind="runtime")
        self.assertEqual(label, "PARTIAL")

    def test_unresolved_runtime_evidence_is_not_verified(self):
        label, _ = classify_claim([{
            "source_kind": "runtime", "supports": True, "direct": True, "fresh": True, "resolved": False
        }], required_source_kind="runtime")
        self.assertEqual(label, "PARTIAL")

    def test_verified_receipt_requires_evidence_reference(self):
        with self.assertRaisesRegex(ValueError, "at least one evidence reference"):
            assert_receipt_shape(receipt(evidence_refs=[]))

    def test_cookie_fingerprint_receipt_refs_cannot_be_only_verification(self):
        with self.assertRaisesRegex(ValueError, "cannot be the sole basis"):
            assert_receipt_shape(receipt(
                evidence_refs=["fingerprint://abc", "cookie://continuity/123"],
                non_authoritative_markers=["fingerprint", "cookie"],
            ))

    def test_full_git_sha_required(self):
        bad = identity()
        bad["source"]["commit_sha"] = "abc1234"
        with self.assertRaisesRegex(ValueError, "full 40-character Git SHA"):
            assert_evidence_identity(bad)

    def test_timezone_required_for_observation(self):
        with self.assertRaisesRegex(ValueError, "must include a timezone"):
            assert_receipt_shape(receipt(observed_at="2026-10-05T18:00:00"))

    def test_receipt_cannot_grant_merge_authority(self):
        with self.assertRaisesRegex(ValueError, "cannot grant"):
            assert_receipt_shape(receipt(merge_authority=True))

    def test_source_change_marks_receipt_stale(self):
        current = identity()
        current["source"]["commit_sha"] = NEXT_SHA
        out = evaluate_staleness(receipt(), current)
        self.assertEqual(out["state"], "STALE")
        self.assertEqual(out["invalidated_by"], ["source_identity_changed"])

    def test_lockfile_change_marks_receipt_stale(self):
        current = identity()
        current["dependency"]["lockfile_sha256"] = NEXT_LOCK_SHA
        out = evaluate_staleness(receipt(), current)
        self.assertEqual(out["state"], "STALE")
        self.assertEqual(out["invalidated_by"], ["dependency_identity_changed"])

    def test_runtime_change_marks_receipt_stale(self):
        current = identity()
        current["runtime"]["build_id"] = "build-101"
        out = evaluate_staleness(receipt(), current)
        self.assertEqual(out["state"], "STALE")
        self.assertEqual(out["invalidated_by"], ["runtime_identity_changed"])

    def test_invalidate_if_stale_preserves_addressability(self):
        current = identity()
        current["source"]["commit_sha"] = NEXT_SHA
        out = invalidate_if_stale(receipt(), current, "2026-10-05T18:01:00Z")
        self.assertEqual(out["id"], "CQ-001")
        self.assertEqual(out["state"], "STALE")

    def test_required_checks_need_current_verified_receipts(self):
        receipts = [
            receipt(id="CQ-001", check="lint"),
            receipt(id="CQ-002", check="typecheck"),
        ]
        self.assertFalse(can_candidate_proceed(receipts, ["lint", "typecheck", "focused_test"], identity()))

    def test_identity_change_invalidates_candidate_proceed(self):
        current = identity()
        current["source"]["commit_sha"] = NEXT_SHA
        receipts = [receipt(check="typecheck")]
        self.assertFalse(can_candidate_proceed(receipts, ["typecheck"], current))

    def test_empty_required_checks_never_mean_green(self):
        self.assertFalse(can_candidate_proceed([receipt()], [], identity()))
        self.assertFalse(is_merge_eligible([receipt()], [], identity()))

    def test_current_blocked_receipt_blocks_evidence_eligibility(self):
        receipts = [
            receipt(check="typecheck"),
            receipt(
                id="CQ-002", check="playwright", state="BLOCKED",
                summary="No runtime target available.", evidence_refs=[]
            ),
        ]
        self.assertFalse(is_merge_eligible(receipts, ["typecheck"], identity()))

    def test_historical_stale_receipt_does_not_self_block_new_identity(self):
        old = receipt()
        current = deepcopy(identity())
        current["source"]["commit_sha"] = NEXT_SHA
        fresh = receipt(
            id="CQ-002",
            identity=current,
            check="typecheck",
            evidence_refs=["artifact://typecheck/CQ-002"],
        )
        self.assertTrue(is_merge_eligible([old, fresh], ["typecheck"], current))


if __name__ == "__main__":
    unittest.main()
