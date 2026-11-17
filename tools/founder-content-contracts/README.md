# FCR Offline Social Post Checker

This is an **offline, advisory-only** companion to Founder Control Room's existing `tools/founder-content-contracts/content-analytics-audit-contract.cjs`, **not a substitute** for its provider-evidence or privacy contracts.

## Run

```bash
python3 tools/founder-content-contracts/eq_multi_check.py export.csv --platform facebook
python3 tools/founder-content-contracts/eq_multi_check.py export.csv --platform auto
python3 -m unittest discover -s tools/founder-content-contracts -p 'test_eq_multi_check.py' -v
```

`--platform auto` requires a `platform` column. Named platform mode checks for a conflicting value if that column exists. The platform mapping assumptions have NOT been validated against native exports. Inspect the provider CSV headers and metric definitions before using results.

## Non-authority and privacy

- Runs locally with Python standard library only; makes **no network calls**.
- Raw post text is read only for keyword cues; reports never include it.
- Numeric results are **not authenticated provider metrics**. Exports must be independently verified for source identity, account binding, observation window, and freshness.
- Missing metrics are `UNKNOWN`, not zero. Duplicate post identity is an error.
- Facebook/Instagram reach, LinkedIn/X impressions, TikTok views and Discord/Slack channel-member proxy are **different denominators**. Community proxy rates are disabled.
- `event%` counts multiple interaction events and may exceed 100%. It is not a unique-engager or causal impact measure.
- Text checks are lexical cues only, not a validated communication quality score.
- No publication, schedule, external-contact, provider, merge, or deployment authority is granted.
- Do **not** pass raw text/DMs/comments or unverified CLI output into FCR's normalized analytics receipt.

## Suggested future integration gate

Validate each actual native export's headers and measurement definitions, then add a provider-specific normalizer that emits only allowlisted, source-bound metric evidence into the existing FCR analytics observation contract. Keep content heuristic cues separate from authority-bearing audit data.
