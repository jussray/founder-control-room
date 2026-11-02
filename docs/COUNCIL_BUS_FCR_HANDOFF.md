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
Pages latest deployment metadata pointed to commit
`61669738246f4d3e2129489989dd0db8347dab0c`, not the observed FCR
`main`. The matched FCR Supabase project has the
`council_conversations` table with RLS enabled, but the provider
readback did not establish any actual external-origin ACK.

Stop: no merge/deploy, database migrations, token rotation, route
publication, permissions change or enabling the Bus flags without a
separate founder-authorized action and exact-head, provider, runtime,
security and signed-return evidence.

**Rollback:** remove this new integration file, its tests and this
document from the isolated branch. No existing runtime code was edited.
