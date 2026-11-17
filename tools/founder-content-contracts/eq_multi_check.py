#!/usr/bin/env python3
"""FCR offline social-post heuristic checker. No network, publishing or receipt authority.

Platform column mappings are unverified assumptions until checked against native exports.
Post text stays local, and is never included in report output.
"""
import argparse
import csv
import re
import statistics
from dataclasses import dataclass

PLATFORM_MAPS = {
    "facebook": {"id": "Post ID", "text": "Message", "date": "Publish time", "reach": "Reach", "reactions": "Reactions", "replies": "Comments", "shares": "Shares", "clicks": "Link clicks", "saves": None},
    "instagram": {"id": "Media ID", "text": "Caption", "date": "Publish time", "reach": "Reach", "reactions": "Likes", "replies": "Comments", "shares": "Shares", "saves": "Saves", "clicks": None},
    "linkedin": {"id": "Post URN", "text": "Post text", "date": "Created date", "reach": "Impressions", "reactions": "Reactions", "replies": "Comments", "shares": "Reposts", "clicks": "Clicks", "saves": None},
    "tiktok": {"id": "video_id", "text": "video_description", "date": "create_time", "reach": "video_views", "reactions": "likes", "replies": "comments", "shares": "shares", "saves": "favorites", "clicks": None},
    "x": {"id": "Tweet id", "text": "Tweet text", "date": "time", "reach": "impressions", "reactions": "likes", "replies": "replies", "shares": "retweets", "clicks": "url clicks", "saves": "bookmarks"},
    "discord": {"id": "message_id", "text": "content", "date": "timestamp", "reach": "channel_members", "reactions": "reactions", "replies": "replies", "shares": None, "saves": None, "clicks": None},
    "slack": {"id": "ts", "text": "text", "date": "date", "reach": "channel_members", "reactions": "reactions", "replies": "reply_count", "shares": None, "saves": None, "clicks": None},
}
PROXY_REACH = {"discord", "slack"}
DENOMINATOR = {"facebook": "reach", "instagram": "reach", "linkedin": "impressions", "tiktok": "views", "x": "impressions", "discord": "audience proxy", "slack": "audience proxy"}
METRICS = ("replies", "reactions", "shares", "saves", "clicks")
IMPACT = re.compile(r"\b(hurt|cost|impact|affected|missed|lost|saved|helped|because|result)\b", re.I)
CHOICE = re.compile(r"\?|\bwhich\b|\bwould you\b|\bwhat do you\b|\bchoose\b", re.I)
MINIMIZE = re.compile(r"\b(just|only|no big deal|these things happen|don't worry|trust me)\b", re.I)
SPECIFIC = re.compile(r"\d|\bthis (week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bby \w+", re.I)
COUNT = re.compile(r"(?:\d+|\d{1,3}(?:,\d{3})+)")

class ExportError(ValueError):
    pass

@dataclass(frozen=True)
class Post:
    post_id: str
    platform: str
    date: str
    text: str
    goal: str
    reach: int | None
    engagement: int | None
    missing: tuple[str, ...]

    def checks(self):
        if not self.text.strip():
            return None
        return {"impact_cue": bool(IMPACT.search(self.text)),
                "choice_cue": bool(CHOICE.search(self.text)),
                "no_minimization_cue": not bool(MINIMIZE.search(self.text)),
                "specificity_cue": bool(SPECIFIC.search(self.text))}

    def rate(self):
        # Count of interaction events / the native platform denominator; NOT unique engagers.
        if self.platform in PROXY_REACH or self.reach is None or self.engagement is None or self.reach == 0:
            return None
        return self.engagement / self.reach


def parse_count(value, label):
    if value is None or str(value).strip() == "":
        return None  # Missing is not zero.
    value = str(value).strip()
    if not COUNT.fullmatch(value):
        raise ExportError(f"{label}: invalid whole-number count {value!r}")
    return int(value.replace(",", ""))


def normalize(row, platform, headers, line):
    mapping = PLATFORM_MAPS[platform]
    for field in ("id", "text", "date"):
        if mapping[field] not in headers:
            raise ExportError(f"line {line}: {platform} missing required column {mapping[field]!r}; validate PLATFORM_MAPS")
    def get(field):
        col = mapping.get(field)
        return row.get(col) if col in headers else None
    post_id, date = str(get("id") or "").strip(), str(get("date") or "").strip()
    if not post_id or not date:
        raise ExportError(f"line {line}: post ID and date are required for identity")
    reach = parse_count(get("reach"), f"line {line} {platform} denominator")
    missing = ["denominator"] if reach is None else []
    counts = []
    for field in METRICS:
        if mapping.get(field) is None:
            continue  # Not defined in this platform map.
        value = parse_count(get(field), f"line {line} {platform} {field}")
        if value is None:
            missing.append(field)
        else:
            counts.append(value)
    # Partial sums must not be interpreted as a complete observed metric.
    engagement = sum(counts) if not any(f in METRICS for f in missing) else None
    return Post(post_id, platform, date, str(get("text") or ""), str(row.get("goal") or ""),
                reach, engagement, tuple(missing))


def load(path, platform):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise ExportError("Missing CSV header")
        headers = set(reader.fieldnames)
        if platform is None and "platform" not in headers:
            raise ExportError("--platform auto requires a 'platform' column")
        posts, seen = [], set()
        for line, row in enumerate(reader, 2):
            if None in row:
                raise ExportError(f"line {line}: more values than header columns")
            declared = str(row.get("platform") or "").strip().lower()
            if platform and declared and declared != platform:
                raise ExportError(f"line {line}: platform column conflicts with forced {platform}")
            chosen = platform or declared
            if chosen not in PLATFORM_MAPS:
                raise ExportError(f"line {line}: unknown/missing platform {chosen!r}")
            post = normalize(row, chosen, headers, line)
            if (post.platform, post.post_id) in seen:
                raise ExportError(f"line {line}: duplicate post identity; reconcile snapshots first")
            seen.add((post.platform, post.post_id))
            posts.append(post)
        return posts


def report(posts):
    if not posts:
        return "No posts loaded.\n"
    lines = [f"Posts loaded: {len(posts)}",
             "LOCAL_HEURISTIC_ONLY | EXPORT_MAPPINGS_UNVERIFIED | ADVISORY_ONLY | NO_PUBLICATION_AUTHORITY",
             "Counts are interaction events, not unique engaged users; source denominators differ.",
             "Discord/Slack audience proxies are never used to calculate rates."]
    if len(posts) < 10:
        lines.append("Warning: fewer than 10 posts; patterns are anecdotal.")
    lines.append("Scores are lexical cue counts (0-4), not validated quality or impact scores.\n")
    lines.append(f"{'platform':<11}{'post':<14}{'cues':<9}{'event%':<10}{'basis':<16}{'missing':<24}flags")
    scored = []
    for post in posts:
        cues = post.checks()
        score = sum(cues.values()) if cues is not None else None
        rate = post.rate()
        scored.append((post, score, rate))
        flags = ','.join(k for k, yes in (cues or {}).items() if yes) or '-'
        lines.append(f"{post.platform:<11}{post.post_id[:12]:<14}{(str(score)+'/4') if score is not None else 'UNKNOWN':<9}"
                     f"{(f'{rate*100:.2f}' if rate is not None else 'UNKNOWN'):<10}{DENOMINATOR[post.platform]:<16}"
                     f"{(','.join(post.missing) or '-'):<24}{flags}")
    lines.append("")
    for platform in sorted({p.platform for p in posts}):
        strong = [r for p, s, r in scored if p.platform == platform and s == 4 and r is not None]
        weak = [r for p, s, r in scored if p.platform == platform and s is not None and s < 4 and r is not None]
        if len(strong) >= 5 and len(weak) >= 5:
            lines.append(f"{platform}: median all-4 {statistics.median(strong)*100:.2f}% (n={len(strong)}) "
                         f"vs under-4 {statistics.median(weak)*100:.2f}% (n={len(weak)}) [descriptive, not causal]")
        else:
            lines.append(f"{platform}: INCOMPLETE comparison; >=5 observed posts in each group required")
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv_path')
    parser.add_argument('--platform', default='auto', choices=['auto', *PLATFORM_MAPS])
    args = parser.parse_args()
    try:
        posts = load(args.csv_path, None if args.platform == 'auto' else args.platform)
    except (ExportError, OSError) as exc:
        parser.error(str(exc))
    print(report(posts), end='')

if __name__ == '__main__':
    main()
