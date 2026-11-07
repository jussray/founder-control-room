"""Offline adversarial contract tests; never inspect live users or access credentials."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from portfolio_matrix_contract import peer_checks, federation_checks

PINS = {
    "storyengine": {"repository": "jussray/StoryEngine", "commit": "a" * 40},
    "chiefAi": {"repository": "jussray/chief-ai-machine", "commit": "b" * 40},
    "sekretBip": {"repository": "jussray/Sekret-Bip", "commit": "c" * 40},
}
POLICY = {"peerManifestRequired": {
    "storyengine": True, "chiefAi": True, "sekretBip": False,
}}

class MatrixContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.manifest = {"repositories": copy.deepcopy(PINS)}
        for subdir in ("StoryEngine", "chief-ai-machine", "Sekret-Bip"):
            (self.root / subdir).mkdir()
        self.write_peer("StoryEngine", "jussray/chief-ai-machine", "b" * 7)
        self.write_peer("chief-ai-machine", "jussray/StoryEngine", "a" * 7)
        for key, subdir in (("storyengine", "StoryEngine"),
                            ("chiefAi", "chief-ai-machine"),
                            ("sekretBip", "Sekret-Bip")):
            self.write_federation(subdir, key)

    def write_peer(self, dirname, repo, expected):
        (self.root / dirname / ".peer-dependencies.json").write_text(json.dumps({
            "schema": "juss/peer-dependencies@v1",
            "peers": [{"repository": repo, "expectedCommit": expected}]
        }))

    def write_federation(self, dirname, key):
        (self.root / dirname / "control-room.manifest.json").write_text(json.dumps({
            "repository": PINS[key]["repository"], "portfolioHub": "jussray/founder-control-room",
            "authority": {"productionMutation": "separate-founder-gate"},
            "controlRoom": {"privateContentAllowed": False}
        }))

    def test_matching_peer_tuple(self):
        self.assertEqual(len(peer_checks(self.manifest, POLICY, self.root)["peerConstraints"]), 3)

    def test_stale_exact_peer_pin_fails(self):
        self.write_peer("StoryEngine", "jussray/chief-ai-machine", "d" * 7)
        with self.assertRaisesRegex(ValueError, "EXACT PEER CONFLICT"):
            peer_checks(self.manifest, POLICY, self.root)

    def test_absent_required_peer_manifest_fails(self):
        (self.root / "chief-ai-machine" / ".peer-dependencies.json").unlink()
        with self.assertRaisesRegex(ValueError, "missing required"):
            peer_checks(self.manifest, POLICY, self.root)

    def test_unknown_peer_rejected(self):
        self.write_peer("StoryEngine", "unowned/Example", "a" * 7)
        with self.assertRaisesRegex(ValueError, "unknown or self"):
            peer_checks(self.manifest, POLICY, self.root)

    def test_federation_has_private_boundary(self):
        self.assertFalse(federation_checks(self.manifest, self.root)["runtimeInteroperabilityTested"])

    def test_publication_mutation_cannot_be_auto(self):
        self.write_federation("StoryEngine", "storyengine")
        f = self.root / "StoryEngine" / "control-room.manifest.json"
        value = json.loads(f.read_text())
        value["authority"]["productionMutation"] = "automated"
        f.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "production mutation"):
            federation_checks(self.manifest, self.root)

    def test_private_content_cannot_federate(self):
        f = self.root / "Sekret-Bip" / "control-room.manifest.json"
        value = json.loads(f.read_text())
        value["controlRoom"]["privateContentAllowed"] = True
        f.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "private content"):
            federation_checks(self.manifest, self.root)

if __name__ == "__main__":
    unittest.main()
