#!/usr/bin/env python3
"""Deterministic ACTUAL-FLOW V3 supersession receipts for founder content.

Observation-only. This module compares two cumulative observations for the same
published content subject, preserves the prior claim as historical when newer
evidence changes the conclusion, and emits a deterministic receipt plus the
next bounded strategy mutation. It never approves, schedules, publishes, or
mutates provider state.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONTRACT = "fcr/founder-content-supersession@v3"
INPUT_CONTRACT = "fcr/founder-content-supersession-input@v1"
AUTHORITY = "observation_only"
CANONICALIZATION = "fcr-json-v1"
SURPRISES = {
    "STRONGER_THAN_EXPECTED",
    "AS_EXPECTED",
    "WEAKER_THAN_EXPECTED",
    "UNEXPECTED_DIRECTION",
    "UNKNOWN",
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RECEIPT_RE = re.compile(r"^SUP-[0-9a-f]{16}$")


def _text(value: Any, field: str) -> str:
    out = str(value or "").strip()
    if not out:
        raise ValueError(f"{field} required")
    return out


def _nonnegative_int(value: Any, field: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a non-negative integer")
    try:
        out = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a non-negative integer") from exc
    if out < 0 or str(value).strip() not in {str(out), f"{out}.0"}:
        raise ValueError(f"{field} must be a non-negative integer")
    return out


def _observed_at(value: Any, field: str) -> tuple[str, datetime]:
    raw = _text(value, field)
    normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"{field} must be ISO-8601") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return raw, parsed.astimezone(timezone.utc)


def _source_digest(value: Any, field: str) -> str:
    digest = _text(value, field).lower()
    if not SHA256_RE.fullmatch(digest):
        raise ValueError(f"{field} must be a 64-character SHA-256 hex digest")
    return digest


def _rate(engagements: int, impressions: int) -> float:
    if impressions == 0:
        return 0.0
    return round((engagements / impressions) * 100, 2)


def _canonical_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def _classify(
    prior_impressions: int,
    prior_engagements: int,
    current_impressions: int,
    current_engagements: int,
) -> str:
    delta_impressions = current_impressions - prior_impressions
    delta_engagements = current_engagements - prior_engagements
    prior_rate = _rate(prior_engagements, prior_impressions)
    current_rate = _rate(current_engagements, current_impressions)

    if delta_impressions == 0 and delta_engagements == 0:
        return "UNKNOWN"
    if delta_impressions == 0 and delta_engagements > 0:
        return "UNEXPECTED_DIRECTION"
    if delta_impressions > 0 and delta_engagements == 0:
        return "WEAKER_THAN_EXPECTED"
    if current_rate < prior_rate:
        return "WEAKER_THAN_EXPECTED"
    if delta_engagements > 0 and current_rate > prior_rate:
        return "STRONGER_THAN_EXPECTED"
    return "AS_EXPECTED"


def build_supersession_receipt(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("contract") != INPUT_CONTRACT:
        raise ValueError(f"contract must equal {INPUT_CONTRACT}")

    subject = payload.get("subject")
    if not isinstance(subject, dict):
        raise ValueError("subject required")
    platform = _text(subject.get("platform"), "subject.platform")
    post_fingerprint = _text(subject.get("post_fingerprint"), "subject.post_fingerprint")

    prior = payload.get("prior")
    current = payload.get("current")
    if not isinstance(prior, dict) or not isinstance(current, dict):
        raise ValueError("prior and current observations required")

    prior_at_raw, prior_at = _observed_at(prior.get("observed_at"), "prior.observed_at")
    current_at_raw, current_at = _observed_at(current.get("observed_at"), "current.observed_at")
    if current_at <= prior_at:
        raise ValueError("current.observed_at must be later than prior.observed_at")

    prior_impressions = _nonnegative_int(prior.get("impressions"), "prior.impressions")
    current_impressions = _nonnegative_int(current.get("impressions"), "current.impressions")
    prior_engagements = _nonnegative_int(prior.get("engagements"), "prior.engagements")
    current_engagements = _nonnegative_int(current.get("engagements"), "current.engagements")
    if current_impressions < prior_impressions:
        raise ValueError("cumulative impressions must not decrease")
    if current_engagements < prior_engagements:
        raise ValueError("cumulative engagements must not decrease")

    prior_digest = _source_digest(prior.get("source_sha256"), "prior.source_sha256")
    current_digest = _source_digest(current.get("source_sha256"), "current.source_sha256")

    prior_claim = _text(prior.get("claim"), "prior.claim")
    current_claim = _text(current.get("claim"), "current.claim")
    expectation = _text(payload.get("expectation"), "expectation")

    mutation = payload.get("strategy_mutation")
    if not isinstance(mutation, dict):
        raise ValueError("strategy_mutation required")
    action = _text(mutation.get("action"), "strategy_mutation.action")
    next_gate = _text(mutation.get("next_gate"), "strategy_mutation.next_gate")

    predecessor = payload.get("predecessor_receipt_id")
    if predecessor is not None:
        raw_predecessor = _text(predecessor, "predecessor_receipt_id")
        candidate = f"SUP-{raw_predecessor.split('-', 1)[1].lower()}" if "-" in raw_predecessor else raw_predecessor
        if not RECEIPT_RE.fullmatch(candidate):
            raise ValueError("predecessor_receipt_id must match SUP-<16 hex>")
        predecessor = candidate

    prior_rate = _rate(prior_engagements, prior_impressions)
    current_rate = _rate(current_engagements, current_impressions)
    surprise = _classify(
        prior_impressions,
        prior_engagements,
        current_impressions,
        current_engagements,
    )
    if surprise not in SURPRISES:
        raise AssertionError("invalid surprise classification")

    body: dict[str, Any] = {
        "contract": CONTRACT,
        "authority": AUTHORITY,
        "canonicalization": CANONICALIZATION,
        "subject": {
            "platform": platform,
            "post_fingerprint": post_fingerprint,
        },
        "expectation": expectation,
        "evidence": [
            {
                "observed_at": prior_at_raw,
                "source_sha256": prior_digest,
                "metrics": {
                    "impressions": prior_impressions,
                    "engagements": prior_engagements,
                    "engagement_rate": prior_rate,
                },
                "evidence_state": "VERIFIED_HISTORICAL",
            },
            {
                "observed_at": current_at_raw,
                "source_sha256": current_digest,
                "metrics": {
                    "impressions": current_impressions,
                    "engagements": current_engagements,
                    "engagement_rate": current_rate,
                },
                "evidence_state": "VERIFIED_CURRENT",
            },
        ],
        "diff": {
            "impressions": current_impressions - prior_impressions,
            "engagements": current_engagements - prior_engagements,
            "engagement_rate_pp": round(current_rate - prior_rate, 2),
        },
        "surprise": surprise,
        "supersession": {
            "prior_claim": prior_claim,
            "prior_claim_state": "SUPERSEDED_HISTORICAL",
            "current_claim": current_claim,
            "current_claim_state": "VERIFIED_CURRENT",
        },
        "strategy_mutation": {
            "action": action,
            "next_gate": next_gate,
        },
        "provenance": {
            "source_digests_present": True,
            "claim_source_binding": "NOT_LOCKED_V3",
        },
    }
    if predecessor:
        body["predecessor_receipt_id"] = predecessor

    digest = hashlib.sha256(_canonical_bytes(body)).hexdigest()
    return {
        **body,
        "receipt_id": f"SUP-{digest[:16]}",
        "receipt_sha256": digest,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_json")
    parser.add_argument("--output")
    args = parser.parse_args()

    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    receipt = build_supersession_receipt(payload)
    encoded = json.dumps(receipt, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n", encoding="utf-8")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
