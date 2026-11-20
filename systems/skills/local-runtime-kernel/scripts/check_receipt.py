#!/usr/bin/env python3
"""Validate a runtime-kernel receipt. Exit 0 = consistent, 1 = violations, 2 = input error.

This checks receipt shape and internal consistency, not authenticity of evidence.
"""
import json
import sys

STATUSES = {"UNKNOWN", "CANDIDATE", "PROVEN"}
ROLES = ("REQUESTED", "AUTHORIZED", "EXECUTED", "OBSERVED", "VERIFIED", "DECIDED")
STATES = {"VERIFIED", "FAILED", "UNKNOWN", "RECONCILING", "BLOCKED"}
PHASES = ("DECLARE", "PERMIT", "ATTEMPT", "RECORD", "PROVE", "DECIDE")


def present(value):
    """Recognize non-empty evidence/bindings; never accept boolean placeholders."""
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return False


def normalized(value):
    return value.strip().casefold() if isinstance(value, str) else value


def check(r):
    errs = []
    if not isinstance(r, dict):
        return ["receipt must be a JSON object"]

    for field in ("slots", "who", "phase", "state", "must"):
        if field not in r:
            errs.append(f"missing required receipt field {field}")

    slots = r.get("slots", {})
    if not isinstance(slots, dict):
        errs.append("slots must be an object")
        slots = {}
    for name, s in slots.items():
        if not isinstance(s, dict):
            errs.append(f"{name}: slot must be an object")
            continue
        st = s.get("status", "UNKNOWN")
        if not isinstance(st, str) or st not in STATUSES:
            errs.append(f"{name}: bad status {st}")
        if st == "PROVEN" and not present(s.get("evidence")):
            errs.append(f"{name}: PROVEN without valid evidence")
    why = slots.get("WHY", {})
    if isinstance(why, dict) and why.get("status") == "PROVEN" and why.get("causal") is not True:
        errs.append("WHY: PROVEN on correlation/intent only (causal must be true)")

    who = r.get("who", {})
    if not isinstance(who, dict):
        errs.append("who must be an object")
        who = {}
    for role in ROLES:
        w = who.get(role, {"status": "UNKNOWN"})
        if not isinstance(w, dict):
            errs.append(f"WHO.{role}: role must be an object")
            continue
        st = w.get("status", "UNKNOWN")
        if not isinstance(st, str) or st not in STATUSES:
            errs.append(f"WHO.{role}: bad status {st}")
        if st == "PROVEN":
            actor = w.get("actor")
            if not isinstance(actor, str) or not actor.strip():
                errs.append(f"WHO.{role}: PROVEN without valid actor")
            elif normalized(actor).upper() in STATUSES:
                errs.append(f"WHO.{role}: PROVEN with sentinel actor {actor!r}")
            for k in ("identity", "action", "authority"):
                if not present(w.get(k)):
                    errs.append(f"WHO.{role}: PROVEN missing valid {k} binding")

    phase = r.get("phase")
    if not isinstance(phase, str) or phase not in PHASES:
        errs.append(f"bad phase {phase}")
    elif PHASES.index(phase) >= PHASES.index("PERMIT"):
        pa = r.get("prospective_authority", {})
        if not isinstance(pa, dict) or pa.get("status") != "PROVEN" or not present(pa.get("evidence")):
            errs.append("phase>=PERMIT without PROVEN prospective authority -> BLOCKED")

    state = r.get("state")
    if not isinstance(state, str) or state not in STATES:
        errs.append(f"bad state {state}")

    must = r.get("must", [])
    if not isinstance(must, list):
        errs.append("must must be an array of slot names")
        must = []
    elif any(not isinstance(m, str) or not m.strip() for m in must):
        errs.append("must contains an invalid slot name")
        must = [m for m in must if isinstance(m, str) and m.strip()]

    if state == "VERIFIED":
        if not must:
            errs.append("VERIFIED without declared Must slots")
        for m in must:
            s = slots.get(m, {})
            if not isinstance(s, dict) or s.get("status") != "PROVEN":
                errs.append(f"VERIFIED but Must slot {m} not PROVEN")
        ex = who.get("EXECUTED", {})
        ve = who.get("VERIFIED", {})
        ex = ex if isinstance(ex, dict) else {}
        ve = ve if isinstance(ve, dict) else {}
        if ex.get("status") != "PROVEN":
            errs.append("VERIFIED but WHO.EXECUTED not PROVEN")
        if ve.get("status") != "PROVEN":
            errs.append("VERIFIED but WHO.VERIFIED not PROVEN")
        if ex.get("status") == "PROVEN" and ve.get("status") == "PROVEN":
            same_actor = (isinstance(ex.get("actor"), str) and
                          isinstance(ve.get("actor"), str) and
                          normalized(ex["actor"]) == normalized(ve["actor"]))
            ex_id, ve_id = ex.get("identity"), ve.get("identity")
            same_identity = (present(ex_id) and present(ve_id) and
                             normalized(ex_id) == normalized(ve_id))
            if same_actor or same_identity:
                errs.append("self-certification: executor == sole verifier")
    return errs


def main():
    if len(sys.argv) != 2:
        print("usage: check_receipt.py receipt.json", file=sys.stderr)
        sys.exit(2)
    try:
        with open(sys.argv[1], encoding="utf-8") as f:
            receipt = json.load(f)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"input error: {exc}", file=sys.stderr)
        sys.exit(2)
    errs = check(receipt)
    if errs:
        print("VIOLATIONS:")
        for e in errs:
            print(" -", e)
        sys.exit(1)
    print("OK: receipt structurally consistent (evidence authenticity not verified)")


if __name__ == "__main__":
    main()
