#!/usr/bin/env bash
set -euo pipefail

: "${NEON_DB_URL:?NEON_DB_URL is required}"

uuid() {
  python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
}

RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$(date +%s%N)"
KEY_ID="founder-control-room:relay-v3.1:ci:race:${RUN_TOKEN}"
MESSAGE_ID="$(uuid)"
RECEIPT_ID="$(uuid)"
CHAIN_ID="$(uuid)"
LOGICAL_ID="$(uuid)"
NONCE="$(uuid)"
ISSUED_AT="$(date -u --date '-5 seconds' +'%Y-%m-%dT%H:%M:%S.000Z')"
EXPIRES_AT="$(date -u --date '+2 minutes' +'%Y-%m-%dT%H:%M:%S.000Z')"
KEY_VALID_FROM="$(date -u --date '-1 minute' +'%Y-%m-%dT%H:%M:%S.000Z')"
KEY_VALID_UNTIL="$(date -u --date '+10 minutes' +'%Y-%m-%dT%H:%M:%S.000Z')"
SOURCE_SHA="$(printf 'a%.0s' {1..40})"
TARGET_SHA="$(printf 'b%.0s' {1..40})"
SEMANTIC="$(printf 'a%.0s' {1..64})"
DELIVERY="$(printf 'b%.0s' {1..64})"
PAYLOAD="$(printf 'd%.0s' {1..64})"
EVIDENCE="$(printf 'e%.0s' {1..64})"
SUCCESSOR="Q4R:v3.1:$(printf 'c%.0s' {1..64})"

psql "$NEON_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v key_id="$KEY_ID" \
  -v valid_from="$KEY_VALID_FROM" \
  -v valid_until="$KEY_VALID_UNTIL" <<'SQL'
INSERT INTO public.federated_relay_v31_public_keys(
  member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until
) VALUES (
  'founder-control-room',
  :'key_id',
  'Ed25519',
  '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
  'active',
  :'valid_from'::timestamptz,
  :'valid_until'::timestamptz
);
SQL

run_accept() {
  psql "$NEON_DB_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -v message_id="$MESSAGE_ID" \
    -v receipt_id="$RECEIPT_ID" \
    -v chain_id="$CHAIN_ID" \
    -v logical_id="$LOGICAL_ID" \
    -v nonce="$NONCE" \
    -v key_id="$KEY_ID" \
    -v source_sha="$SOURCE_SHA" \
    -v target_sha="$TARGET_SHA" \
    -v semantic="$SEMANTIC" \
    -v delivery="$DELIVERY" \
    -v payload="$PAYLOAD" \
    -v evidence="$EVIDENCE" \
    -v successor="$SUCCESSOR" \
    -v issued_at="$ISSUED_AT" \
    -v expires_at="$EXPIRES_AT" <<'SQL'
SELECT delivery
FROM public.federated_relay_accept_v31(
  :'message_id'::uuid,
  :'semantic',
  :'delivery',
  :'receipt_id'::uuid,
  jsonb_build_object(
    'contract','juss/federated-agent-relay-receipt@v3.1',
    'receiptId',:'receipt_id',
    'messageId',:'message_id',
    'deliveryFingerprint',:'delivery',
    'successorProofCookie',:'successor',
    'executionAuthorized',false,
    'authorityTransferred',false,
    'approvalCarriedForward',false
  ),
  jsonb_build_object(
    'contract','juss/federated-agent-relay@v3.1',
    'messageId',:'message_id'
  ),
  :'chain_id'::uuid,
  0,
  :'logical_id'::uuid,
  'root',
  NULL::uuid,
  NULL::uuid,
  'founder-control-room',
  'jussray/founder-control-room',
  'main',
  :'source_sha',
  :'key_id',
  0,
  'chief-ai-machine',
  'jussray/chief-ai-machine',
  'main',
  :'target_sha',
  :'nonce'::uuid,
  'Q4R:v3.1:genesis',
  :'successor',
  :'payload',
  :'evidence',
  :'issued_at'::timestamptz,
  :'expires_at'::timestamptz,
  ARRAY[]::uuid[]
);
SQL
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

set +e
run_accept >"$tmp/one.out" 2>"$tmp/one.err" &
pid_one=$!
run_accept >"$tmp/two.out" 2>"$tmp/two.err" &
pid_two=$!
wait "$pid_one"; rc_one=$?
wait "$pid_two"; rc_two=$?
set -e

if [ "$rc_one" -ne 0 ] || [ "$rc_two" -ne 0 ]; then
  echo "::error title=Relay concurrency call failed::first=$rc_one second=$rc_two"
  sed -n '1,20p' "$tmp/one.err" >&2
  sed -n '1,20p' "$tmp/two.err" >&2
  exit 1
fi

mapfile -t deliveries < <(cat "$tmp/one.out" "$tmp/two.out" | grep -E '^(accepted|duplicate)$' | sort)
if [ "${#deliveries[@]}" -ne 2 ] || [ "${deliveries[0]}" != "accepted" ] || [ "${deliveries[1]}" != "duplicate" ]; then
  echo "::error title=Relay exact-retry race failed::expected one accepted and one duplicate"
  printf 'observed=%s\n' "${deliveries[*]:-none}"
  exit 1
fi

stored="$(psql "$NEON_DB_URL" -X -Atq -v ON_ERROR_STOP=1 -v message_id="$MESSAGE_ID" \
  -c "SELECT count(*) FROM public.federated_relay_v31_messages WHERE message_id = :'message_id'::uuid;")"
test "$stored" = "1"

echo "Relay v3.1 Neon concurrency proof passed: one accepted, one duplicate, one durable message."
