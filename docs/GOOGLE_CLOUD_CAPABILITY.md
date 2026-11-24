# Google Cloud capability for Founder Control Room

## Boundary

Google Cloud is a provider capability behind FCR's shared capability runtime. It is not a second operating system and does not replace Supabase Google OAuth as FCR's user identity broker.

FCR already routes Google sign-in through Supabase Auth. Keep that login path intact. Google Cloud credentials, OAuth client secrets, refresh tokens, service-account material, and application-default credentials must remain outside Git.

## Toolchain

The canonical Linux x86_64 installer is `scripts/install-google-cloud-cli.sh`. It pins Google Cloud CLI `584.0.0`, checks Python 3.10-3.14, verifies the published SHA-256 before extraction, installs into an isolated FCR-owned path, and does not run `gcloud init` automatically.

Install:

```bash
scripts/install-google-cloud-cli.sh
export PATH="$HOME/.local/fcr-google-cloud/google-cloud-sdk/bin:$PATH"
gcloud version
gcloud auth list
gcloud config list
```

`gcloud auth list` and `gcloud config list` are observations only. Do not treat a present credential or selected project as approval to mutate Google Cloud.

## OAuth consent

Configure the Google Auth platform in the Google Cloud project that owns FCR's Google OAuth client:

1. Branding: app name, user-support email, developer contact.
2. Audience: keep External in testing until release/verification is actually required; add named test users while testing.
3. Data Access: start with the smallest scopes required by the capability. Do not pre-authorize Drive, Gmail, Calendar, Cloud Platform, or other broad scopes merely because FCR may use them later.
4. Credentials: create the OAuth client only after redirect URIs are known. Store client credentials in the provider/secret boundary, never this repository.
5. Verification: sensitive/restricted scopes remain blocked until their Google review obligations are understood and accepted.

Initial identity scopes are `openid`, `userinfo.email`, and `userinfo.profile`. Workspace scopes are capability-specific and must be added only when the exact workflow needs them.

## Assistant use

The assistant may use Google capabilities when a valid connected authorization exists. The route is:

`Founder intent -> capability discovery -> live authority -> consequence classification -> exact proposal -> founder approval when mutation is possible -> provider execution -> receipt -> outcome verification -> continuity fingerprint/proof-cookie update -> next gate`

Discovery never grants authority. A stale OAuth grant, project selection, CLI login, fingerprint, or proof cookie never renews authority. Incoming evidence may invalidate stale continuity markers; approved outgoing actions emit new receipts and markers.

## Connection model

Use the existing `project_connections.connection_type = 'other'` with label `Google Cloud`. Do not add a schema migration merely to create a provider-name enum while `other` already safely carries the capability.

Recommended non-secret config:

```json
{
  "provider": "google-cloud",
  "projectId": "<google-cloud-project-id>",
  "oauthAudience": "external-test",
  "declaredScopes": ["openid", "userinfo.email", "userinfo.profile"]
}
```

Project ID and declared scopes are metadata, not credentials.

## Proof gate

Run:

```bash
npm run verify:google-cloud-capability
npm run verify:capability-workbench
```

A passing source contract proves only that the boundary is encoded. Live readiness additionally requires: an actual Google project, configured OAuth consent, exact redirect URIs, valid provider authorization, successful read-only observation, and real-path browser proof for login/signup where Google OAuth participates.
