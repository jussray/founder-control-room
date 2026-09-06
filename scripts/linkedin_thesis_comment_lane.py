#!/usr/bin/env python3
"""Observation-only LinkedIn thesis-comment experiment lane.

Reads LinkedIn AggregateAnalytics XLSX exports and emits a deterministic baseline +
field-test contract. It never posts, comments, schedules, approves, or mutates
LinkedIn/provider state.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from zipfile import ZipFile
from xml.etree import ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
}
CELL_RE = re.compile(r"([A-Z]+)(\d+)")
REQUIRED_SHEETS = {
    "DISCOVERY",
    "ENGAGEMENT",
    "FOLLOWERS",
    "AUDIENCE DEMOGRAPHICS",
}
EVIDENCE_DECISION_LOOP_CONTRACT = "juss/evidence-decision-loop@v1"

LANE_CONTRACT: dict[str, Any] = {
    "id": "linkedin_thesis_comment",
    "version": 1,
    "decision_loop_contract": EVIDENCE_DECISION_LOOP_CONTRACT,
    "surface": "linkedin_comment",
    "authority": "observation_only",
    "execution": "founder_manual_only",
    "status": "approved_test",
    "objective": "Earn qualified profile attention by adding an original thesis to relevant conversations instead of generic praise.",
    "comment_shape": {
        "sentences": "1-3",
        "sequence": ["sharp_observation", "original_implication", "memorable_line"],
        "avoid": ["generic_praise", "link_drop", "copied_template", "engagement_bait"],
    },
    "test": {
        "window_days": 7,
        "target_comments": 6,
        "max_comments_per_day": 2,
        "primary_signals": [
            "qualified_conversations",
            "profile_views",
            "follower_movement",
        ],
        "secondary_signals": [
            "relevant_author_replies",
            "comment_reactions",
            "comment_impressions",
        ],
        "winner_rule": "At least one primary signal must improve; raw impressions alone cannot declare a winner.",
        "failure_rule": "Stop or revise if comments earn reach without qualified response, repeat the same angle, or create audience mismatch.",
    },
    "truth_boundary": {
        "founder_confirmation": "OBSERVED execution evidence only; not independent platform or outcome verification",
        "comment_posted": "UNKNOWN until founder/manual platform confirmation",
        "outcome": "UNKNOWN until a later analytics snapshot and qualified-response evidence exist",
        "auto_publish": False,
    },
}


def _col_index(ref: str) -> int:
    match = CELL_RE.fullmatch(ref)
    if not match:
        raise ValueError(f"invalid cell reference: {ref}")
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def _shared_strings(zf: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.findall(".//m:t", NS)) for item in root.findall("m:si", NS)]


def _sheet_paths(zf: ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("p:Relationship", NS)}
    out: dict[str, str] = {}
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        rid = sheet.attrib[f"{{{NS['r']}}}id"]
        target = targets[rid].lstrip("/")
        out[sheet.attrib["name"]] = target if target.startswith("xl/") else f"xl/{target}"
    return out


def _sheet_rows(zf: ZipFile, sheet_path: str, shared: list[str]) -> list[list[str]]:
    root = ET.fromstring(zf.read(sheet_path))
    rows: list[list[str]] = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        values: dict[int, str] = {}
        max_col = -1
        for cell in row.findall("m:c", NS):
            ref = cell.attrib.get("r", "")
            if not ref:
                continue
            idx = _col_index(ref)
            max_col = max(max_col, idx)
            kind = cell.attrib.get("t")
            value_node = cell.find("m:v", NS)
            if kind == "inlineStr":
                text = "".join(n.text or "" for n in cell.findall(".//m:t", NS))
            elif value_node is None:
                text = ""
            elif kind == "s":
                text = shared[int(value_node.text or "0")]
            else:
                text = value_node.text or ""
            values[idx] = text
        rows.append([values.get(i, "") for i in range(max_col + 1)] if max_col >= 0 else [])
    return rows


def read_export(path: str | Path) -> dict[str, list[list[str]]]:
    with ZipFile(path) as zf:
        shared = _shared_strings(zf)
        paths = _sheet_paths(zf)
        missing = sorted(REQUIRED_SHEETS - paths.keys())
        if missing:
            raise ValueError(f"missing required LinkedIn sheets: {', '.join(missing)}")
        return {name: _sheet_rows(zf, paths[name], shared) for name in REQUIRED_SHEETS}


def _int(value: str | None) -> int:
    raw = str(value or "").strip().replace(",", "")
    return int(float(raw)) if raw else 0


def _percent(value: str | None) -> float | None:
    raw = str(value or "").strip()
    if not raw or raw.startswith("<"):
        return None
    return float(raw.rstrip("%"))


def _lookup(rows: list[list[str]], key: str) -> str | None:
    for row in rows:
        if row and row[0].strip() == key:
            return row[1] if len(row) > 1 else None
    return None


def _audience_percent(rows: list[list[str]], value: str) -> float | None:
    for row in rows[1:]:
        if len(row) >= 3 and row[0].strip() == "Seniority" and row[1].strip() == value:
            return _percent(row[2])
    return None


def _normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def comment_fingerprint(post_url: str, comment_text: str) -> str:
    normalized_text = " ".join(comment_text.split()).strip().lower()
    material = f"linkedin-comment|{_normalize_url(post_url)}|{normalized_text}"
    return hashlib.sha256(material.encode()).hexdigest()[:16]


def analyze_export(path: str | Path) -> dict[str, Any]:
    sheets = read_export(path)

    discovery = sheets["DISCOVERY"]
    engagement = sheets["ENGAGEMENT"]
    followers = sheets["FOLLOWERS"]
    audience = sheets["AUDIENCE DEMOGRAPHICS"]

    impressions = _int(_lookup(discovery, "Impressions"))
    members_reached = _int(_lookup(discovery, "Members reached"))
    engagements = sum(_int(row[2] if len(row) > 2 else None) for row in engagement[1:] if row)

    followers_total = 0
    if followers and followers[0]:
        followers_total = _int(followers[0][1] if len(followers[0]) > 1 else None)
    follower_movement = sum(_int(row[1] if len(row) > 1 else None) for row in followers[3:] if row)

    senior_pct = _audience_percent(audience, "Senior")
    cxo_pct = _audience_percent(audience, "CXO")

    engagement_rate = round((engagements / impressions) * 100, 4) if impressions else 0.0

    return {
        "contract": "linkedin-thesis-comment-lane@v1",
        "decision_loop_contract": EVIDENCE_DECISION_LOOP_CONTRACT,
        "authority": "observation_only",
        "source": {"filename": Path(path).name},
        "lane": LANE_CONTRACT,
        "baseline": {
            "impressions": impressions,
            "members_reached": members_reached,
            "engagements": engagements,
            "engagement_rate_pct": engagement_rate,
            "followers_total": followers_total,
            "follower_movement": follower_movement,
            "audience_senior_pct": senior_pct,
            "audience_cxo_pct": cxo_pct,
        },
        "hypothesis": {
            "audience_fit": "Senior/CXO-heavy audience should respond better to compact original product theses than generic praise.",
            "expected_behavior": "Qualified profile attention and conversations improve without requiring higher raw impression volume.",
        },
        "field_test": {
            "state": "READY_TO_TEST",
            "execution_state": "UNKNOWN",
            "outcome_state": "UNKNOWN",
            "required_comment_receipts": LANE_CONTRACT["test"]["target_comments"],
            "next_measurement": "Compare the next equivalent analytics snapshot plus manually confirmed qualified replies/conversations.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx")
    parser.add_argument("--output")
    args = parser.parse_args()

    report = analyze_export(args.xlsx)
    encoded = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
