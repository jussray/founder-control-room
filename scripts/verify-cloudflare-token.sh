#!/usr/bin/env bash
# Fail-closed Cloudflare credential gate for production Reconcile/Deploy.
#
# Proves the CLOUDFLARE_API_TOKEN this job resolved is accepted by Cloudflare
# BEFORE any Wrangler call. HTTP success alone is not enough: the response must
# carry success=true and result.status=="active". Tries the user-token verify
# endpoint first, then the account-token endpoint for the declared account.
# The token value is never printed and is passed to curl via stdin config, not argv.
#
# Usage: CLOUDFLARE_API_TOKEN=... scripts/verify-cloudflare-token.sh <account_id>
set -euo pipefail

ACCOUNT_ID="${1:-}"
API="${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo '::error title=Missing Cloudflare credential::CLOUDFLARE_API_TOKEN is empty in this job.'
  exit 1
fi
if [[ ! "$ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]]; then
  echo '::error title=Invalid Cloudflare account::A 32-character lowercase account_id argument is required.'
  exit 1
fi

verify() {
  # $1 = endpoint path; prints "active" when Cloudflare accepts the token.
  local body
  body="$(printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" \
    | curl -sS --max-time 20 -K - "$API$1" 2>/dev/null || true)"
  printf '%s' "$body" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("unparseable"); sys.exit(0)
if d.get("success") is True and (d.get("result") or {}).get("status") == "active":
    print("active")
else:
    codes = ",".join(str(e.get("code")) for e in (d.get("errors") or []) if isinstance(e, dict))
    status = (d.get("result") or {}).get("status") if isinstance(d.get("result"), dict) else None
    print(f"rejected codes=[{codes}] status={status}")
'
}

user_result="$(verify /user/tokens/verify)"
if [[ "$user_result" == active ]]; then
  echo 'Cloudflare accepted CLOUDFLARE_API_TOKEN as an active user API token. The token value was not printed.'
  exit 0
fi

account_result="$(verify "/accounts/$ACCOUNT_ID/tokens/verify")"
if [[ "$account_result" == active ]]; then
  echo 'Cloudflare accepted CLOUDFLARE_API_TOKEN as an active account API token for the declared account. The token value was not printed.'
  exit 0
fi

echo "::error title=Cloudflare rejected the deploy credential::user-token verify: ${user_result}; account-token verify: ${account_result}. The job resolved a CLOUDFLARE_API_TOKEN that Cloudflare does not accept. This job runs in the production environment, so a production environment secret named CLOUDFLARE_API_TOKEN overrides the repository secret. Replace the value at the level that wins, verify it first, and do not print or paste it."
exit 1
