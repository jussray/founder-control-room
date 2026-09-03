#!/usr/bin/env python3
"""Privacy-safe, observation-only LinkedIn follower cohort engine.

Consumes founder-authorized follower snapshots, derives stable keyed member IDs,
compares cohorts, and emits a redacted receipt suitable for repository evidence.
Raw names/profile URLs remain in the private source artifact and are never written
into the public receipt. Public member IDs are HMAC-derived with a private key.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_AUTHORITIES = {
    "FOUNDER_AUTHENTICATED_LINKEDIN_SURFACE",
    "USER_SUPPLIED_LINKEDIN_EVIDENCE",
}
ALLOWED_COMPLETENESS = {"COMPLETE_VISIBLE_LIST", "PARTIAL_VISIBLE_LIST"}
ALLOWED_CATEGORIES = {
    "Founder/CEO",
    "Engineer/Technical",
    "Product/Design",
    "Recruiter/Talent",
    "Investor/Capital",
    "Operator/Executive",
    "Sales/Growth",
    "Creator/Media",
    "Student/Early Career",
    "Community/Public Sector",
    "Other",
}
ALLOWED_SENIORITY = {
    "Entry",
    "Mid",
    "Senior",
    "Manager",
    "Director",
    "VP",
    "CXO",
    "Owner/Founder",
    "Partner",
    "Unknown",
}
ALLOWED_RELATIONSHIP = {
    "Passive follower",
    "Engaged with content",
    "Mutual connection",
    "Direct conversation",
    "Opportunity",
    "Existing relationship",
    "Unknown",
}
ALLOWED_PROJECT_RELEVANCE = {
    "Portfolio",
    "FCR",
    "Se’kret Bip",
    "ULTRATHINK",
    "Career",
    "Commerce",
    "WaterTruth",
    "Multiple",
    "None/Unknown",
}
HIGH_SENIORITY = {"CXO", "Owner/Founder", "Partner", "VP"}
MID_SENIORITY = {"Director", "Senior"}
HIGH_RELATIONSHIP = {"Direct conversation", "Opportunity", "Existing relationship"}
MID_RELATIONSHIP = {"Engaged with content"}


def _normalize_profile_url(url: str) -> str:
    parts = urlsplit(url.strip())
    if parts.scheme.lower() not in {"http", "https"} or parts.netloc.lower() not in {
        "linkedin.com",
        "www.linkedin.com",
    }:
        raise ValueError("profile_url must be a linkedin.com URL")
    path = parts.path.rstrip("/")
    if not path.startswith("/in/"):
        raise ValueError("profile_url must identify a LinkedIn member profile")
    return urlunsplit(("https", "www.linkedin.com", path, "", ""))


def _identity_material(profile_url: str | None = None, public_identifier: str | None = None) -> str:
    if profile_url:
        return _normalize_profile_url(profile_url)
    if public_identifier:
        identifier = public_identifier.strip().lower()
        if not identifier:
            raise ValueError("public_identifier cannot be blank")
        return f"linkedin-public-id:{identifier}"
    raise ValueError("each follower requires profile_url or public_identifier; names alone are not stable identity")


def _key_bytes(identity_key: str | bytes) -> bytes:
    key = identity_key.encode() if isinstance(identity_key, str) else identity_key
    if len(key) < 32:
        raise ValueError("follower identity HMAC key must contain at least 32 bytes")
    return key


def follower_fingerprint(
    identity_key: str | bytes,
    profile_url: str | None = None,
    public_identifier: str | None = None,
) -> str:
    """Return a stable, dictionary-resistant public member ID.

    The key is private runtime material. It is never persisted in the receipt.
    """
    identity = _identity_material(profile_url, public_identifier)
    message = f"fcr/linkedin-follower-id@v1|{identity}".encode()
    return hmac.new(_key_bytes(identity_key), message, hashlib.sha256).hexdigest()[:32]


def _enum(value: Any, *, allowed: set[str], default: str, field: str) -> str:
    if value is None or value == "":
        return default
    if not isinstance(value, str) or value not in allowed:
        raise ValueError(f"{field} must use an allowed redacted enum value")
    return value


def _observed_at(value: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("observed_at must be RFC3339-compatible") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("observed_at must include a timezone")
    return parsed


def _priority_score(item: dict[str, Any]) -> int:
    score = 0
    if item["high_value"] is True:
        score += 3
    if item["seniority"] in HIGH_SENIORITY:
        score += 2
    elif item["seniority"] in MID_SENIORITY:
        score += 1
    if item["relationship_signal"] in HIGH_RELATIONSHIP:
        score += 2
    elif item["relationship_signal"] in MID_RELATIONSHIP:
        score += 1
    return score


def _validate_snapshot(snapshot: dict[str, Any]) -> None:
    if snapshot.get("contract") != "linkedin-follower-snapshot@v1":
        raise ValueError("unsupported follower snapshot contract")
    if snapshot.get("source_authority") not in ALLOWED_AUTHORITIES:
        raise ValueError("snapshot source authority is not allowed")
    if snapshot.get("completeness") not in ALLOWED_COMPLETENESS:
        raise ValueError("snapshot completeness must be COMPLETE_VISIBLE_LIST or PARTIAL_VISIBLE_LIST")
    digest = str(snapshot.get("source_digest_sha256") or "").lower()
    if not SHA256_RE.fullmatch(digest):
        raise ValueError("source_digest_sha256 must be a 64-character lowercase SHA-256 digest")
    _observed_at(snapshot.get("observed_at"))
    if not isinstance(snapshot.get("followers"), list):
        raise ValueError("followers must be a list")


def normalize_snapshot(snapshot: dict[str, Any], identity_key: str | bytes) -> dict[str, Any]:
    _validate_snapshot(snapshot)
    _key_bytes(identity_key)
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    unresolved = 0
    for raw in snapshot["followers"]:
        if not isinstance(raw, dict):
            raise ValueError("each follower entry must be an object")
        try:
            member_id = follower_fingerprint(identity_key, raw.get("profile_url"), raw.get("public_identifier"))
        except ValueError:
            unresolved += 1
            continue
        if member_id in seen:
            continue
        seen.add(member_id)
        if "high_value" in raw and not isinstance(raw["high_value"], bool):
            raise ValueError("high_value must be boolean when supplied")
        item = {
            "member_id": member_id,
            "category": _enum(raw.get("category"), allowed=ALLOWED_CATEGORIES, default="Other", field="category"),
            "seniority": _enum(raw.get("seniority"), allowed=ALLOWED_SENIORITY, default="Unknown", field="seniority"),
            "relationship_signal": _enum(
                raw.get("relationship_signal"),
                allowed=ALLOWED_RELATIONSHIP,
                default="Unknown",
                field="relationship_signal",
            ),
            "project_relevance": _enum(
                raw.get("project_relevance"),
                allowed=ALLOWED_PROJECT_RELEVANCE,
                default="None/Unknown",
                field="project_relevance",
            ),
            "high_value": raw.get("high_value") is True,
        }
        item["priority_score"] = _priority_score(item)
        normalized.append(item)
    normalized.sort(key=lambda item: item["member_id"])
    return {
        "observed_at": snapshot["observed_at"],
        "source_authority": snapshot["source_authority"],
        "source_digest_sha256": snapshot["source_digest_sha256"].lower(),
        "completeness": snapshot["completeness"],
        "followers": normalized,
        "unresolved_identity_count": unresolved,
    }


def _compatible_previous(previous_receipt: dict[str, Any] | None) -> dict[str, Any] | None:
    if previous_receipt is None:
        return None
    if previous_receipt.get("contract") != "linkedin-follower-cohort@v2":
        return None
    return previous_receipt


def build_receipt(
    current_snapshot: dict[str, Any],
    previous_receipt: dict[str, Any] | None = None,
    *,
    identity_key: str | bytes,
) -> dict[str, Any]:
    current = normalize_snapshot(current_snapshot, identity_key)
    previous = _compatible_previous(previous_receipt)
    if previous is not None and _observed_at(current["observed_at"]) <= _observed_at(previous.get("observed_at")):
        raise ValueError("current follower snapshot must be strictly newer than the previous cohort receipt")

    previous_items = (previous or {}).get("followers", [])
    previous_map = {item["member_id"]: item for item in previous_items if item.get("member_id")}
    current_map = {item["member_id"]: item for item in current["followers"]}
    previous_ids = set(previous_map)
    current_ids = set(current_map)

    retained = sorted(current_ids & previous_ids)
    visible_not_previously_seen = sorted(current_ids - previous_ids)
    missing = sorted(previous_ids - current_ids)
    previous_complete = bool(previous and previous.get("source", {}).get("completeness") == "COMPLETE_VISIBLE_LIST")

    if previous is None:
        new: list[str] = []
        baseline_or_unknown_added = sorted(current_ids)
        baseline_reason = "INITIAL_OR_LEGACY_PRIVACY_BASELINE"
    elif previous_complete:
        new = visible_not_previously_seen
        baseline_or_unknown_added = []
        baseline_reason = None
    else:
        new = []
        baseline_or_unknown_added = visible_not_previously_seen
        baseline_reason = "PRIOR_VISIBILITY_PARTIAL"

    if previous is not None and current["completeness"] == "COMPLETE_VISIBLE_LIST":
        lost = missing
        unknown_missing: list[str] = []
    else:
        lost = []
        unknown_missing = missing

    cohort_material = "|".join([
        current["observed_at"],
        current["source_digest_sha256"],
        current["completeness"],
        *sorted(current_ids),
    ])
    cohort_id = "LI-FOLLOWERS-" + hashlib.sha256(cohort_material.encode()).hexdigest()[:20]
    high_value = sum(1 for item in current["followers"] if item["high_value"])
    priority_ge_5 = sum(1 for item in current["followers"] if item["priority_score"] >= 5)

    return {
        "contract": "linkedin-follower-cohort@v2",
        "authority": "observation_only",
        "privacy": {
            "raw_identity_persisted": False,
            "public_receipt_contains_names": False,
            "public_receipt_contains_profile_urls": False,
            "member_identity_scheme": "HMAC-SHA256/private-runtime-key/v1",
            "private_key_persisted": False,
            "redacted_metadata_policy": "ALLOWLISTED_ENUMS_ONLY",
        },
        "cohort_id": cohort_id,
        "observed_at": current["observed_at"],
        "source": {
            "authority": current["source_authority"],
            "digest_sha256": current["source_digest_sha256"],
            "completeness": current["completeness"],
        },
        "summary": {
            "identified": len(current_ids),
            "unresolved_identity_count": current["unresolved_identity_count"],
            "high_value": high_value,
            "priority_ge_5": priority_ge_5,
            "new": len(new),
            "retained": len(retained),
            "lost": len(lost),
            "baseline_or_unknown_added": len(baseline_or_unknown_added),
            "unknown_missing": len(unknown_missing),
        },
        "reconciliation": {
            "new": new,
            "retained": retained,
            "lost": lost,
            "baseline_or_unknown_added": baseline_or_unknown_added,
            "unknown_missing": unknown_missing,
            "baseline_reason": baseline_reason,
        },
        "followers": current["followers"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_json")
    parser.add_argument("--previous-receipt")
    parser.add_argument("--output")
    args = parser.parse_args()

    identity_key = os.environ.get("LINKEDIN_FOLLOWER_ID_HMAC_KEY", "")
    if not identity_key:
        raise SystemExit("BLOCKED_PRIVACY_KEY: LINKEDIN_FOLLOWER_ID_HMAC_KEY is required")

    current = json.loads(Path(args.snapshot_json).read_text())
    previous = json.loads(Path(args.previous_receipt).read_text()) if args.previous_receipt else None
    receipt = build_receipt(current, previous, identity_key=identity_key)
    encoded = json.dumps(receipt, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
