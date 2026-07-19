# Founder Control Room Plugin Center

Plugin Center is the governed capability layer for Founder Control Room. It turns external tools into declared, inspectable, founder-gated capability cards instead of invisible agent powers.

Subtitle: **Connect tools. Gate power. Preserve proof.**

## Why it exists

Founder Control Room already has project connection slots through `project_connections`. Plugin Center raises that into an operator-grade control surface:

- what tools are connected;
- what each tool is allowed to do;
- what authority level that power reaches;
- what data boundary applies;
- what secrets are referenced without exposing the credential;
- what temporary exceptions exist;
- when those exceptions expire or are revoked.

The center is intentionally an **inventory and authority contract**, not a magic bypass. Execution still goes through `requireFounder`, proof gates, `approval_executions`, provider adapters, audit rows, and rollback-specific approvals.

## Standards

1. **No secret sprawl**
   - Store only `secret_ref`, never credential values.
   - No tokens in `config`, docs, browser payloads, logs, temporary grants, or committed settings.

2. **No approval carry-forward**
   - Read authority does not imply write authority.
   - Branch authority does not imply merge authority.
   - Merge authority does not imply deploy, billing, credential, deletion, provider, or external communication authority.

3. **High-risk actions are separate gates**
   - L5 integration and L6 production/commercial/provider actions require explicit proof and founder authority.
   - Temporary permission grants are audit records, not permanent power.

4. **Provider independence**
   - GitHub, Supabase, Cloudflare, AI providers, design tools, commerce, and communications are replaceable adapters.
   - Plugin Center must not hardcode one provider as constitutional infrastructure.

5. **Evidence before trust**
   - Health checks record observation.
   - Proof gates record exact-head machine evidence.
   - Temporary grants record reason, usage limit, expiry, and revocation.

## API surface

### `GET /plugin-center`

Founder-only aggregate view of:

- Plugin Center contract;
- L0-L6 authority levels;
- plugin catalog;
- all registered project connections;
- active temporary grants;
- summary counts for active/error/high-risk/missing-authority connections.

### `POST /plugin-center/grants`

Founder-only temporary grant ledger.

Accepted body:

```json
{
  "projectSlug": "founder-control-room",
  "connectionId": "optional-project-connection-id",
  "grantType": "tool_rule",
  "toolRule": "Bash(git push origin main)",
  "durationHours": 24,
  "reason": "Temporary founder-approved integration window",
  "usageLimit": "Use only after evidence is preserved and gates are resolved."
}
```

Rules:

- Grant must expire within 24 hours.
- Grant text must not contain credential-like material.
- If `connectionId` is provided, it must belong to the named project.
- An audit event is required. If the audit write fails, the route revokes the grant and returns an audit-incomplete error.

### `POST /plugin-center/grants/:grantId/revoke`

Founder-only revocation route. Records `revoked_at` and emits a `plugin_permission_grant_revoked` event.

## Authority levels

Plugin Center uses the same no-carry-forward model as the Control Room authority stack:

- `L0`: read public docs
- `L1`: inspect project state
- `L2`: produce recommendation or patch proposal
- `L3`: execute inside isolated sandbox
- `L4`: create branch or external change proposal
- `L5`: integrate into the project
- `L6`: deploy, migrate, spend, communicate, or change providers

## Default blocked actions

Every catalog entry declares blocked-by-default actions. Examples:

- GitHub: force-push, repository deletion, visibility changes, credential rotation.
- Supabase: destructive DDL, production DML, RLS weakening, secret exposure.
- Gmail: sending without founder instruction, deleting email, bulk-forwarding private threads.
- Shopify: charging customers, refunds, price changes without a commercial gate.
- Cloudflare: DNS changes, domain transfer, production deploy without a gate.

## Operational doctrine

Plugin Center should make agent power boring, legible, and reversible.

A plugin is not “AI can do anything with this app.” A plugin is:

> a scoped capability, attached to a project, bounded by authority level, connected through non-secret config, and activated only through the right evidence gate.

That is the bar.
