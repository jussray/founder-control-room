# Cloudflare deploy credential fingerprint ledger

Append-only provenance for the `CLOUDFLARE_API_TOKEN` that GitHub Actions resolved
at each observation. Every row is **historical evidence tied to one run**; none is a
present-tense claim. Current credential truth is whatever the next run observes.

- **Fingerprint** = first 12 hex characters of SHA-256 of the exact secret value.
  It identifies a value without revealing it. Compare locally with
  `printf %s "$TOKEN" | sha256sum | cut -c1-12` (never paste the token anywhere).
- **Sources:** the read-only `Cloudflare Production Credential Diagnostic` workflow
  (`scripts/diagnose-cloudflare-credential.py`) and, from this ledger's introduction
  onward, the fail-closed gate `scripts/verify-cloudflare-token.sh`, which prints the
  fingerprint on every Deploy and Worker Reconcile run, pass or fail.
- **Rule:** record every distinct fingerprint and every run that observed one. Do not
  rotate a credential again without a row showing the current value is rejected.

| Observed (UTC) | Run | Scope | sha256_12 | Length | Cloudflare verdict | Classification |
|---|---|---|---|---|---|---|
| 2026-11-14 | 43552290490 (PR diagnostic) | repository | `91c0cec8c01b` | 53 | user verify 401 `1000`; account verify 401 `1000`; account read 403 `9109` | superseded: value later replaced |
| 2026-11-14 | 43552290490 (PR diagnostic) | production environment | `91c0cec8c01b` | 53 | same as above; identical value, so no environment override | superseded |
| 2026-11-17 | 44143289370 (main diagnostic, exact main `90edb626`) | production environment | `eafe1fd7a332` | 53 | user verify 401 `1000` (not a user token); account verify 200 `active`; account read 200 | historical: accepted when observed |
| 2026-11-17 | 44143398638 (Worker Reconcile, exact main `90edb626`) | production environment | not recorded (gate predates fingerprinting) | — | gate: accepted as active account token; upload then failed `10021` (Worker startup crash, not credential) | historical; fingerprint unattributed |

Earlier Reconcile runs 43061361109, 43137442093, 43238218634, 43548874447,
43549769756, 43551295292 and 43551472778 failed with `9109 Invalid access token`
before any fingerprint was recorded; their credential identity is **unknown**.
