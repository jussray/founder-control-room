#!/usr/bin/env python3
import argparse
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

CONTRACT = "founder-control-room/python-research-summary@v1"
PREFIX = "fcr-python-summary-v1:"


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _unique_sorted(values):
    return sorted({item.strip() for item in values if isinstance(item, str) and item.strip()})


def _normalize_sources(values):
    by_url = {}
    for source in values if isinstance(values, list) else []:
        if not isinstance(source, dict):
            continue
        url = _text(source.get("url"))
        if not url:
            continue
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("research sources must use HTTPS URLs")
        by_url[url] = {"url": url, "title": _text(source.get("title"))}
    return [by_url[url] for url in sorted(by_url)]


def _seed(summary):
    return json.dumps([
        summary["contract"],
        summary["runId"],
        summary["projectSlug"],
        summary["expectedHeadSha"],
        summary["scriptVersion"],
        summary["generatedAt"],
        [[source["url"], source["title"]] for source in summary["sources"]],
        summary["claims"],
        summary["contradictions"],
        f'{summary["confidence"]:.6f}',
        summary["recommendation"],
    ], separators=(",", ":"), ensure_ascii=False)


def build_summary(raw):
    if not isinstance(raw, dict):
        raise ValueError("input must be a JSON object")

    run_id = _text(raw.get("runId"))
    project_slug = _text(raw.get("projectSlug"))
    expected_head_sha = _text(raw.get("expectedHeadSha")).lower()
    script_version = _text(raw.get("scriptVersion"))
    generated_at = _text(raw.get("generatedAt"))
    recommendation = _text(raw.get("recommendation"))

    if not run_id:
        raise ValueError("runId is required")
    if not project_slug:
        raise ValueError("projectSlug is required")
    if len(expected_head_sha) != 40 or any(ch not in "0123456789abcdef" for ch in expected_head_sha):
        raise ValueError("expectedHeadSha must be a full Git SHA")
    if not script_version:
        raise ValueError("scriptVersion is required")
    if not generated_at:
        raise ValueError("generatedAt is required")

    try:
        confidence = float(raw.get("confidence"))
    except (TypeError, ValueError) as exc:
        raise ValueError("confidence must be numeric") from exc
    if confidence < 0 or confidence > 1:
        raise ValueError("confidence must be between 0 and 1")

    sources = _normalize_sources(raw.get("sources"))
    if not sources:
        raise ValueError("at least one research source is required")

    summary = {
        "contract": CONTRACT,
        "runId": run_id,
        "projectSlug": project_slug,
        "expectedHeadSha": expected_head_sha,
        "scriptVersion": script_version,
        "generatedAt": generated_at,
        "sources": sources,
        "claims": _unique_sorted(raw.get("claims") or []),
        "contradictions": _unique_sorted(raw.get("contradictions") or []),
        "confidence": confidence,
        "recommendation": recommendation,
    }

    digest = hashlib.sha256(_seed(summary).encode("utf-8")).hexdigest()
    return {"summaryId": f"{PREFIX}{digest}", **summary}


def main():
    parser = argparse.ArgumentParser(description="Produce a deterministic FCR research summary evidence packet.")
    parser.add_argument("input", nargs="?", help="Input JSON file. Reads stdin when omitted.")
    parser.add_argument("--output", help="Optional output JSON file. Writes stdout when omitted.")
    args = parser.parse_args()

    raw_text = Path(args.input).read_text(encoding="utf-8") if args.input else sys.stdin.read()
    result = build_summary(json.loads(raw_text))
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"

    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)


if __name__ == "__main__":
    main()
