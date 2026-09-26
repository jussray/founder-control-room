# Authority Receipt Consumption Store

## Current source state

Founder Control Room defines an `AuthorityReceiptV2` domain contract and a Postgres-backed one-winner consumption primitive for privileged execution adapters.

The original source migration creates `public.authority_receipt_consumptions` with `receipt_id` as the primary key and exposes `public.claim_authority_receipt_consumption(...)` to `service_role` only. The function uses `INSERT ... ON CONFLICT (receipt_id) DO NOTHING`, so concurrent claims for the same receipt have one database-owned winner. Valid hexadecimal head SHAs are accepted case-insensitively and persisted in canonical lowercase form.

Browser roles do not receive table or function authority. Row-level security remains enabled.

## Durable execution kernel v11.5

`supabase/migrations/20260926070000_agent_durable_execution_kernel_v11_5.sql` installs the source-only durable execution coordinator. That bootstrap migration was already exercised and checksummed by the reusable Neon preview, so its bytes are immutable under the repository's append-only migration law.

The admission function locks the same task-authority row used by revocation, verifies the live status and authority epoch, consumes the one-use permit, allocates a monotonic task fencing token, appends `EXECUTION_STARTED`, and enqueues one immutable outbox operation in the same database transaction. Revocation and admission therefore contend at one database-owned linearization boundary instead of performing separate check-then-claim operations.

The outbox binds the authorized operation to a canonical envelope digest, stable logical-operation idempotency key, destination, and immutable payload reference. Production envelope hashing requires a conformance-tested RFC 8785/JCS implementation; the repository intentionally does not claim that a hand-written JSON sorter is RFC 8785 compliant.

Outbox workers use `FOR UPDATE SKIP LOCKED` leases. Every lease claim increments `lease_generation`; outcome writes must match the current worker, generation, and unexpired lease so a resurrected zombie worker cannot overwrite coordinator state. Lease fencing protects coordinator state only. It does not prove an old worker failed to reach the external destination.

Retry safety remains destination-specific. Native/client-token idempotency may redeliver the identical immutable operation with the same key; queryable destinations must reconcile before retry; a lost lease at a non-idempotent destination becomes `REQUIRES_REVIEW` instead of an automatic destructive retry. A consumed permit is never reused.

## Append-only authority-role hardening

The bootstrap migration originally exposed the v11.5 functions to generic Supabase `service_role`. Rewriting that already-previewed migration would violate migration-history integrity, so the correction is an append-only successor:

`supabase/migrations/20260926071000_agent_durable_execution_kernel_v11_5_authority_role_split.sql`

That hardening migration revokes all v11.5 function authority and direct kernel table authority from generic `service_role`, `anon`, and `authenticated`. This prevents an ordinary compromised application service from minting task authority, fabricating permit admission, or driving execution merely because it possesses a broad server credential.

Before production activation, a later migration must bind narrowly held database identities with non-overlapping authority:

- **authority issuer**: may initialize/transition task authority; cannot admit permits or dispatch work;
- **resource-bound PEP/admission identity**: may atomically admit an already-validated signed permit; cannot create or widen task authority;
- **outbox worker identity**: may lease and record outcomes for already-admitted operations; cannot mint authority or admit new operations.

Those identities must not be generic application credentials and must be held only by their corresponding isolated runtime components. Until that activation migration is explicitly approved and proven, v11.5 remains owner-only source capability.

## Capability boundary

These files describe and implement source capability only. They do not prove that the migrations are applied to production, that synchronous durability/failover policy is configured strongly enough for a selected risk tier, that an immutable envelope store exists, or that any production PEP/resource can be reached only through this kernel.

Existing deploy and provider mutation paths remain unchanged. Wiring a protected production side effect to v11.5 is a separate gate requiring provider-native database readback, migration identity proof, exact executor integration, dedicated database identities, and proof that raw network/filesystem/credential/tool bypass paths are absent.

## Required production proof before activation

Before any production executor relies on this kernel, reacquire live evidence that:

- both canonical migrations are applied in append-only order under their Git-owned identities;
- browser roles and generic `service_role` cannot read/mutate kernel tables or invoke kernel functions after hardening;
- authority issuer, PEP/admission, and worker identities are distinct and hold only their required function privileges;
- revocation and admission really contend on the same authority row under concurrency;
- duplicate permit admission has one winner across replicas;
- fencing tokens increase monotonically;
- expired worker leases recover according to destination idempotency mode;
- stale lease generations cannot write outcomes;
- immutable payload readback reproduces the permit-bound canonical envelope digest;
- non-idempotent ambiguous outcomes fail closed into review;
- high/critical storage durability and failover configuration satisfy the chosen safety policy; and
- the protected resource is physically unreachable except through its resource-bound PEP.

Until that proof exists, production availability and enforcement remain **UNKNOWN / NOT ACTIVATED**.
