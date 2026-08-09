#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${N8N_COMPAT_IMAGE:-docker.n8n.io/n8nio/n8n:2.32.6}"
EXPECTED_VERSION="2.32.6"
EXPECTED_RECEIPT="fcr-conveyor-receipt-v3:f04d20268524639a485fb6f9b67fa2c53a79904016b942d78fe1df780816a1d3"
VOLUME="fcr-n8n-compat-${GITHUB_RUN_ID:-local}-${RANDOM}"
OUTPUT="$(mktemp)"

cleanup() {
  rm -f "$OUTPUT"
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker pull "$IMAGE"
docker volume create "$VOLUME" >/dev/null

run_n8n() {
  docker run --rm \
    -e NODE_FUNCTION_ALLOW_BUILTIN=crypto \
    -e N8N_DIAGNOSTICS_ENABLED=false \
    -e N8N_PERSONALIZATION_ENABLED=false \
    -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
    -v "$VOLUME:/home/node/.n8n" \
    -v "$ROOT/automation/n8n:/workflows:ro" \
    "$IMAGE" "$@"
}

version="$(run_n8n --version | tail -n 1 | tr -d '\r')"
test "$version" = "$EXPECTED_VERSION"

# First prove the production-shaped V3 artifact is accepted by the pinned runtime.
run_n8n import:workflow --input=/workflows/founder-conveyor.workflow.json

# Then execute a manual fixture that uses the same capability-plan-bound crypto receipt algorithm.
run_n8n import:workflow --input=/workflows/compat/receipt-code.workflow.json
run_n8n execute --id=fcrN8nCompatV1 >"$OUTPUT"

# The fixture throws on receipt drift, so a zero exit code is already proof.
# Retain the expected identity in a compact machine-readable receipt as well.
printf '{"verified":true,"n8nVersion":"%s","image":"%s","receiptId":"%s"}\n' \
  "$version" "$IMAGE" "$EXPECTED_RECEIPT"
