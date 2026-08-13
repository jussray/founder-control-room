#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REQUEST_CONTRACT = "fcr/capability-request@v1"
RECEIPT_CONTRACT = "fcr/capability-receipt@v1"
CAPABILITIES = {
    "repo.inspect",
    "repo.diff",
    "test.focused",
    "test.integration",
    "playwright.analyze",
    "dependency.inspect",
    "redteam.l99",
    "evidence.normalize",
}
FULL_SHA = set("0123456789abcdef")


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _full_sha(value: object) -> str:
    text = _text(value).lower()
    if len(text) != 40 or any(ch not in FULL_SHA for ch in text):
        raise ValueError("SHA must be a full 40-character hexadecimal Git SHA")
    return text


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _canonical_without_digest(receipt: dict) -> bytes:
    payload = {key: value for key, value in receipt.items() if key != "receiptDigest"}
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def build_receipt(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("input must be a JSON object")
    if raw.get("contract") != REQUEST_CONTRACT:
        raise ValueError("unsupported capability request contract")

    run_id = _text(raw.get("runId"))
    attempt_id = _text(raw.get("attemptId"))
    trace_id = _text(raw.get("traceId"))
    capability = _text(raw.get("capability"))
    expected_head_sha = _full_sha(raw.get("expectedHeadSha"))
    observed_head_sha = raw.get("observedHeadSha")
    execution = _text(raw.get("execution")) or "COMPLETED"

    if not run_id or not attempt_id or not trace_id:
        raise ValueError("runId, attemptId, and traceId are required")
    if capability not in CAPABILITIES:
        raise ValueError("unsupported capability")
    if execution not in {"COMPLETED", "BLOCKED", "FAILED"}:
        raise ValueError("unsupported execution status")

    observed = None if observed_head_sha is None else _full_sha(observed_head_sha)
    if execution == "COMPLETED" and observed != expected_head_sha:
        raise ValueError("completed capability receipt must bind to the exact requested head SHA")

    evidence = raw.get("evidence") or []
    if not isinstance(evidence, list):
        raise ValueError("evidence must be a list")

    normalized_evidence = []
    for item in evidence:
        if not isinstance(item, dict):
            raise ValueError("evidence entries must be objects")
        payload = item.get("payload")
        payload_raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        digest = _sha256(payload_raw)
        normalized_evidence.append({
            "evidenceId": f"fcr-evidence-v1:{digest}",
            "kind": _text(item.get("kind")) or "artifact",
            "verdict": _text(item.get("verdict")) or "INCONCLUSIVE",
            "digest": digest,
            "mediaType": "application/json",
            "size": len(payload_raw),
            "requestedHeadSha": expected_head_sha,
            "observedHeadSha": observed,
            "observedAt": _text(item.get("observedAt")) or _now_iso(),
        })

    receipt = {
        "contract": RECEIPT_CONTRACT,
        "runId": run_id,
        "attemptId": attempt_id,
        "traceId": trace_id,
        "capability": capability,
        "requestedHeadSha": expected_head_sha,
        "observedHeadSha": observed,
        "execution": execution,
        "evidence": normalized_evidence,
        "observations": [str(value) for value in (raw.get("observations") or []) if str(value).strip()],
        "inferences": [str(value) for value in (raw.get("inferences") or []) if str(value).strip()],
        "startedAt": _text(raw.get("startedAt")) or _now_iso(),
        "completedAt": _text(raw.get("completedAt")) or _now_iso(),
    }
    receipt["receiptDigest"] = _sha256(_canonical_without_digest(receipt))
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description="Produce a deterministic bounded FCR capability receipt.")
    parser.add_argument("input", nargs="?", help="Input JSON file. Reads stdin when omitted.")
    parser.add_argument("--output", help="Optional output JSON file. Writes stdout when omitted.")
    args = parser.parse_args()

    raw_text = Path(args.input).read_text(encoding="utf-8") if args.input else sys.stdin.read()
    receipt = build_receipt(json.loads(raw_text))
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)


if __name__ == "__main__":
    main()
