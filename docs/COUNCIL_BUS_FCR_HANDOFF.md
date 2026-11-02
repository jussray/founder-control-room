# FCR ↔ Council Bus — scoped nonproduction integration

**Observed 2026-11-02:** FCR `main@680b7b7aac38103d8386465f6ae3acbded4a9d5c`.
Council source `jussray/ULTRATHINK-COUNCIL` on branch
`feat/embedded-council-bus-runtime-20261102@223ad28ce4b0831912a3cd9b9c49541d559c7683`
passed its exact-head GitHub CI.

## Owner boundary

FCR has its own founder-gated mission Council route and Supabase
`council_conversations` persistence. This is not the Council standalone
Court packet or return-to-origin. FCR's signed federated relay v3 targets
four named peer systems; it does not independently prove ChatGPT callbacks.

`src/lib/councilBusFcrIntegration.ts` is an **unwired** FCR return
adapter boundary. It requires an actual middleware-authenticated founder,
mission-scoped authorization, independent persisted Council round readback,
exact finding and evidence lineage, Court/handoff linkage,
`PREPARED_NOT_SENT`, and a server-owned enabled switch checked twice.
Court HOLD never invokes a sender. The owning app must supply a verified
source-pinned `runEmbeddedCouncilBus` adapter, durable atomic journal,
authenticated route, signature and genuine originating agent ACK.
No callback URL, caller token, Worker flag, DB schema or external send
is installed by this branch.

The return value deliberately includes `productionVerified:false`.
Do not label a test-injected ACK as an independent delivery proof.

## Production release HOLD

Read-only Cloudflare worker settings showed `CF_API_TOKEN` with
binding type `plain_text`. **Its value was not retrieved.**
Cloudflare Pages canonical_deployment was subsequently read back as production/main at GitHub main SHA 680b7b7aac38103d8386465f6ae3acbded4a9d5c. The earlier mismatch compared latest PREVIEW with production and was not a production drift.
The matched FCR Supabase project has the
`council_conversations` table with RLS enabled, but the provider
readback did not establish any actual external-origin ACK.

Stop: no merge/deploy, database migrations, token rotation, route
publication, permissions change or enabling the Bus flags without a
separate founder-authorized action and exact-head, provider, runtime,
security and signed-return evidence.

**Rollback:** remove this new integration file, its tests and this
document from the isolated branch. No existing runtime code was edited.

## 2026-11-02 current-gate amendment

The FCR integration now mandates additional injected verification ports:
- verifyBundle must apply the pinned official Council, Court, and Bus handoff validators to the complete packets, not merely compare user-supplied fingerprints.
- authorizeOrigin must prove the originating agent and route are authorized and owned by the authenticated session; no arbitrary external callback URLs may be honored.
Both fail closed when absent or denying. Local test stubs prove interface behavior only, not the existence of a production signer, provider, or originating-agent ACK.

Cloudflare Worker CF_API_TOKEN was still classified plain_text. Its value was not retrieved or copied. Existing canonical Worker Reconcile already provides a guarded legacy-removal workflow and a strict post-deployment check. Do not run that workflow without exact-head production approval and provider readback. No deletion, rotation, deploy, or credential mutation performed.

## 2026-11-02: exact-pinned canonical verifier implementation

The previous injected boolean \`verifyBundle\` was removed. The FCR
bridge now imports actual Council verifier source from a **snapshot of**
\`jussray/ULTRATHINK-COUNCIL@223ad28ce4b0831912a3cd9b9c49541d559c7683\`.
No floating dependency, network fetch, runtime URL import, or mutable
remote package is involved; \`.github/workflows/fcr-council-bus-return-gate.yml\`
compares the vendored canonical source Git blobs against the exact
verified upstream blob fingerprints. The embedded Council Bus source
code, verification library and type declarations are kept together.

FCR now rejects a Council record that does not bind to deterministic
\`fcrCouncilRoundId(missionId,round)\` and replays the original mission's
persisted findings. Full canonical packet validators check Court policy
and handoff fingerprint, including the \`PREPARED_NOT_SENT\` state.
\`dispatchPinnedCouncilBus\` is the direct official delivery entrypoint,
but **all server-owned ports remain required**, without a supplied
network/secret/journal implementation.

This is a source-level integration, NOT a live origin callback.
A production endpoint must still authenticate, implement signed
allowed-route delivery and durable idempotency under zero-trust.
No credential deletion, new PR, merge, deployment or provider mutation.

## Executable bundled runtime proof

The focused CI additionally invokes
\`src/lib/__tests__/councilBusPinnedRuntime.test.ts\`, importing the
exact-pinned original \`runEmbeddedCouncilBus\` code through
\`dispatchPinnedCouncilBus\`. The test proves source-level handoff,
claim-once, duplicate suppression, Court HOLD, staged switches,
fingerprint checks and ACK verification with explicitly simulated
ports. **The test does not establish an installed sender, a real
transport key, a production journal or a receiving ChatGPT ACK.**


## Origin-signed ACK verification contract

The optional \`src/lib/councilBusSignedAck.ts\` verifier implements the
pinned Bus \`verifyAck\` port with **Ed25519** verification. It checks
registered server-side key state, tenant/subject/agent/route binding,
exact thread and correlation IDs, idempotency SHA, bounded receipt,
signature, and a short signed lifetime. It returns false on missing
or untrusted registry data and never accepts arbitrary callback URLs.

The originating provider still needs a real registered key, receiver
implementation, authenticated callback transport and durable
claim-once journal; FCR does not generate any provider key or expose
a public callback route in this candidate. Test-generated Ed25519 keys
are transient fixtures only. No ChatGPT receipt has been observed.
