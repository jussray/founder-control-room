"""Regression tests for check_receipt.check().

Stdlib unittest only. Run from repo root:
  python3 -m unittest discover -s systems/skills/local-runtime-kernel/scripts -p 'test_check_receipt.py' -v
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from check_receipt import STATUSES, check

HERE = Path(__file__).resolve().parent


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
        must=["WHAT"],
        slots={"WHAT": {"status": "PROVEN", "evidence": ["commit:abc123"]}},
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



class AdditionalHardeningTests(unittest.TestCase):
    def test_status_word_with_whitespace_and_case_rejected(self):
        r = verified("agent-a", " PROVEN ")
        self.assertTrue(any("sentinel" in e or "status word" in e for e in check(r)))

    def test_missing_executor_rejected(self):
        r = verified("agent-a", "reviewer-b")
        del r["who"]["EXECUTED"]
        self.assertTrue(any("WHO.EXECUTED" in e for e in check(r)))

    def test_self_certification_ignores_case_and_whitespace(self):
        r = verified("agent-a", " AGENT-A ")
        self.assertTrue(any("self-certification" in e for e in check(r)))

    def test_different_actor_same_identity_is_self_certification(self):
        r = verified("agent-a", "reviewer-b")
        r["who"]["VERIFIED"]["identity"] = "id:agent-a"
        self.assertTrue(any("self-certification" in e for e in check(r)))

    def test_no_must_slots_rejected(self):
        r = verified("agent-a", "reviewer-b")
        r["must"] = []
        self.assertTrue(any("Must" in e for e in check(r)))

    def test_missing_must_slots_rejected(self):
        r = verified("agent-a", "reviewer-b")
        del r["must"]
        self.assertTrue(check(r))

    def test_missing_must_slot_proof_rejected(self):
        r = verified("agent-a", "reviewer-b")
        r["slots"]["WHAT"] = {"status": "CANDIDATE"}
        self.assertTrue(check(r))

    def test_empty_receipt_rejected(self):
        self.assertTrue(check({}))

    def test_non_object_receipt_rejected(self):
        self.assertTrue(check(["not", "an", "object"]))

    def test_non_object_slot_and_who_rejected_not_exception(self):
        r = receipt(slots={"WHAT": None}, who={"VERIFIED": "PROVEN"})
        self.assertTrue(check(r))

    def test_wrong_container_types_rejected_not_exception(self):
        r = receipt(slots=[], who=[], must="WHAT")
        self.assertTrue(check(r))

    def test_must_invalid_entries_rejected(self):
        r = receipt(must=[None, "", True])
        self.assertTrue(check(r))

    def test_invalid_evidence_not_accepted(self):
        for evidence in (True, 3, "   ", [], {}):
            with self.subTest(evidence=evidence):
                r = receipt(phase="PERMIT", prospective_authority={"status": "PROVEN", "evidence": evidence})
                self.assertTrue(check(r))

    def test_proven_who_binding_rejects_boolean(self):
        r = receipt(who={"REQUESTED": {**proven("requester"), "authority": True}})
        self.assertTrue(check(r))

    def test_why_causal_requires_literal_true(self):
        r = receipt(slots={"WHY": {"status": "PROVEN", "evidence": ["trace"], "causal": "yes"}})
        self.assertTrue(check(r))

    def test_cli_exit_codes(self):
        for r, expected in ((receipt(), 0), ({}, 1)):
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as td:
                p = Path(td) / "receipt.json"
                p.write_text(json.dumps(r), encoding="utf-8")
                result = subprocess.run([sys.executable, str(HERE / "check_receipt.py"), str(p)],
                                        capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)

    def test_cli_invalid_json_is_input_error(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "invalid.json"
            p.write_text("{invalid json", encoding="utf-8")
            result = subprocess.run([sys.executable, str(HERE / "check_receipt.py"), str(p)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)



if __name__ == "__main__":
    unittest.main()
