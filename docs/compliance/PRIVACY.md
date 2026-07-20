# Privacy Policy

> **Founder Control Room** — Privacy Proof Document  
> Last updated: 2026-07-19

## 1. Data Controller
The Founder Control Room is operated by the account holder. No third-party advertising networks receive user data.

## 2. Data Collected
| Category | Examples | Purpose | Retention |
|---|---|---|---|
| Account data | Email, hashed password | Authentication | Until account deletion |
| Session data | JWT, device fingerprint | Security & UX | 30 days post-logout |
| Usage telemetry | Route visits, action counts | Product analytics | 12 months, anonymized |
| Infrastructure logs | IP, user-agent, timestamps | Abuse prevention | 90 days |

## 3. Data Not Collected
- No biometric data.
- No payment card numbers (handled by PCI-compliant third-party processor).
- No precise location.

## 4. Data Sharing
- **Supabase** (database & auth): bound by Supabase DPA and SOC 2 Type II controls.
- **Cloudflare** (edge, Workers, CDN): bound by Cloudflare DPA; data stays within selected regions.
- No sale or rental of personal data to third parties.

## 5. User Rights (GDPR / CCPA)
- **Access**: Users may export their data via the `/api/export` endpoint.
- **Rectification**: Users may update profile data in Settings.
- **Erasure**: See `ACCOUNT_DELETION.md` for the full deletion flow.
- **Portability**: Data export available as JSON.
- **Opt-out**: Telemetry can be disabled via `NEXT_PUBLIC_TELEMETRY=false`.

## 6. Cookies
- Supabase auth session: `sb-*` cookies, HttpOnly, SameSite=Lax, Secure.
- No third-party tracking cookies.

## 7. Children
The FCR is not directed at children under 13 (COPPA) or 16 (GDPR). Users must affirm they meet age requirements at sign-up.

## 8. Contact
Privacy inquiries: submit via the support channel documented in `SUPPORT.md`.
