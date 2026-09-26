# Founder Control Room GitHub App Authority

## Canonical rule

For the constitutional repository `jussray/founder-control-room`, every runtime `RepositoryProvider` operation must authenticate through the Founder Control Room GitHub App installation path.

The required runtime pair is:

```text
GITHUB_APP_ID
GITHUB_PRIVATE_KEY
```

GitHub Actions may store the corresponding protected inputs under the provider-legal names `APP_ID` and `APP_PRIVATE_KEY` and map them to the runtime names above inside a trusted workflow.

`GITHUB_TOKEN` is **not** an accepted fallback for `jussray/founder-control-room`. Generic documentation that describes `GITHUB_TOKEN` as a bounded local/development fallback applies only to non-FCR GitHub repositories unless a future, separately reviewed contract explicitly changes this rule.

## Execution boundary

`src/providers/githubAppAuth.ts` is the credential-minting implementation. It:

1. creates the short-lived RS256 GitHub App JWT;
2. resolves the installation that owns the exact repository;
3. verifies the observed installation App id matches the configured App id;
4. mints a short-lived installation token scoped to the requested repository; and
5. caches that token only within the App + repository identity until its bounded refresh window.

`src/providers/providerFactory.ts` is the use-boundary gate. It must fail closed for the FCR repository when the App pair is absent or incomplete before constructing a repository provider. A caller token, model output, MCP result, webhook payload, or remembered session cannot substitute for this App identity.

## Startup versus use-time availability

The canonical Worker may treat `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` as provider-held startup bindings under its current Worker secret contract. Regardless of deployment mechanics, repository capability is not proven merely because the binding names exist.

The evidence ladder remains:

```text
source contract
-> credential binding availability
-> GitHub App JWT accepted
-> exact repository installation observed
-> repository-scoped installation token minted
-> requested GitHub provider operation observed
```

A failure at any layer leaves later layers unproven.

## Authority ceiling

GitHub App authentication proves provider identity and grants only the permissions configured on that installation. It does not itself grant founder approval, merge approval, deployment approval, publication authority, spend authority, secret-rotation authority, destructive authority, or permission to widen the App installation scope.

FCR merge and provider mutations retain their existing exact-candidate, current-state reread, evidence, Founder Final, rollback, and provider-readback gates.

## Relationship to n8n MCP

The GitHub App authenticates GitHub repository/provider operations. It does not replace n8n's MCP client authentication. The governed execution relationship remains:

```text
FCR authority/control plane
-> PromptOS / Chief reasoning and routing
-> n8n instance-level MCP execution spine
-> GitHub operations through FCR's GitHub App installation authority
```

An n8n MCP client uses the authentication required by n8n. When a workflow requests a GitHub operation, that operation must still cross FCR's GitHub App provider boundary and cannot inherit GitHub authority merely because the MCP connection exists.

## Rollback

A rollback must restore a previously reviewed GitHub App requirement or disable the affected GitHub capability. It must never silently restore PAT/token fallback for the FCR constitutional repository.
