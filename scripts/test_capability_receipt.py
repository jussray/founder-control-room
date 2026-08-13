import unittest

from scripts.capability_receipt import build_receipt


SHA = "a" * 40
OTHER_SHA = "b" * 40


class CapabilityReceiptTests(unittest.TestCase):
    def request(self) -> dict:
        return {
            "contract": "fcr/capability-request@v1",
            "runId": "run-1",
            "attemptId": "attempt-1",
            "traceId": "trace-1",
            "expectedHeadSha": SHA,
            "capability": "repo.inspect",
            "observedHeadSha": SHA,
            "execution": "COMPLETED",
            "evidence": [{
                "kind": "artifact",
                "verdict": "PASS",
                "payload": {"head": SHA, "clean": True},
                "observedAt": "2026-08-13T00:00:00+00:00",
            }],
            "observations": ["checkout matched requested SHA"],
            "inferences": [],
            "startedAt": "2026-08-13T00:00:00+00:00",
            "completedAt": "2026-08-13T00:00:01+00:00",
        }

    def test_deterministic_receipt_digest_for_fixed_input(self) -> None:
        first = build_receipt(self.request())
        second = build_receipt(self.request())
        self.assertEqual(first["receiptDigest"], second["receiptDigest"])
        self.assertEqual(first["evidence"][0]["digest"], second["evidence"][0]["digest"])

    def test_completed_receipt_rejects_stale_sha(self) -> None:
        raw = self.request()
        raw["observedHeadSha"] = OTHER_SHA
        with self.assertRaisesRegex(ValueError, "exact requested head SHA"):
            build_receipt(raw)

    def test_blocked_receipt_can_report_observed_mismatch(self) -> None:
        raw = self.request()
        raw["execution"] = "BLOCKED"
        raw["observedHeadSha"] = OTHER_SHA
        result = build_receipt(raw)
        self.assertEqual(result["execution"], "BLOCKED")
        self.assertEqual(result["requestedHeadSha"], SHA)
        self.assertEqual(result["observedHeadSha"], OTHER_SHA)

    def test_rejects_unregistered_capability(self) -> None:
        raw = self.request()
        raw["capability"] = "shell.arbitrary"
        with self.assertRaisesRegex(ValueError, "unsupported capability"):
            build_receipt(raw)


if __name__ == "__main__":
    unittest.main()
