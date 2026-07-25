#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "ERROR: OPENAI_API_KEY is not set." >&2
  exit 2
fi

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

http_status="$(curl --silent --show-error \
  --output "$response_file" \
  --write-out '%{http_code}' \
  https://api.openai.com/v1/models \
  -H "Authorization: Bearer ${OPENAI_API_KEY}")"

echo "OpenAI key health check HTTP status: ${http_status}"

case "$http_status" in
  200)
    echo "RESULT: authenticated. The key is accepted by OpenAI."
    echo "BOUNDARY: this does not prove Zapier, Buffer, HubSpot, the Founder Signal Engine bridge, or any social publication ran."
    ;;
  401)
    echo "RESULT: authentication failed. The key is invalid, revoked, expired, malformed, or not being supplied correctly." >&2
    exit 1
    ;;
  403)
    echo "RESULT: authenticated request was forbidden. Check project, organization, policy, or permission scope." >&2
    exit 1
    ;;
  429)
    echo "RESULT: authentication may be valid, but the request was rate- or quota-limited. Check project usage and billing." >&2
    exit 1
    ;;
  *)
    echo "RESULT: unexpected OpenAI API response. Inspect the redacted response below." >&2
    sed -E 's/sk-[A-Za-z0-9_-]+/[REDACTED_KEY]/g' "$response_file" >&2
    exit 1
    ;;
esac
