# Exact-Head Quality Gate L99 — 2026-08-23

- **Authority:** workflow verification only; no merge or production authority is created.
- **State:** current main `55d12086f48f3052a053911e175e10cc968dfe7d`; repair branch derives from that exact commit.
- **Evidence:** every required quality-gate job must prove checkout HEAD equals `EXPECTED_HEAD_SHA`.
- **Rollback:** revert the focused workflow commit.
- **Blast radius:** GitHub Actions verification for pull requests targeting `main` or `staging`.
- **Freshness:** evidence expires whenever the branch head changes.
- **Compounding value:** closes a reusable false-green path where PR metadata names one SHA while runner execution certifies another.
