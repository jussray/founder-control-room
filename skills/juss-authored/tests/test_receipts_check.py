"""Safety and evidence-integrity regression tests for receipt validation."""
import importlib.util
import pathlib
import tempfile
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "juss-os" / "scripts" / "receipts_check.py"
spec = importlib.util.spec_from_file_location("receipts_check", MODULE_PATH)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
HEAD = "a" * 40


def receipt(rid="start", pred="none", successor="none", timestamp="2026-11-03T12:00:00Z", evidence="proof.txt", evid_digest="", auth=None):
    return f"""RECEIPT-ID: {rid}
PREDECESSOR: {pred}
SUCCESSOR: {successor}
CREATED-AT: {timestamp}
AUTHORITY-DIGEST: jussray/example@{auth or HEAD}
EVIDENCE: {evidence}
EVIDENCE-DIGEST: {evid_digest}
"""


class ReceiptSafetyTests(unittest.TestCase):
    def test_digest_rejects_parent_escape(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "evidence").mkdir()
            (root / "private.txt").write_text("private")
            with self.assertRaises(ValueError):
                checker.digest(root / "evidence", ["../private.txt"])

    def test_digest_rejects_absolute_path(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "secret.txt").write_text("private")
            (root / "evidence").mkdir()
            with self.assertRaises(ValueError):
                checker.digest(root / "evidence", [str(root / "secret.txt")])

    def test_digest_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "evidence").mkdir()
            (root / "private.txt").write_text("private")
            (root / "evidence" / "link").symlink_to(root / "private.txt")
            with self.assertRaises(ValueError):
                checker.digest(root / "evidence", ["link"])

    def test_requires_head_for_verified_status(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "start.md").write_text(receipt(evid_digest=d))
            code, _, notes = checker.check(root, eroot=root)
            self.assertEqual(code, 3, notes)

    def test_short_head_does_not_approve_mismatch(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "start.md").write_text(receipt(evid_digest=d))
            code, _, _ = checker.check(root, head="a", eroot=root)
            self.assertNotEqual(code, 0)

    def test_timezone_naive_expiry_is_not_crash(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "start.md").write_text(receipt(timestamp="2026-11-03T12:00:00", evid_digest=d) + "RECHECK-BY: 2026-11-03T12:00:00\n")
            code, _, _ = checker.check(root, head=HEAD, eroot=root, now=datetime(2026,11,4,tzinfo=timezone.utc))
            self.assertNotEqual(code, 0)

    def test_broken_or_missing_successor_link(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "a.md").write_text(receipt(rid="a", evid_digest=d, successor="none"))
            (root / "b.md").write_text(receipt(rid="b", pred="a", evid_digest=d))
            code, _, _ = checker.check(root, head=HEAD, eroot=root)
            self.assertEqual(code, 2)

    def test_missing_evidence_file_reports_broken_not_crashes(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "start.md").write_text(receipt(evid_digest="sha256:" + "0" * 64))
            code, _, _ = checker.check(root, head=HEAD, eroot=root)
            self.assertEqual(code, 2)

    def test_historical_receipt_expiry_does_not_mark_current_tip_stale(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            old = receipt(rid="a", successor="b", evid_digest=d)
            (root / "a.md").write_text(old + "RECHECK-BY: 2026-11-03T12:00:00Z\n")
            current = receipt(rid="b", pred="a", evid_digest=d)
            (root / "b.md").write_text(current + "RECHECK-BY: 2026-12-03T12:00:00Z\n")
            code, _, notes = checker.check(root, head=HEAD, eroot=root, now=datetime(2026,11,4,tzinfo=timezone.utc))
            self.assertEqual(code, 0, notes)

    def test_idless_markdown_cannot_be_silently_ignored(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "start.md").write_text(receipt(evid_digest=d))
            (root / "injected.md").write_text("CREATED-AT: 2026-11-03T12:00:00Z\nAUTHORITY-DIGEST: jussray/other@" + "b" * 40 + "\n")
            code, _, _ = checker.check(root, head=HEAD, eroot=root)
            self.assertEqual(code, 2, "every .md receipt candidate must be accounted for")

    def test_duplicate_authority_digest_cannot_be_silently_ignored(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "start.md").write_text(receipt(evid_digest=d) + "AUTHORITY-DIGEST: jussray/other@" + "b" * 40 + "\n")
            code, _, _ = checker.check(root, head=HEAD, eroot=root)
            self.assertEqual(code, 2, "duplicate authority keys must reject the receipt")

    def test_future_dated_receipt_fails_closed(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "start.md").write_text(receipt(timestamp="2035-01-01T00:00:00Z", evid_digest=d))
            code, _, _ = checker.check(root, head=HEAD, eroot=root, now=datetime(2026, 11, 4, tzinfo=timezone.utc))
            self.assertEqual(code, 2)

    def test_multiple_authority_shas_fail_closed(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            # A second authority value inside the same field cannot be ignored.
            text = receipt(evid_digest=d).replace(
                "AUTHORITY-DIGEST: jussray/example@" + HEAD,
                "AUTHORITY-DIGEST: jussray/example@" + HEAD + " and other/repo@" + "b"*40,
            )
            (root / "start.md").write_text(text)
            code, _, _ = checker.check(root, head=HEAD, eroot=root)
            self.assertEqual(code, 2)

    def test_valid_chain_with_evidence_is_ok(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            (root / "proof.txt").write_text("hello")
            d = checker.digest(root, ["proof.txt"])
            (root / "a.md").write_text(receipt(rid="a", successor="b", evid_digest=d))
            (root / "b.md").write_text(receipt(rid="b", pred="a", evid_digest=d))
            code, _, _ = checker.check(root, head=HEAD, eroot=root)
            self.assertEqual(code, 0)


if __name__ == '__main__':
    unittest.main()
