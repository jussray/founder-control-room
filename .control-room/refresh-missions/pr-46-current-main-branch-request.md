# PR #46 Current-Main Branch Request

The guarded PR #46 refresh mission is approved, but the named refresh branch `agent/founder-onboarding-main-refresh` is stale and cannot be force-reset under the approved scope.

A current-main refresh branch is required before reconstruction can safely continue.

Requested branch:

```text
agent/founder-onboarding-main-refresh-20260719
```

Base:

```text
main
```

Restrictions remain unchanged:

- preserve `agent/founder-onboarding`;
- no force-push;
- no deploy;
- no migrations;
- no secrets/auth-provider/DNS/billing/external communication changes;
- resolve only the known overlap in `src/worker/cf-entry.ts` and `wrangler.toml`;
- run exact-head gates before readiness.
