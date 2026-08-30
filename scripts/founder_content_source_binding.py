#!/usr/bin/env python3
"""ACTUAL-FLOW V4 source-byte binding for founder-content supersession receipts.

V4 is a strict successor layer over V3. It proves that the caller-supplied
SHA-256 digests in a V3 payload match actual source bytes supplied to this
verifier. Source-byte binding is stronger provenance, but it still does not
make the execution actor or the resulting claim independently verified.
Therefore claim/evidence states remain ATTESTED until a separate independent
witness/environment contract proves the verifier itself.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

MODULE = Path(__file__).with_name("founder_content_supersession.py")
spec = importlib.util.spec_from_file_location("founder_content_supersession", MODULE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

CONTRACT = "fcr/founder-content-supersession@v4"
SOURCE_BINDING = "sha256-source-bytes-v4"
VERIFICATION_CEILING = "ATTESTED"


def _verify_source_bytes(source_bytes: bytes, expected_digest: str, field: str) -> str:
    if not isinstance(source_bytes, bytes):
        raise ValueError(f"{field} must be bytes")
    actual = hashlib.sha256(source_bytes).hexdigest()
    if actual != expected_digest:
        raise ValueError(f"{field} sha256 does not match payload source_sha256")
    return actual


def _canonical_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def build_source_bound_supersession_receipt(
    payload: dict[str, Any],
    *,
    prior_source_bytes: bytes,
    current_source_bytes: bytes,
) -> dict[str, Any]:
    """Bind V3 attested evidence to actual source bytes without self-verifying."""
    receipt = mod.build_supersession_receipt(payload)

    prior_digest = receipt["evidence"][0]["source_sha256"]
    current_digest = receipt["evidence"][1]["source_sha256"]
    _verify_source_bytes(prior_source_bytes, prior_digest, "prior_source_bytes")
    _verify_source_bytes(current_source_bytes, current_digest, "current_source_bytes")

    body = {
        key: value
        for key, value in receipt.items()
        if key not in {"receipt_id", "receipt_sha256"}
    }
    body["contract"] = CONTRACT
    body["source_binding"] = {
        "contract": SOURCE_BINDING,
        "prior": {
            "source_sha256": prior_digest,
            "binding_state": "SOURCE_BYTES_MATCH_HISTORICAL",
        },
        "current": {
            "source_sha256": current_digest,
            "binding_state": "SOURCE_BYTES_MATCH_CURRENT",
        },
    }
    body["provenance"] = {
        **body["provenance"],
        "source_digest_verification": "VERIFIED_FROM_SOURCE_BYTES_V4",
        "claim_source_binding": "LOCKED_TO_SOURCE_BYTES_V4",
        "independent_witness": "NOT_PRESENT_V4",
        "execution_environment_attestation": "NOT_LOCKED_V4",
        "verification_ceiling": VERIFICATION_CEILING,
    }

    # Source-byte equality is provenance evidence only. It cannot upgrade the
    # executor's own observation/claim into VERIFIED without an independent
    # witness outside this execution boundary.
    body["evidence"][0]["evidence_state"] = "ATTESTED_HISTORICAL"
    body["evidence"][1]["evidence_state"] = "ATTESTED_CURRENT"
    body["supersession"]["current_claim_state"] = "ATTESTED_CURRENT"

    digest = hashlib.sha256(_canonical_bytes(body)).hexdigest()
    return {
        **body,
        "receipt_id": f"SUP-{digest[:16]}",
        "receipt_sha256": digest,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_json")
    parser.add_argument("--prior-source", required=True)
    parser.add_argument("--current-source", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()

    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    receipt = build_source_bound_supersession_receipt(
        payload,
        prior_source_bytes=Path(args.prior_source).read_bytes(),
        current_source_bytes=Path(args.current_source).read_bytes(),
    )
    encoded = json.dumps(receipt, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n", encoding="utf-8")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
