#!/usr/bin/env python3
"""Read-only diagnosis of the CLOUDFLARE_API_TOKEN a GitHub Actions job resolved.

Prints, for the token in $CLOUDFLARE_API_TOKEN:
  * presence, length and a 12-hex SHA-256 fingerprint (non-reversible) so the
    founder can compare with the token they created:
        printf %s "$NEW_TOKEN" | sha256sum | cut -c1-12
  * shape class (header-safe / whitespace / non-ASCII / prefixed)
  * Cloudflare verdicts from the user-token and account-token verify endpoints
  * whether GET /accounts/{account_id} is visible to the token
Never prints the token, never mutates anything, always exits 0 unless it crashes.
Usage: diagnose-cloudflare-credential.py <scope-label> <account_id>
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("CLOUDFLARE_API_BASE", "https://api.cloudflare.com/client/v4")
scope, account_id = sys.argv[1], sys.argv[2]
token = os.environ.get("CLOUDFLARE_API_TOKEN", "")


def call(path: str) -> str:
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except Exception as e:  # network/proxy failure is itself evidence
        return f"unreachable ({type(e).__name__})"
    try:
        d = json.loads(raw)
    except ValueError:
        return f"http={status} unparseable"
    codes = [e.get("code") for e in d.get("errors") or [] if isinstance(e, dict)]
    res = d.get("result") if isinstance(d.get("result"), dict) else {}
    return f"http={status} success={d.get('success')} status={res.get('status')} codes={codes}"


report = {"scope": scope, "present": bool(token)}
if token:
    report["length"] = len(token)
    report["sha256_12"] = hashlib.sha256(token.encode("utf-8", "surrogatepass")).hexdigest()[:12]
    try:
        token.encode("ascii")
        ascii_ok = True
    except UnicodeEncodeError:
        ascii_ok = False
    report["shape"] = (
        "non-ascii" if not ascii_ok
        else "whitespace" if any(c.isspace() for c in token)
        else "prefixed" if token.lower().startswith(("bearer ", "cloudflare_api_token="))
        else "quoted" if token[:1] in "\"'" and token[:1] == token[-1:]
        else "header-safe"
    )
    if ascii_ok and not any(c.isspace() for c in token):
        report["user_token_verify"] = call("/user/tokens/verify")
        report["account_token_verify"] = call(f"/accounts/{account_id}/tokens/verify")
        report["account_visible"] = call(f"/accounts/{account_id}")

for k, v in report.items():
    print(f"{k}: {v}")
with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as fh:
    fh.write(f"### Cloudflare credential as resolved by `{scope}`\n\n")
    fh.write("\n".join(f"- **{k}**: `{v}`" for k, v in report.items()) + "\n\n")
