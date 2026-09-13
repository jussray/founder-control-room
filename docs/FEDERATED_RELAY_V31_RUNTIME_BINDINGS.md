# Federated Relay v3.1 runtime bindings

This document records only binding names and authority boundaries. It never contains private key material.

## Receiver signing identity

The surviving `founder-control-room` API Worker declares the public-safe receiver key identifier:

```text
FEDERATED_RELAY_RECEIVER_KEY_ID=founder-control-room:relay-v3.1:production
```

That identifier must name an active, currently valid `founder-control-room` row in `federated_relay_v31_public_keys`. The row's Ed25519 public JWK must match the public component of the provider-held private JWK.

The private signing material is the Cloudflare Worker secret binding:

```text
FEDERATED_RELAY_RECEIVER_PRIVATE_JWK
```

The value is an Ed25519 private JWK and must exist only in the provider secret plane. Never commit, log, copy into CI receipts, expose through Pages/browser code, or paste it into documentation.

## Deployment gate

`wrangler.worker.toml` is the canonical production binding-name contract. `FEDERATED_RELAY_RECEIVER_PRIVATE_JWK` is listed under `[secrets].required`; the exact-main production authority gate reads Cloudflare's secret-name list and fails before production mutation if a required provider-held binding name is missing. The workflow never reads the secret value.

Source declaration is not runtime proof. A production relay claim additionally requires:

1. exact-main Worker deployment and `/version` identity;
2. provider readback showing the required secret binding name is present, without its value;
3. an active, non-revoked receiver public-key registry row valid at receipt acceptance time;
4. private/public JWK material match enforced by the runtime;
5. a verified signed relay receipt and durable ledger evidence.

If any item is missing, classify the relay receiver as blocked or unverified. Do not weaken signing, key validity, Access, or deployment gates to manufacture a green result.

## Authority boundary

Relay fingerprints, proof cookies, envelopes, keys, and receipts carry evidence only. They never grant merge, deploy, publication, provider mutation, spending, or founder authority. Exact merge approval remains a separate founder-bound gate.
