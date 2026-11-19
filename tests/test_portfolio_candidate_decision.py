"""Unit tests for candidate-decision/manifest integrity, not compatibility."""
import json
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_portfolio_release import load_unique, validate_candidate_decision

class CandidateDecisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest, _ = load_unique(ROOT / "releases/portfolio-v0.1.0.json")
        cls.record, _ = load_unique(
            ROOT / "releases/approvals/portfolio-v0.1.0.candidate.json"
        )

    def clone(self):
        return json.loads(json.dumps(self.record))

    def test_exact_tuple_accepted_for_candidate_selection(self):
        self.assertTrue(validate_candidate_decision(self.manifest, self.clone()))

    def test_different_chief_pin_rejected(self):
        record = self.clone()
        record["repositories"]["chiefAi"]["commit"] = "1" * 40
        with self.assertRaisesRegex(ValueError, "tuple differs"):
            validate_candidate_decision(self.manifest, record)

    def test_different_bip_pin_rejected(self):
        record = self.clone()
        record["repositories"]["sekretBip"]["commit"] = "2" * 40
        with self.assertRaisesRegex(ValueError, "tuple differs"):
            validate_candidate_decision(self.manifest, record)

    def test_different_story_pin_rejected(self):
        record = self.clone()
        record["repositories"]["storyengine"]["commit"] = "3" * 40
        with self.assertRaisesRegex(ValueError, "tuple differs"):
            validate_candidate_decision(self.manifest, record)

    def test_approved_status_cannot_be_claimed(self):
        record = self.clone()
        record["releaseStatus"] = "APPROVED"
        with self.assertRaisesRegex(ValueError, "falsely claims"):
            validate_candidate_decision(self.manifest, record)

    def test_timestamp_placeholder_not_accepted(self):
        record = self.clone()
        record["decisionTime"] = "2026-10-23T[approval-time]"
        with self.assertRaisesRegex(ValueError, "remain null"):
            validate_candidate_decision(self.manifest, record)

    def test_unknown_field_rejected(self):
        record = self.clone()
        record["isPublished"] = True
        with self.assertRaisesRegex(ValueError, "unexpected"):
            validate_candidate_decision(self.manifest, record)

if __name__ == "__main__":
    unittest.main()
