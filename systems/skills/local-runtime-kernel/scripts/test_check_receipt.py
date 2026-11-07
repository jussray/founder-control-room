"""Regression tests for check_receipt.check().

Stdlib unittest only. Run from repo root:
  python3 -m unittest discover -s systems/skills/local-runtime-kernel/scripts -p 'test_check_receipt.py' -v
"""
import unittest

from check_receipt import STATUSES, check


def proven(actor: str) -> dict:
    return {
        "status": "PROVEN",
        "actor": actor,
        "identity": f"id:{actor}",
        "action": "act",
        "authority": "auth",
        "evidence": "ev",
    }


def receipt(**overrides) -> dict:
    base = {
        "phase": "DECLARE",
        "state": "UNKNOWN",
        "slots": {},
        "must": [],
        "who": {},
        "prospective_authority": {"status": "UNKNOWN"},
    }
    base.update(overrides)
    return base


def verified(exec_actor: str, verify_actor: str, phase: str = "DECIDE") -> dict:
    return receipt(
        phase=phase,
        state="VERIFIED",
        prospective_authority=proven("juss"),
        who={"EXECUTED": proven(exec_actor), "VERIFIED": proven(verify_actor)},
    )


class PermitPhaseGateTests(unittest.TestCase):
    def test_permit_phase_without_proven_prospective_authority_is_blocked(self):
        errs = check(receipt(phase="PERMIT", prospective_authority={"status": "UNKNOWN"}))
        self.assertTrue(errs, "PERMIT must require PROVEN prospective authority (SKILL.md:44)")

    def test_attempt_phase_without_proven_prospective_authority_is_blocked(self):
        errs = check(receipt(phase="ATTEMPT", prospective_authority={"status": "UNKNOWN"}))
        self.assertTrue(errs)

    def test_attempt_phase_with_candidate_prospective_authority_is_blocked(self):
        errs = check(receipt(phase="ATTEMPT", prospective_authority={"status": "CANDIDATE", "evidence": "ev"}))
        self.assertTrue(errs)

    def test_declare_phase_needs_no_prospective_authority(self):
        self.assertEqual(check(receipt(phase="DECLARE")), [])

    def test_permit_phase_with_proven_prospective_authority_passes(self):
        errs = check(receipt(phase="PERMIT", prospective_authority=proven("juss")))
        self.assertEqual(errs, [])


class SentinelActorTests(unittest.TestCase):
    def test_verified_rejects_status_word_as_verifier_actor(self):
        for sentinel in sorted(STATUSES):
            with self.subTest(sentinel=sentinel):
                errs = check(verified("agent-a", sentinel))
                self.assertTrue(errs, f"WHO.VERIFIED actor {sentinel!r} must be rejected")

    def test_verified_rejects_status_word_as_executor_actor(self):
        for sentinel in sorted(STATUSES):
            with self.subTest(sentinel=sentinel):
                errs = check(verified(sentinel, "reviewer-b"))
                self.assertTrue(errs, f"WHO.EXECUTED actor {sentinel!r} must be rejected")


class VerifiedReceiptTests(unittest.TestCase):
    def test_verified_with_distinct_real_actors_passes(self):
        self.assertEqual(check(verified("agent-a", "reviewer-b")), [])

    def test_self_certification_is_rejected(self):
        errs = check(verified("agent-a", "agent-a"))
        self.assertTrue(any("self-certification" in e for e in errs), errs)


if __name__ == "__main__":
    unittest.main()
