# Exact-SHA Cloudflare deployment proof

## Purpose

A successful merge or a generic HTTP 200 is not proof that the expected Founder Control Room code is live. Production proof requires the deployed Worker to report the exact GitHub commit SHA that triggered the deployment.

## Deployment contract

The production deploy workflow:

1. pushes Supabase migrations;
2. deploys the Cloudflare Worker with `GIT_SHA` set to `github.sha`;
3. stores a social-only Founder Signal automation grant in the Worker secret store;
4. verifies `/health` returns the expected Worker payload;
5. verifies `/version` reports the exact triggering SHA;
6. verifies `/guardrails.json` remains public-safe;
7. runs the existing database reconciliation inspection with the Supabase HTTP project URL.

## Social-only standing grant

The configured grant permits only these routes:

- LinkedIn + `build-in-public`;
- Facebook + `build-in-public`.

It contains no Gmail route and keeps `approvedRecipientIds` empty. Investor email therefore remains blocked even if a caller attempts to provide recipient context.

## Evidence boundary

Exact deployment proof does not by itself prove a completed social post. Day 3 remains incomplete until a policy-authorized invocation retains:

- exact signed repository evidence;
- the policy audit decision;
- a Zapier run ID;
- a LinkedIn or Facebook platform receipt;
- final Founder Control Room evidence.

## Reconciliation boundary

The deployment workflow performs database inspection only. Cross-service POST reconciliation remains disabled until the deployed Worker has a durable ingestion consumer; the previous undeployed Next-style `/api/reconcile` route is not treated as runtime evidence.

## Rollback

Remove or disable `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON`, or revert the deployment-proof change. Either action blocks automatic social distribution before the downstream provider call.
