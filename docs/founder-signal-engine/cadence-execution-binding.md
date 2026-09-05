# Founder-content cadence execution binding

## Purpose

Founder-content cadence is anti-spam authority, not publication authority. A cadence row may influence later scheduling only when FCR has durable evidence that the corresponding content entered the execution ledger.

## Failure being prevented

The cadence RPC and `approval_executions` reservation are separate database transactions. A cadence insert can therefore commit before the execution reservation succeeds. If that unbound row were allowed to anchor the provider/channel lane, a failed pre-provider attempt could permanently defer unrelated later content even though no execution existed.

## Binding invariant

A newly reserved cadence row is provisional for a short execution-binding lease.

- The same content may reuse that provisional row while its execution reservation is being established.
- Different content must fail closed while an unbound provisional row is still inside its binding lease. It must not schedule behind that row.
- Once a matching `approval_executions` row exists, the cadence row becomes execution-backed.
- Pending and succeeded executions remain cadence authority.
- A failed or otherwise uncertain execution remains cadence authority only when the provider-write boundary was crossed.
- A failed pre-provider execution does not anchor later cadence.
- When an unbound provisional row expires, the same content may reuse and recompute that row rather than creating duplicate cadence history.

The matching execution is identified by `action_type = schedule_founder_content` and the exact `request.contentId` stored in `approval_executions`.

## Concurrency behavior

The provider/channel advisory transaction lock remains the serialization boundary for cadence decisions. The execution-binding membrane changes what can become a durable lane anchor:

1. Request A reserves a provisional cadence slot.
2. Before A binds to `approval_executions`, request B for different content receives `FOUNDER_CONTENT_CADENCE_EXECUTION_BINDING_PENDING` rather than inheriting a deferred slot from A.
3. If A binds successfully, later requests schedule from A's execution-backed slot.
4. If A never creates an execution, its provisional lease expires and it no longer influences later cadence.
5. If A creates an execution that fails before provider write, that failed execution does not influence later cadence.

This converts the old ghost-slot failure from permanent schedule drift into a bounded fail-closed retry window.

## Authority boundaries

This migration does not authorize publication, provider writes, approval claims, n8n activation, deployment, or production database mutation by merely existing in source control.

The migration is source truth until explicitly applied to the target Supabase database and independently read back. Provider-native evidence remains required for publication outcome truth.

Direct service-role inserts/updates/deletes on `founder_content_cadence_reservations` are revoked by the migration so the serialized RPC remains the write boundary.
