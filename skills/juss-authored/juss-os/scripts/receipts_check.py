#!/usr/bin/env python3
"""Juss OS receipt chain checker.

Walks PREDECESSOR -> SUCCESSOR across receipt files, recomputes EVIDENCE-DIGEST,
compares AUTHORITY-DIGEST to the current head, and flags STALE / BROKEN state.

Receipt fields are `KEY: value` lines (see references/os.md, Continuity and receipts).
Evidence digest contract:
  EVIDENCE:         comma-separated artifact paths (relative to --evidence-root)
  EVIDENCE-DIGEST:  sha256:<hex> over, for each path in listed order,
                    path bytes + b"\\0" + file bytes + b"\\0"

Usage:
  receipts_check.py <receipts-dir> [--head <sha>] [--evidence-root <dir>] [--now <iso>]
  receipts_check.py --digest <evidence-root> <path> [<path> ...]   # print a digest to paste

Exit: 0 OK · 1 STALE (chain sound, out of date) · 2 BROKEN (chain or evidence invalid)
      3 UNVERIFIED (chain sound, but some evidence digest is a placeholder or unchecked)
Stdlib only.
"""
import argparse
import hashlib
import os
import re
import sys
from datetime import datetime, timezone

REQUIRED = ("RECEIPT-ID", "PREDECESSOR", "CREATED-AT", "AUTHORITY-DIGEST")
FIELD = re.compile(r"^([A-Z][A-Z0-9-]*(?: / [A-Z][A-Z0-9-]*)*):\s*(.*)$")
NONE = {"", "none", "n/a", "-"}


def digest(root, paths):
    h = hashlib.sha256()
    for p in paths:
        with open(os.path.join(root, p), "rb") as f:
            data = f.read()
        h.update(p.encode() + b"\0" + data + b"\0")
    return "sha256:" + h.hexdigest()


def parse(path):
    fields = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip().strip("`")
            m = FIELD.match(line)
            if m and m.group(1) not in fields:
                fields[m.group(1)] = m.group(2).strip()
    return fields


def parse_time(v):
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


def check(rdir, head=None, eroot=None, now=None):
    now = now or datetime.now(timezone.utc)
    broken, stale, notes = [], [], []
    receipts = {}
    for name in sorted(os.listdir(rdir)):
        if not name.endswith(".md"):
            continue
        f = parse(os.path.join(rdir, name))
        if "RECEIPT-ID" not in f:
            continue  # not a receipt (e.g. README)
        missing = [k for k in REQUIRED if not f.get(k)]
        if missing:
            broken.append(f"{name}: missing {', '.join(missing)}")
        rid = f["RECEIPT-ID"]
        if rid in receipts:
            broken.append(f"{name}: duplicate RECEIPT-ID {rid}")
        receipts[rid] = (name, f)

    if not receipts:
        return 2, ["BROKEN: no receipts found"], []

    pred = {rid: f.get("PREDECESSOR", "").strip() for rid, (_, f) in receipts.items()}
    roots = [r for r, p in pred.items() if p.lower() in NONE]
    children = {}
    for rid, p in pred.items():
        if p.lower() in NONE:
            continue
        if p not in receipts:
            broken.append(f"{rid}: PREDECESSOR {p} not found")
        children.setdefault(p, []).append(rid)
    if len(roots) != 1:
        broken.append(f"chain must have exactly one root, found {len(roots)}: {roots}")
    for p, kids in children.items():
        if len(kids) > 1:
            broken.append(f"fork: {p} has successors {sorted(kids)}")

    # successor back-links
    for rid, (_, f) in receipts.items():
        s = f.get("SUCCESSOR", "").strip()
        if s.lower() in NONE or s.startswith("<"):
            continue
        if s not in receipts or pred.get(s) != rid:
            broken.append(f"{rid}: SUCCESSOR {s} does not point back")

    # walk from root, detect cycles / orphans
    order = []
    if len(roots) == 1:
        cur, seen = roots[0], set()
        while cur:
            if cur in seen:
                broken.append(f"cycle at {cur}")
                break
            seen.add(cur)
            order.append(cur)
            kids = children.get(cur, [])
            cur = kids[0] if len(kids) == 1 else None
        orphans = set(receipts) - seen
        if orphans:
            broken.append(f"unreachable from root: {sorted(orphans)}")

    # per-receipt evidence + timestamps
    for rid, (name, f) in receipts.items():
        ed = f.get("EVIDENCE-DIGEST", "")
        if not ed or ed.startswith("<") or "sha256 of" in ed:
            notes.append(f"{rid}: EVIDENCE-DIGEST is a placeholder -> evidence INFERRED, not checked")
        elif not eroot:
            notes.append(f"{rid}: evidence not recomputed (no --evidence-root)")
        else:
            paths = [p.strip() for p in f.get("EVIDENCE", "").split(",") if p.strip()]
            if not paths:
                broken.append(f"{rid}: EVIDENCE-DIGEST set but no EVIDENCE paths listed")
            else:
                try:
                    actual = digest(eroot, paths)
                    if actual != ed:
                        broken.append(f"{rid}: EVIDENCE-DIGEST mismatch (recorded {ed[:19]}…, actual {actual[:19]}…)")
                except FileNotFoundError as e:
                    broken.append(f"{rid}: evidence missing: {e.filename}")
        if parse_time(f.get("CREATED-AT", "")) is None and f.get("CREATED-AT"):
            broken.append(f"{rid}: CREATED-AT not ISO-8601")

    tip = order[-1] if order else None
    if tip:
        _, f = receipts[tip]
        rb = parse_time(f.get("RECHECK-BY", ""))
        if rb and rb.tzinfo is None:
            rb = rb.replace(tzinfo=timezone.utc)
        if rb and rb < now:
            stale.append(f"{tip}: RECHECK-BY {f['RECHECK-BY']} has passed")
        if head:
            m = re.search(r"@([0-9a-fA-F]{7,40})", f.get("AUTHORITY-DIGEST", ""))
            if not m:
                broken.append(f"{tip}: AUTHORITY-DIGEST has no @<sha>")
            else:
                rec = m.group(1).lower()
                h = head.lower()
                if not (h.startswith(rec) or rec.startswith(h)):
                    stale.append(f"{tip}: AUTHORITY-DIGEST @{rec} != head {h}")

    lines = []
    if order:
        lines.append("CHAIN: " + " -> ".join(order))
    if broken:
        return 2, ["BROKEN"] + lines + [f"  ✗ {b}" for b in broken], notes
    if stale:
        return 1, ["STALE"] + lines + [f"  ! {s}" for s in stale], notes
    if notes:
        return 3, ["UNVERIFIED"] + lines + [f"TIP: {tip}"], notes
    return 0, ["OK"] + lines + [f"TIP: {tip}"], notes


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", nargs="?")
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--head")
    ap.add_argument("--evidence-root")
    ap.add_argument("--now")
    ap.add_argument("--digest", action="store_true", help="print EVIDENCE-DIGEST for <root> <paths…>")
    a = ap.parse_args(argv)
    if a.digest:
        if not a.target or not a.paths:
            ap.error("--digest needs <evidence-root> <path> [...]")
        print(digest(a.target, a.paths))
        return 0
    if not a.target:
        ap.error("receipts dir required")
    now = parse_time(a.now) if a.now else None
    code, lines, notes = check(a.target, a.head, a.evidence_root, now)
    print("\n".join(lines))
    for n in notes:
        print(f"  ~ {n}")
    return code


if __name__ == "__main__":
    sys.exit(main())
