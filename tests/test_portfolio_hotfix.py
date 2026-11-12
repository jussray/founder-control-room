"""Single-repository hotfix isolation regression cases."""
import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_portfolio_hotfix import validate, version

PINS = {
    "storyengine": {"repository": "jussray/StoryEngine", "commit": "a" * 40},
    "chiefAi": {"repository": "jussray/chief-ai-machine", "commit": "b" * 40},
    "sekretBip": {"repository": "jussray/Sekret-Bip", "commit": "c" * 40}
}

class HotfixContractTests(unittest.TestCase):
    def setUp(self):
        self.old = {"schemaVersion": 1, "release": "portfolio-v0.1.0",
                    "repositories": copy.deepcopy(PINS)}
        self.new = copy.deepcopy(self.old)
        self.new["release"] = "portfolio-v0.1.1"
        self.new["repositories"]["storyengine"]["commit"] = "d" * 40

    def test_one_changed_pin_is_accepted_as_candidate(self):
        result = validate(self.old, self.new, "storyengine")
        self.assertTrue(result["pinIsolationPassed"])
        self.assertFalse(result["promotionAuthorized"])

    def test_second_changed_pin_is_rejected(self):
        self.new["repositories"]["chiefAi"]["commit"] = "e" * 40
        with self.assertRaisesRegex(ValueError, "unrelated"):
            validate(self.old, self.new, "storyengine")

    def test_equal_pin_is_rejected(self):
        self.new["repositories"]["storyengine"]["commit"] = "a" * 40
        with self.assertRaisesRegex(ValueError, "did not change"):
            validate(self.old, self.new, "storyengine")

    def test_release_version_must_increase(self):
        self.new["release"] = "portfolio-v0.1.0"
        with self.assertRaisesRegex(ValueError, "must increase"):
            validate(self.old, self.new, "storyengine")

    def test_identity_change_is_rejected(self):
        self.new["repositories"]["storyengine"]["repository"] = "untrusted/StoryEngine"
        with self.assertRaisesRegex(ValueError, "identity changed"):
            validate(self.old, self.new, "storyengine")

    def test_invalid_semver_rejected(self):
        with self.assertRaises(ValueError):
            version("portfolio-v0.1.1-beta")

if __name__ == "__main__":
    unittest.main()
