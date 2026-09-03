#!/usr/bin/env python3
"""Deterministic, observation-only LinkedIn follower cohort engine.

Consumes founder-authorized follower snapshots, derives stable profile fingerprints,
compares cohorts, and emits a redacted receipt suitable for repository evidence.
Raw names/profile URLs must remain in the private source artifact and are never
written into the public receipt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
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


def follower_fingerprint(profile_url: str | None = None, public_identifier: str | None = None) -> str:
    if profile_url:
        identity = _normalize_profile_url(profile_url)
    elif public_identifier:
        identity = f"linkedin-public-id:{public_identifier.strip().lower()}"
    else:
        raise ValueError("each follower requires profile_url or public_identifier; names alone are not stable identity")
    return hashlib.sha256(f"linkedin-follower|{identity}".encode()).hexdigest()[:24]


def _priority_score(item: dict[str, Any]) -> int:
    score = 0
    if item.get("high_value") is True:
        score += 3
    seniority = str(item.get("seniority") or "")
    relationship = str(item.get("relationship_signal") or "")
    if seniority in HIGH_SENIORITY:
        score += 2
    elif seniority in MID_SENIORITY:
        score += 1
    if relationship in HIGH_RELATIONSHIP:
        score += 2
    elif relationship in MID_RELATIONSHIP:
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
    datetime.fromisoformat(str(snapshot.get("observed_at") or "").replace("Z", "+00:00"))
    if not isinstance(snapshot.get("followers"), list):
        raise ValueError("followers must be a list")


def normalize_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    _validate_snapshot(snapshot)
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    unresolved = 0
    for raw in snapshot["followers"]:
        try:
            fp = follower_fingerprint(raw.get("profile_url"), raw.get("public_identifier"))
        except ValueError:
            unresolved += 1
            continue
        if fp in seen:
            continue
        seen.add(fp)
        normalized.append({
            "fingerprint": fp,
            "category": raw.get("category") or "Other",
            "seniority": raw.get("seniority") or "Unknown",
            "relationship_signal": raw.get("relationship_signal") or "Unknown",
            "project_relevance": raw.get("project_relevance") or "None/Unknown",
            "high_value": True if raw.get("high_value") is True else False,
            "priority_score": _priority_score(raw),
        })
    normalized.sort(key=lambda item: item["fingerprint"])
    return {
        "observed_at": snapshot["observed_at"],
        "source_authority": snapshot["source_authority"],
        "source_digest_sha256": snapshot["source_digest_sha256"].lower(),
        "completeness": snapshot["completeness"],
        "followers": normalized,
        "unresolved_identity_count": unresolved,
    }


def build_receipt(current_snapshot: dict[str, Any], previous_receipt: dict[str, Any] | None = None) -> dict[str, Any]:
    current = normalize_snapshot(current_snapshot)
    previous_items = (previous_receipt or {}).get("followers", [])
    previous_map = {item["fingerprint"]: item for item in previous_items if item.get("fingerprint")}
    current_map = {item["fingerprint"]: item for item in current["followers"]}

    previous_ids = set(previous_map)
    current_ids = set(current_map)
    new = sorted(current_ids - previous_ids)
    retained = sorted(current_ids & previous_ids)
    missing = sorted(previous_ids - current_ids)

    if previous_receipt is None:
        lost: list[str] = []
        unknown_missing: list[str] = []
    elif current["completeness"] == "COMPLETE_VISIBLE_LIST":
        lost = missing
        unknown_missing = []
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
        "contract": "linkedin-follower-cohort@v1",
        "authority": "observation_only",
        "privacy": {
            "raw_identity_persisted": False,
            "public_receipt_contains_names": False,
            "public_receipt_contains_profile_urls": False,
            "identity_key": "sha256(linkedin-follower|normalized-profile-identity)[:24]",
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
            "unknown_missing": len(unknown_missing),
        },
        "reconciliation": {
            "new": new,
            "retained": retained,
            "lost": lost,
            "unknown_missing": unknown_missing,
        },
        "followers": current["followers"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_json")
    parser.add_argument("--previous-receipt")
    parser.add_argument("--output")
    args = parser.parse_args()

    current = json.loads(Path(args.snapshot_json).read_text())
    previous = json.loads(Path(args.previous_receipt).read_text()) if args.previous_receipt else None
    receipt = build_receipt(current, previous)
    encoded = json.dumps(receipt, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
