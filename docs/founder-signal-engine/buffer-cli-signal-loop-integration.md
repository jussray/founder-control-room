# SignalLoop ↔ FCR Buffer CLI Integration

Status: source integration candidate; no provider write or deployment proven by this change.

## System ownership

- SignalLoop (JussAndCo/signal-loop) owns content intelligence and a non-authorizing, fingerprinted review handoff. Its public MCP remains read-only.
- Founder Control Room owns founder authority, security/content firewalls, exact-source validation, provider execution, ledger receipts, scheduling and evidence.
- Buffer owns destination account/channel connectivity and queue/scheduled delivery. CLI and MCP are transports, never approval authorities.

## What FCR can already do

FCR already includes first-party LinkedIn publishing, governed Buffer MCP plugin, and a bounded n8n/Buffer founder-content scheduling path. Their individual runtime and receipt evidence must be observed before any claim of live publication.
Do not route every post through SignalLoop. FCR may initiate and deliver its own exact-authorized founder social content.

## Node operator CLI preflight

Install Buffer CLI only on a trusted Node 20+ operator machine, not inside the Cloudflare Worker:

    npm install -g @bufferapp/cli
    npm run buffer:preflight
    npm run verify:buffer-cli

The preflight executes exactly: version, doctor, account, channels list. It returns only per-check status and discards all output from Buffer (including potentially sensitive account and token data). An unset API token or disconnected account must remain a failed/unproven result.

Provider secrets stay in protected runtime secrets or Buffer OAuth, never git, generated payloads, or logs.

## Publishing gate (no bypass)

1. Content enters the existing FCR truth firewall, source/exact-SHA and platform checks.
2. FCR obtains exact Current You or a validated, applicable standing grant and uses a durable one-time/idempotent execution reservation.
3. Only the existing governed publishing adapter may send a Buffer mutation. Never shell-execute arbitrary CLI flags or accept untrusted 'approved' fields as authorization.
4. Capture Buffer channel/post IDs and provider acceptance separately from terminal publication. Reconcile with provider readback and the destination platform artifact.
5. On unknown outcomes, do not blindly retry. Reconcile using the existing reservation/idempotency key.

Buffer CLI dry-run validation is not a live safety gate: it validates syntax locally, not founder identity, content policy, receipt persistence, or provider acceptance. This change deliberately does not add a direct ungoverned CLI write route.

## Continuity

SignalLoop's handoff fingerprint is content identity only, never an approval. FCR should bind that fingerprint to its own proposal/receipt, approval context, provider post ID, and supersession lineage. A missing or stale receipt leaves the item at draft/review.

## Rollback

Revert the FCR branch commit to remove only the CLI preflight and docs. Existing publisher code remains unchanged. Do not delete provider or approval history.
