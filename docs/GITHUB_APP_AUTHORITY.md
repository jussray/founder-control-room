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

## Claude/Cowork GitHub MCP OAuth boundary

Claude/Cowork connecting to GitHub's remote MCP endpoint is a different authentication plane from FCR's server-to-server GitHub App installation-token path.

The canonical GitHub MCP endpoint is:

```text
https://api.githubcopilot.com/mcp/
```

When a hosted MCP client asks for an OAuth client ID and OAuth client secret:

- do **not** paste `GITHUB_APP_ID`, `APP_ID`, `GITHUB_PRIVATE_KEY`, or `APP_PRIVATE_KEY` into those fields;
- the GitHub App numeric App ID and private-key PEM remain server-side installation authority only;
- an OAuth **Client ID** and **Client Secret** may be used only when the selected GitHub App or OAuth App is explicitly configured for user authorization and the hosted client's exact callback URL is registered with GitHub;
- the OAuth client secret stays in the hosted client's protected connector configuration and must never be committed, logged, copied into issues/PRs, or stored in FCR/Chief source;
- reusing an existing FCR GitHub App for Claude is permitted only after its user-authorization settings, callback URL, repository scope, and requested OAuth permissions are independently inspected and accepted; installation authority alone is not proof that the App is safe or configured for that hosted OAuth flow;
- Chief must not mint a second independent founder GitHub identity merely because it has its own application/runtime boundary. Consequential repository authority remains governed by FCR and the existing founder gates;
- if neither existing App has an appropriate user-OAuth configuration, use a dedicated least-privilege Claude/Cowork OAuth client rather than altering or exposing the production installation private key.

A successful Claude authorization proves only that the hosted client obtained the user-scoped GitHub access GitHub granted. It does not grant FCR founder approval, merge authority, deployment authority, provider-admin authority, billing authority, publication authority, or permission to bypass repository evidence gates.

## Security invariants

- No capability may be inferred from possession of a token alone.
- Missing permission evidence fails closed before provider mutation.
- `write` satisfies a declared `read` requirement; `read` never satisfies `write`.
- Repository identity is bound before installation-token minting.
- App identity and installation identity remain visible in authority receipts.
- Existing merge, ruleset, publication, deployment, and founder-approval gates remain independent of provider capability.
- Capability is not approval.
