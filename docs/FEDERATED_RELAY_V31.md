# Federated Relay v3.1

Status: **source-only / shadow candidate**. This document does not authorize applying the migration, enabling a receiver, or switching senders.

## Purpose

`juss/federated-agent-relay@v3.1` is a signed, ordered, idempotent evidence conversation. It is not an approval token, execution capability, merge authority, deploy authority, or publication authority.

Every acceptance receipt must keep:

- `executionAuthorized: false`
- `authorityTransferred: false`
- `approvalCarriedForward: false`

Payload content is inert data with respect to authority, even when it contains words such as `approval`, `execute`, or `ignore previous rules`.

## Fresh-chain migration boundary

v3.1 never continues a v1/v2 cookie chain. A v3.1 migration starts with:

- a new `chainId`;
- chain position `0`;
- relation `root`;
- predecessor cookie `Q4R:v3.1:genesis`.

Prior-protocol messages may be referenced as evidence, but they are not v3.1 parents and their proof cookies are not carried forward.

## Ordering model

v3.1 intentionally uses one linear cryptographic chain.

- `sourceSequence` is strict and monotonic per `(sourceMember, sourceKeyId)`.
- `chainPosition` is strict and monotonic per `chainId`.
- every non-root message names the current chain tip as `parentMessageId`;
- only a `revision` may supersede older accepted evidence;
- a revision follows the current chain tip cryptographically and identifies the evidence it retires through `supersedesMessageIds`.

This keeps chain continuity separate from truth supersession without introducing a partial DAG.

## Sender-side durability

Strict receiver cursors require a durable sender outbox.

Before the first send of a new logical message, the sender must durably allocate and persist:

- `messageId`;
- `nonce`;
- `sourceSequence`;
- `chainId`;
- `chainPosition`;
- parent message ID when non-root;
- predecessor proof cookie;
- semantic fingerprint;
- the final signed envelope.

On timeout or transient transport/database errors, retry the **exact same signed envelope**. Do not allocate a new source sequence for the retry.

If the chain tip changed, do not resend the stale envelope. Re-read the tip and build a new message with a new message ID, nonce, position, cookie, fingerprint, and signature.

## Receipt immutability

One accepted `messageId` maps to one persisted `receiptId` and one immutable receiver-signed receipt.

The signed receipt proves historical acceptance. Mutable live state is returned separately:

- `currentState`: `accepted | superseded | revoked`
- `supersededByMessageId`: current successor or `null`

Supersession or revocation must never rewrite the original signed receipt.

## Cryptographic domains

The sender signs RFC-8785-compatible canonical bytes of the unsigned envelope.

Two fingerprints are persisted:

- semantic fingerprint: canonical unsigned envelope;
- delivery fingerprint: canonical full signed envelope.

Successor proof cookies are domain-separated and bind:

1. chain ID;
2. predecessor cookie;
3. full delivery fingerprint;
4. nonce;
5. source member;
6. target member.

Proof cookies remain non-secret state markers and never become credentials or authority.

## Database lock order

Every acceptance transaction must acquire locks in exactly this order:

1. source cursor;
2. chain cursor;
3. parent/superseded message rows;
4. supersession edge insert.

Do not reverse this order. SQLSTATE `40P01` and `40001` are transient transport outcomes and may retry the same envelope only if the envelope is still the current intended chain extension.

## Verification gates before activation

1. v1 regression remains green.
2. v3.1 TypeScript + migration contract tests are green.
3. RFC 8785 fixture corpus matches in FCR and Chief runtimes.
4. ATTACK-6000 mutation harness is green.
5. Real Postgres concurrency matrix proves duplicate, nonce, sequence, chain, supersession, rollback, and deadlock behavior.
6. FCR receiver runs shadow/evidence-only.
7. Chief mirrors the protocol and key registry.
8. FCR -> Chief -> FCR exact-head signed roundtrip independently matches bytes, fingerprints, cookies, ordering, and receipts.
9. Only then may v3.1 become an opt-in sender. v1 remains live until a separately approved retirement gate.
