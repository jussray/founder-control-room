#!/usr/bin/env python3
"""Deterministic LinkedIn XLSX analytics continuity for Founder Control Room.

Observation-only: reads a LinkedIn analytics export and emits normalized evidence.
It never publishes, schedules, approves, or mutates provider state.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from zipfile import ZipFile
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "p": "http://schemas.openxmlformats.org/package/2006/relationships"}
CELL_RE = re.compile(r"([A-Z]+)(\d+)")
POST_ID_RE = re.compile(r"share-(\d+)-")


def _col_index(ref: str) -> int:
    match = CELL_RE.fullmatch(ref)
    if not match:
        raise ValueError(f"invalid cell reference: {ref}")
    letters = match.group(1)
    value = 0
    for char in letters:
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
        required = {"TOP POSTS", "ENGAGEMENT"}
        missing = sorted(required - paths.keys())
        if missing:
            raise ValueError(f"missing required LinkedIn sheets: {', '.join(missing)}")
        return {name: _sheet_rows(zf, paths[name], shared) for name in required}


def _parse_date(value: str) -> date:
    raw = str(value).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"unsupported date: {raw}")


def _normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def post_fingerprint(publish_date: date, url: str) -> str:
    canonical = f"linkedin|{publish_date.isoformat()}|{_normalize_url(url)}"
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def day_cookie(day: date, fingerprints: list[str]) -> str:
    material = "|".join(sorted(fingerprints)) if fingerprints else f"empty|{day.isoformat()}"
    digest = hashlib.sha256(material.encode()).hexdigest()[:12]
    return f"LI-DAY-{day.strftime('%Y%m%d')}-P{len(fingerprints):02d}-{digest}"


def _extract_posts(top_rows: list[list[str]], start: date, end: date) -> tuple[list[dict[str, Any]], int]:
    posts: list[dict[str, Any]] = []
    provider_rows = 0
    # LinkedIn's export places the impression-ranked list in columns E:G; row 3 is header.
    for row in top_rows[3:]:
        if len(row) < 7:
            continue
        url, raw_day, raw_impressions = row[4], row[5], row[6]
        if not url.startswith("https://www.linkedin.com/posts/"):
            continue
        provider_rows += 1
        try:
            publish_day = _parse_date(raw_day)
        except ValueError:
            continue
        if not start <= publish_day <= end:
            continue
        normalized = _normalize_url(url)
        match = POST_ID_RE.search(normalized)
        posts.append({
            "publish_date": publish_day.isoformat(),
            "linkedin_post_id": match.group(1) if match else None,
            "post_url": normalized,
            "impressions": int(float(raw_impressions)) if raw_impressions else None,
            "fingerprint": post_fingerprint(publish_day, normalized),
            "evidence_state": "VERIFIED_VISIBLE",
        })
    posts.sort(key=lambda item: (item["publish_date"], item["post_url"]))
    return posts, provider_rows


def _extract_activity(rows: list[list[str]]) -> dict[str, dict[str, int]]:
    activity: dict[str, dict[str, int]] = {}
    for row in rows[1:]:
        if len(row) < 3 or not row[0]:
            continue
        try:
            day = _parse_date(row[0]).isoformat()
        except ValueError:
            continue
        activity[day] = {
            "impressions": int(float(row[1] or 0)),
            "engagements": int(float(row[2] or 0)),
        }
    return activity


def analyze_export(path: str | Path, start: date, end: date, export_limit: int = 50) -> dict[str, Any]:
    if end < start:
        raise ValueError("end must not predate start")
    sheets = read_export(path)
    posts, provider_rows = _extract_posts(sheets["TOP POSTS"], start, end)
    activity = _extract_activity(sheets["ENGAGEMENT"])
    counts = Counter(item["publish_date"] for item in posts)
    fingerprints_by_day: dict[str, list[str]] = {}
    for item in posts:
        fingerprints_by_day.setdefault(item["publish_date"], []).append(item["fingerprint"])

    days: list[dict[str, Any]] = []
    cursor = start
    cumulative = 0
    while cursor <= end:
        key = cursor.isoformat()
        count = counts.get(key, 0)
        cumulative += count
        cadence = "NONE" if count == 0 else "SINGLE" if count == 1 else "DOUBLE" if count == 2 else "BURST"
        day_activity = activity.get(key, {"impressions": 0, "engagements": 0})
        days.append({
            "date": key,
            "verified_visible_posts": count,
            "active_day": count > 0,
            "cumulative_posts": cumulative,
            "cadence": cadence,
            "day_cookie": day_cookie(cursor, fingerprints_by_day.get(key, [])),
            "activity_impressions": day_activity["impressions"],
            "activity_engagements": day_activity["engagements"],
        })
        cursor += timedelta(days=1)

    windows: list[dict[str, Any]] = []
    cursor = start
    while cursor <= end:
        window_end = min(cursor + timedelta(days=6), end)
        window_days = [d for d in days if cursor.isoformat() <= d["date"] <= window_end.isoformat()]
        post_count = sum(d["verified_visible_posts"] for d in window_days)
        active_days = sum(1 for d in window_days if d["active_day"])
        windows.append({
            "start": cursor.isoformat(),
            "end": window_end.isoformat(),
            "posts": post_count,
            "active_posting_days": active_days,
            "posts_per_active_day": round(post_count / active_days, 4) if active_days else 0,
        })
        cursor = window_end + timedelta(days=1)

    active_days = sum(1 for d in days if d["active_day"])
    evidence_state = "VERIFIED_VISIBLE_FLOOR" if provider_rows >= export_limit else "VERIFIED_VISIBLE"
    return {
        "contract": "linkedin-analytics-continuity@v1",
        "authority": "observation_only",
        "source": {"filename": Path(path).name, "top_posts_rows_visible": provider_rows, "provider_export_limit": export_limit},
        "window": {"start": start.isoformat(), "end": end.isoformat(), "calendar_days": len(days)},
        "summary": {
            "evidence_state": evidence_state,
            "verified_visible_posts": len(posts),
            "active_posting_days": active_days,
            "posts_per_calendar_day": round(len(posts) / len(days), 4) if days else 0,
            "posts_per_active_day": round(len(posts) / active_days, 4) if active_days else 0,
            "max_posts_in_day": max((d["verified_visible_posts"] for d in days), default=0),
        },
        "days": days,
        "windows": windows,
        "posts": posts,
    }


def reconcile(previous: dict[str, Any] | None, current: dict[str, Any]) -> dict[str, list[str]]:
    previous_fps = {p["fingerprint"] for p in (previous or {}).get("posts", [])}
    current_fps = {p["fingerprint"] for p in current.get("posts", [])}
    return {
        "new": sorted(current_fps - previous_fps),
        "retained": sorted(current_fps & previous_fps),
        "missing_from_current_visible_set": sorted(previous_fps - current_fps),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--previous-json")
    parser.add_argument("--output")
    args = parser.parse_args()

    current = analyze_export(args.xlsx, _parse_date(args.start), _parse_date(args.end))
    previous = None
    if args.previous_json:
        previous = json.loads(Path(args.previous_json).read_text())
    current["reconciliation"] = reconcile(previous, current)
    encoded = json.dumps(current, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
