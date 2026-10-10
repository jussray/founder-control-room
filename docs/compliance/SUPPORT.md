# Support Policy

> **Founder Control Room** — Support Proof Document  
> Last updated: 2026-10-10  
> Verified: Content matches current architecture; no breaking changes since July 19

## 1. Support Channels
| Channel | Use Case | Response SLA |
|---|---|---|
| GitHub Issues (this repo) | Bug reports, feature requests | Triaged by severity; no response time guaranteed |
| Email (configured in Settings) | Account issues, privacy requests, account deletion | Triaged by severity; no response time guaranteed |
| In-app feedback widget | General feedback | Best effort |

## 2. Account & Privacy Requests
- Account deletion requests received via email will be processed within 72 hours per `ACCOUNT_DELETION.md`.
- Data export requests (GDPR Article 20) are fulfilled within 30 days.
- Privacy corrections processed within 14 days.

## 3. Security Vulnerability Reporting
- Responsible disclosure: follow the reporting instructions in the root `SECURITY.md`. The reporting address is held there until it is verified as configured and monitored.
- No acknowledgement or remediation timeline is published for security reports.
- Do **not** open public GitHub Issues for security vulnerabilities.

## 4. App Store Support URL
This document constitutes the technical support documentation required by:
- **Apple App Store Connect**: Support URL — point to `https://github.com/jussray/founder-control-room/blob/main/docs/compliance/SUPPORT.md`
- **Google Play Console**: Support email + support URL fields.

## 5. Incident Communication
- Status updates during outages are posted to the GitHub Discussions board.
- Affected users are notified by email when a confirmed incident affects them. No notification window is guaranteed.

## 6. Escalation Path
1. In-app feedback → auto-creates GitHub Issue with `triage` label.
2. Founder triages by severity and assigns priority; no triage window is guaranteed.
3. P0 (data loss / security breach) → prioritized founder response; remediation timing follows root `SECURITY.md`, which publishes no fixed patch-time guarantee.
