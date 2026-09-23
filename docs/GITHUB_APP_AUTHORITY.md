# GitHub App authority in Founder Control Room

Founder Control Room uses its GitHub App as the preferred production repository identity.
The App is not a generic bearer token. Its authority is the intersection of:

1. the App identity;
2. the installation account;
3. the repositories selected for that installation; and
4. the repository permissions GitHub reports for that installation.

FCR must observe those facts before relying on a privileged provider operation.

## Capability-aware provider path

Use `createCapabilityAwareAppRepositoryProvider(...)` for any path that needs to rely on GitHub App authority for a read or mutation.

The caller declares the exact repository permissions required by the operation, for example:

```ts
const { provider, authority } = await createCapabilityAwareAppRepositoryProvider(
  projectConnection,
  {
    contents: "write",
    pull_requests: "write",
    checks: "read",
  },
  env,
);
```

FCR then:

1. resolves the fixed `owner/repo` project binding;
2. authenticates as the configured GitHub App;
3. reads GitHub's live installation identity and permission map for that repository;
4. derives a bounded capability contract;
5. fails closed if any declared permission is missing;
6. mints the repository-scoped installation token only after the permission gate; and
7. returns both the repository provider and the authority evidence used to justify it.

There is deliberately no ambient `GITHUB_TOKEN` fallback in this capability-aware path.

## What the App can do when GitHub grants the matching permission

FCR's GitHub provider already has repository operations that can use installation authority, including:

- repository metadata and file reads;
- branch creation;
- content/tree/commit writes;
- exact-head comparisons;
- pull-request review and merge flows;
- Check Run observation and bounded Check Run publication paths;
- repository ruleset observation and approved ruleset mutation paths;
- Actions/check/status/deployment operations where an FCR subsystem explicitly implements them and the installation grant permits them.

`githubAppCapabilities.ts` keeps both the raw provider permission map and named FCR capability flags. Raw permissions are retained so GitHub can add permissions without FCR pretending it already implements a corresponding operation.

## Current migrated proof

Chief governance ruleset observation now requires live `administration: read` evidence before FCR mints the repository-scoped installation token or reads either protected ruleset.

The candidate Check Run producer observation derives `checks: write` from the same capability contract but does not turn capability into publication authority by itself.

## What the installation App must not impersonate

A GitHub App installation token is not equivalent to the founder's user identity.
Operations that GitHub defines around the authenticated user, or that require access to a source repository outside the App installation boundary, need a separate user-authority lane.

A key example is forking an arbitrary public upstream repository into `jussray`. GitHub's fork endpoint can use GitHub App tokens, but for App-based authority GitHub requires the App to be installed on the destination account and on the source account/repository. FCR controls the destination installation, not arbitrary upstream owners.

Therefore:

- installed-repository automation belongs to the FCR GitHub App lane;
- arbitrary-upstream fork creation does **not** get smuggled through that lane;
- a future founder user-authority lane must be separately authenticated, scoped, audited, and receipt-backed.

## Security invariants

- No capability may be inferred from possession of a token alone.
- Missing permission evidence fails closed before provider mutation.
- `write` satisfies a declared `read` requirement; `read` never satisfies `write`.
- Repository identity is bound before installation-token minting.
- App identity and installation identity remain visible in authority receipts.
- Existing merge, ruleset, publication, deployment, and founder-approval gates remain independent of provider capability.
- Capability is not approval.
