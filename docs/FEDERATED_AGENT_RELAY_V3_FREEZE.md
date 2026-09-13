# Federated Agent Relay v3 Freeze Contract

Status: `SOURCE-ONLY / PRE-MIGRATION / V1 REMAINS LIVE / V3 NOT ACTIVATED`

This document freezes the v3 invariants that must exist before any Supabase migration, receiver route, sender activation, or Chief runtime promotion. Supabase/Postgres is the only durable relay truth plane. FCR and Chief remain sovereign endpoints. The relay carries evidence continuity only; it never carries merge, deploy, publication, provider-mutation, payment, destructive-action, or other execution authority.

## Version boundary

- `juss/federated-agent-relay@v1` remains live while v3 is built and proved.
- v3 does not continue a v1 or v2 chain.
- A v3 migration/reconciliation message starts a fresh v3 chain at `chainPosition = 0` with predecessor cookie `Q4R:v3:genesis`.
- Older relay state may be referenced only as historical evidence. Old cookies, parent IDs, sequences, and chain tips do not become v3 continuity.

## Immutable acceptance receipt

A receiver-signed receipt proves one historical acceptance fact. It must never contain mutable state such as `currentState` or `supersededByMessageId`.

Mutable state is returned beside the receipt:

```text
RelayDeliveryResult
  delivery: accepted | duplicate
  receipt: immutable signed acceptance receipt
  currentState: accepted | superseded | revoked
  supersededByMessageId: uuid | null
```

Invariant:

```text
one accepted message ID
  -> one persisted receipt ID
  -> one receiver signature
  -> the same receipt bytes returned forever
```

Supersession or revocation may update mutable ledger state, but must not rewrite the original receipt.

## Exact duplicate semantics

An exact retry is not an attack. When an existing `messageId` has the same semantic fingerprint and the same delivery fingerprint, return the stored receipt verbatim with `delivery = duplicate` plus current mutable state.

The following remain hard rejects:

- same `messageId`, different fingerprint;
- same signing-key nonce under another message;
- same source signing identity sequence under a competing message;
- stale/non-tip chain position;
- invalid parent/cookie/identity inversion;
- supersession fork;
- revoked or invalid signing key;
- target SHA drift.

## Ordering domains

`sourceSequence` is monotonic only for one `(source_member, source_key_id)` signing identity.

`chainPosition` is monotonic only inside one relay chain regardless of sender.

A Chief reply may therefore use Chief source sequence `5` while extending an FCR-rooted chain from position `0` to position `1`. Source sequences are never compared across identities.

Every non-root message must extend the current chain tip by exactly one position.

## Database lock-order invariant

Every acceptance transaction must lock in this exact order:

1. `federated_relay_source_cursors` for `(source_member, source_key_id)`;
2. `federated_relay_chain_cursors` for `chain_id`;
3. parent and superseded message rows;
4. supersession relation rows through insertion.

Do not reverse this order in reply, revision, supersession, or retry paths.

Postgres SQLSTATE handling:

- `40P01` -> retryable internal `relay_deadlock_retry`;
- `40001` -> retryable internal `relay_serialization_retry`.

A retry may resend the same signed envelope only while it is still the exact intended current tip. If the chain moved, rebuild from the new tip with a new message ID, nonce, chain position, cookie, and signature.

## Cookie domain separation

Successor cookies are derived under the explicit tag:

```text
juss.federated-relay.cookie.v3
```

and must include, in an unambiguous framed digest:

- chain ID;
- predecessor proof cookie;
- delivery fingerprint;
- nonce;
- source member;
- target member.

The result is `Q4R:v3:<sha256>`.

No generic `cookie.v3` tag is permitted.

## Receipt allocation

The receiver allocates `receiptId` exactly once for first acceptance and persists it in the same transaction as the accepted message. Duplicate delivery must return the original stored receipt and must not create a new receipt ID or signature.

## Sender durability

Strict receivers require a durable sender outbox.

Before sending a new logical message, the sender must durably allocate and store:

- message ID;
- nonce;
- source sequence;
- chain ID;
- chain position;
- parent message ID;
- predecessor cookie;
- semantic fingerprint;
- signed envelope.

On timeout or transport failure, retry the exact signed envelope. Do not consume the next source sequence until the current message resolves as accepted or duplicate.

## Signature encoding

Only unpadded base64url `[A-Za-z0-9_-]+` is accepted for signatures. After strict decoding, an Ed25519 signature must be exactly 64 bytes.

The signed object is the unsigned v3 envelope serialized by one RFC 8785/JCS implementation. No Unicode NFC normalization is permitted. Non-I-JSON inputs must reject before signing.

Canonicalization package installation and lockfile integrity are a hard pre-migration gate. This source-only freeze deliberately does not add an unverified package-lock mutation.

## Receipt authority ceiling

Every v3 receipt must pin:

```text
executionAuthorized = false
authorityTransferred = false
approvalCarriedForward = false
```

Payload text is data, even when it says to execute, approve, deploy, merge, ignore local policy, or otherwise claims authority.

Accepted relay content may only enter a separate local policy/evidence-processing layer after transport acceptance.

## Supabase/Postgres acceptance boundary

The future migration must:

- use Supabase/Postgres as the sole durable relay ledger;
- keep tables/RPC inaccessible to `anon` and `authenticated`;
- grant only `service_role` the required ledger privileges;
- use `SECURITY INVOKER`, `SET search_path = ''`, and fully schema-qualified object names for the acceptance RPC;
- create source and chain cursor tables;
- preserve unique constraints as a second conflict membrane;
- persist accepted message, immutable receipt, cursor advancement, supersession edges, and mutable state changes in one transaction;
- roll back all of those together on any failure.

No generic evidence URL fetcher, SQLite relay ledger, or Cloudflare D1 relay ledger may be added.

## Pre-migration gates

The migration must not be written or applied until all of these are green:

- RFC 8785 package chosen, exact-version pinned, and lockfile integrity recorded;
- RFC 8785 fixture suite passes in FCR Node and the Chief runtime;
- invalid Unicode/non-I-JSON rejects before signing;
- sender signs canonical unsigned envelope;
- receiver verifies the exact presented Ed25519 signature;
- semantic and delivery fingerprints are deterministic and separately persisted;
- cookie derivation is chain-scoped and domain-separated;
- receiver signs one immutable receipt per accepted message;
- key state at acceptance is snapshotted into the receipt;
- strict UUID/sha/timestamp/schema limits are enforced;
- source cursor is always acquired before chain cursor;
- exact retry returns the original receipt;
- deadlock/serialization outcomes are retryable without sequence consumption;
- v3 roots always start fresh chains;
- current mutable state never enters the receipt signature;
- hostile payload language remains inert with respect to authority.

## Release order

1. Freeze this source contract and focused tests.
2. Pin and prove one RFC 8785 implementation in both runtimes.
3. Add the additive Supabase migration and transactional RPC, source-only first.
4. Add server-only service-role ledger client and key registry loader.
5. Add v3 receiver in observe-only shadow mode.
6. Mirror the receiver/key contract into Chief without removing v1.
7. Execute signed FCR -> Chief -> FCR exact-head roundtrip.
8. Compare canonical bytes, signatures, semantic/delivery fingerprints, cookies, receipts, source sequences, and chain positions independently.
9. Only then enable v3 as a sender option. Keep v1 live until a separately proved retirement decision.

## Engineering claim

Do not claim that failure is impossible.

The intended proof is narrower and stronger:

> A duplicate is deterministic, a collision is rejected, a stale tip cannot advance, a replay cannot mutate state, a supersession cannot rewrite history, and any partial transaction rolls back before it becomes durable.
