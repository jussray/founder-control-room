# Founder-content cadence execution lease

Founder Control Room separates a **candidate cadence slot** from **confirmed cadence authority**.

The cadence RPC may create a short `provisional` lease while FCR prepares the durable `approval_executions` generation. That provisional row is historical evidence that a slot was proposed, but it does **not** participate in the rolling 60-minute posting floor until the matching execution generation confirms it.

The database uses the same provider/channel advisory-lock namespace at both boundaries:

```text
cadence request
-> provisional lease
-> durable approval_executions generation
-> exact cadence identity + generation fence
-> confirmed cadence authority
```

This closes the stranded-slot failure where cadence could previously be persisted before a later project/execution reservation failed, causing an unrelated legitimate post to be deferred by an hour or beyond its approval lease.

## Identity compatibility

The fence preserves both existing n8n identities:

- `fcr-n8n-social-v1:*` binds cadence to provider + channel.
- `fcr-n8n-social-v2:*` binds provider-neutral cadence to `n8n` + platform.

The exact `contentId` and `scheduleAt` must match before a pending execution may confirm cadence.

## Bounded crash recovery

A provisional lease has the same two-minute boundary as the existing preclaim recovery lease, but timeout alone never grants safety. The execution trigger independently fences confirmation:

- an expired provisional lease cannot later confirm an execution;
- competing provisional callers may propose the same candidate slot, but only one still-legal execution can confirm cadence under the lane lock;
- a caller that loses confirmation receives no durable execution and must recompute cadence;
- stale pending preclaim generations may be released only when no provider write and no approval claim are recorded.

Therefore the timeout is a bounded recovery mechanism, not an optimistic timing assumption.

## Release semantics

Confirmed cadence may be released only when durable execution evidence remains pre-provider and retryable:

```text
retryable_before_provider = true
provider_write_attempted != true
approval_claimed != true
```

A provider-write attempt, approval claim, successful execution, or ambiguous outcome is never released merely to improve cadence availability.

Released rows are not deleted. The source migration retains the original cadence row and appends lease-event history for provisional reservation, execution confirmation, expiry, pre-provider release, or confirmation conflict.

## Authority boundary

This repair is **SOURCE IMPLEMENTED ONLY** until the migration is separately authorized and applied to production.

It does not prove live database mutation, n8n/Buffer configuration, a provider request, scheduling, publication, production runtime identity, merge authority, deploy authority, secret authority, billing authority, or destructive authority.
