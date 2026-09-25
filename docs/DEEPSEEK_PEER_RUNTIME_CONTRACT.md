# DeepSeek Peer Runtime Contract

Status: source-wired, runtime proof required

## Purpose

This contract binds the normal `deepseek` peer relay lane to its server-side provider configuration without changing the separate `deepseek-instructor` adversary/instructor role.

The peer lane is governed by `docs/OPERATOR_RELAY_CONTRACT.md` and carries zero mutation authority.

## Runtime identity

Peer operator id:

- `deepseek`

Separate non-peer role:

- `deepseek-instructor`

They are different identities. FCR must never silently substitute one for the other.

## Provider configuration

Server-side environment names:

- `DEEPSEEK_API_KEY` — provider credential. Secret. Never browser-exposed, logged, copied into receipts, or committed.
- `FCR_RELAY_DEEPSEEK_MODEL` — explicit model selector.

Accepted model ids:

- `deepseek-flash`
- `deepseek-v4-pro`

Any other model id fails closed and the `deepseek` adapter is not advertised.

Provider endpoint:

- `POST https://api.deepseek.com/responses`

The runtime uses a bounded response size, bounded timeout, authenticated bearer transport, and the same relay prompt/authority ceiling as the other peer adapters.

## Authority ceiling

Provider availability never grants repository, merge, deploy, publish, billing, secret-management, or provider-mutation authority.

Every relay packet remains bounded by:

```json
{
  "externalWrite": false,
  "merge": false,
  "deploy": false,
  "publish": false,
  "providerMutation": false
}
```

## Evidence requirements

A DeepSeek relay is `VERIFIED` only when all of the following bind to the same exact FCR source head:

1. `OPERATOR_RELAY_PEERS` contains `deepseek` while excluding `deepseek-instructor`.
2. MCP tool schema derives its target allowlist from the canonical peer registry.
3. `createServerOperatorRelayAdapters` exposes `deepseek` only when both `DEEPSEEK_API_KEY` and an allowed `FCR_RELAY_DEEPSEEK_MODEL` are present.
4. Unit tests prove current-model allowlisting, endpoint/auth shape, response provenance, semantic-review spend blocking, and fail-closed provider failure handling.
5. `/ _debug/provider` equivalent provider witness reports only boolean key presence and never a secret value. (The actual route is `/_debug/provider`.)
6. Playwright proves a founder-issued `deepseek` relay reaches the requested provider and the validated response returns with `provider:deepseek:<response-id>` evidence.
7. Runtime/provider evidence proves the actual provider that answered was DeepSeek.

Until steps 6 and 7 pass against the deployed exact head, DeepSeek peer status remains `PARTIAL` even if source tests are green.

## Rollback

Rollback is additive and local to the peer lane:

1. remove `deepseek` from `OPERATOR_RELAY_PEERS`;
2. remove the server-side DeepSeek adapter and provider witness fields;
3. leave `deepseek-instructor` and its existing interop contract unchanged;
4. rerun exact-head unit/type/lint/Playwright proof.

Never roll back by weakening relay validation or by silently routing DeepSeek requests to another provider.
