#!/usr/bin/env python3
"""Merge LinkedIn's engagement-ranked and impression-ranked TOP POSTS lists.

Observation-only. Missing values caused by provider rank caps remain unknown, never zero.
The output is keyed by the existing deterministic post fingerprint.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from datetime import date
from pathlib import Path
from typing import Any

CONTINUITY_MODULE = Path(__file__).with_name("linkedin_analytics_continuity.py")
continuity_spec = importlib.util.spec_from_file_location("linkedin_analytics_continuity", CONTINUITY_MODULE)
if continuity_spec is None or continuity_spec.loader is None:
    raise RuntimeError("unable to load linkedin_analytics_continuity.py")
continuity = importlib.util.module_from_spec(continuity_spec)
continuity_spec.loader.exec_module(continuity)


def _extract_ranked(
    rows: list[list[str]],
    start: date,
    end: date,
    *,
    url_col: int,
    date_col: int,
    value_col: int,
    metric: str,
) -> tuple[dict[str, dict[str, Any]], int]:
    visible: dict[str, dict[str, Any]] = {}
    provider_rows = 0
    rank = 0
    for row in rows[3:]:
        if len(row) <= max(url_col, date_col, value_col):
            continue
        url = str(row[url_col] or "")
        if not url.startswith("https://www.linkedin.com/posts/"):
            continue
        provider_rows += 1
        try:
            publish_day = continuity._parse_date(str(row[date_col]))
        except ValueError:
            continue
        if not start <= publish_day <= end:
            continue
        rank += 1
        normalized = continuity._normalize_url(url)
        fp = continuity.post_fingerprint(publish_day, normalized)
        raw_value = row[value_col]
        value = int(float(raw_value)) if str(raw_value or "").strip() else None
        visible[fp] = {
            "fingerprint": fp,
            "publish_date": publish_day.isoformat(),
            f"{metric}_rank": rank,
            metric: value,
        }
    return visible, provider_rows


def _signal(item: dict[str, Any]) -> str:
    erank = item.get("engagements_rank")
    irank = item.get("impressions_rank")
    if erank is not None and irank is not None:
        if erank <= 10 and irank <= 10:
            return "BALANCED_TOP_10_VISIBLE"
        if erank <= 10:
            return "RESONANCE_LED_VISIBLE"
        if irank <= 10:
            return "REACH_LED_VISIBLE"
        return "VISIBLE_IN_BOTH_RANKINGS"
    if erank is not None:
        return "ENGAGEMENT_RANKED_ONLY"
    if irank is not None:
        return "IMPRESSION_RANKED_ONLY"
    return "UNKNOWN"


def analyze_performance(
    path: str | Path,
    start: date,
    end: date,
    *,
    window_role: str,
    export_limit: int = 50,
) -> dict[str, Any]:
    if window_role not in {"historical_365", "recent_90"}:
        raise ValueError("window_role must be historical_365 or recent_90")
    sheets = continuity.read_export(path)
    rows = sheets["TOP POSTS"]

    engagement, engagement_rows = _extract_ranked(
        rows, start, end, url_col=0, date_col=1, value_col=2, metric="engagements"
    )
    impressions, impression_rows = _extract_ranked(
        rows, start, end, url_col=4, date_col=5, value_col=6, metric="impressions"
    )

    merged: list[dict[str, Any]] = []
    for fp in sorted(set(engagement) | set(impressions)):
        item: dict[str, Any] = {"fingerprint": fp}
        if fp in engagement:
            item.update(engagement[fp])
        if fp in impressions:
            item.update(impressions[fp])
        has_engagements = item.get("engagements") is not None
        has_impressions = item.get("impressions") is not None
        if has_engagements and has_impressions and item["impressions"] > 0:
            item["engagement_rate"] = round(item["engagements"] / item["impressions"], 6)
            item["metric_completeness"] = "BOTH_VISIBLE"
        elif has_engagements:
            item["engagement_rate"] = None
            item["metric_completeness"] = "ENGAGEMENT_ONLY_VISIBLE"
        elif has_impressions:
            item["engagement_rate"] = None
            item["metric_completeness"] = "IMPRESSION_ONLY_VISIBLE"
        else:
            item["engagement_rate"] = None
            item["metric_completeness"] = "NO_RANKED_METRIC_VISIBLE"
        item["performance_signal"] = _signal(item)
        merged.append(item)

    counts: dict[str, int] = {}
    for item in merged:
        counts[item["performance_signal"]] = counts.get(item["performance_signal"], 0) + 1

    cookie_material = json.dumps(
        [
            {
                "fingerprint": item["fingerprint"],
                "engagements": item.get("engagements"),
                "engagements_rank": item.get("engagements_rank"),
                "impressions": item.get("impressions"),
                "impressions_rank": item.get("impressions_rank"),
            }
            for item in merged
        ],
        sort_keys=True,
        separators=(",", ":"),
    )

    return {
        "contract": "linkedin-post-performance@v1",
        "authority": "observation_only",
        "window": {
            "role": window_role,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "provider_rank_visibility": {
            "engagement_rows_visible": engagement_rows,
            "impression_rows_visible": impression_rows,
            "provider_export_limit": export_limit,
            "engagement_list_capped": engagement_rows >= export_limit,
            "impression_list_capped": impression_rows >= export_limit,
            "missing_metric_policy": "UNKNOWN_NOT_ZERO",
        },
        "summary": {
            "unique_ranked_posts": len(merged),
            "both_metrics_visible": sum(1 for item in merged if item["metric_completeness"] == "BOTH_VISIBLE"),
            "signals": dict(sorted(counts.items())),
        },
        "performance_cookie": "LI-PERF-" + hashlib.sha256(cookie_material.encode()).hexdigest()[:20],
        "posts": merged,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--window-role", required=True, choices=["historical_365", "recent_90"])
    parser.add_argument("--output")
    args = parser.parse_args()

    report = analyze_performance(
        args.xlsx,
        continuity._parse_date(args.start),
        continuity._parse_date(args.end),
        window_role=args.window_role,
    )
    encoded = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n")
    else:
        print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
