# HubSpot CLI safe setup

## Purpose

Connect a developer workstation and this repository directory to the intended HubSpot account without storing a Personal Access Key or generated account context in Git.

## Authority and boundaries

- Authoritative repository: `jussray/founder-control-room`
- Authoritative target branch: `main`
- Authentication is local to the developer workstation.
- HubSpot CLI global authentication is stored outside this repository in `~/.hscli/config.yml`.
- Directory-level account context may be stored locally in `.hs/settings.json`; this repository ignores `.hs/` so that context cannot be committed accidentally.
- Never paste a HubSpot Personal Access Key into GitHub, HubSpot CRM notes, issues, pull requests, logs, screenshots, artifacts, or chat.
- Do not commit generated HubSpot CLI configuration or local account context.
- Authentication or directory linking does not authorize deployment, publishing, deletion, CRM mutation, or production changes.

## Prerequisites

The HubSpot CLI supports Node.js 20 or newer.

```bash
node --version
npm --version
```

Stop if Node reports a version below 20.

## Recommended setup

Use HubSpot's global authentication model, then explicitly link this repository directory to the intended account.

```bash
npm install -g @hubspot/cli@latest
hs --version
hs account auth
hs account list
hs account link
hs account current
```

During `hs account auth`:

1. Follow the HubSpot prompt to generate or retrieve a Personal Access Key.
2. Paste the key only into the local terminal prompt.
3. Choose an account alias without spaces, such as `founder-control-room`.
4. Do not record the key in any project file or retained artifact.

During `hs account link`:

1. Run the command from the `founder-control-room` repository directory.
2. Select the already-authenticated HubSpot account intended for Founder Control Room.
3. Treat the generated `.hs/settings.json` as local account context, not repository truth or a proof artifact.

Directory linking reduces the risk of running a HubSpot CLI command against the wrong authenticated account. It does not increase the permissions granted by the Personal Access Key.

## Verify the local connection and directory binding

```bash
hs --version
hs account list
hs account current
hs doctor
git status --short
```

Verification is successful only when:

- `hs --version` returns a CLI version;
- the intended HubSpot account appears in `hs account list`;
- `hs account current` identifies the intended account for this repository directory;
- `hs doctor` does not report an authentication/configuration failure that invalidates the intended account context;
- no Personal Access Key or generated HubSpot config is tracked or staged in Git.

The repository intentionally ignores:

```text
hubspot.config.yml
.hsaccount
.hs/
```

A local `.hs/settings.json` may exist after directory linking and remain absent from `git status` because `.hs/` is ignored. That is expected.

## Legacy fallback

`hs init` is still supported, but it creates a repo-local `hubspot.config.yml`. Prefer `hs account auth` plus directory linking for current setup.

```bash
hs init
```

Use the legacy path only when a current HubSpot workflow explicitly requires it. The generated file remains ignored and must never be treated as a shareable artifact.

## Failure handling

### npm registry or network failure

If installation returns `503`, `EAI_AGAIN`, timeout, or DNS errors:

1. Do not retry in a loop.
2. Confirm the configured registry:

```bash
npm config get registry
```

3. Retry from a normal workstation network when registry access is available:

```bash
npm install -g @hubspot/cli@latest
```

A registry failure does not prove a HubSpot account or repository defect.

### Permission failure

If global installation returns `EACCES`, repair the local npm installation or use a Node version manager. Do not run npm with an unreviewed privilege-escalation command.

### Wrong or ambiguous account context

If `hs account current` does not identify the intended Founder Control Room account, stop before running any command that can mutate HubSpot state.

Inspect the authenticated accounts and relink this directory deliberately:

```bash
hs account list
hs account unlink
hs account link
hs account current
```

Do not infer that the most recently authenticated account is the correct project account.

## Rollback

Remove only the directory binding while preserving global authentication:

```bash
hs account current
hs account unlink
```

Remove an authenticated account from the global CLI configuration only when that broader credential removal is actually intended:

```bash
hs account list
hs account remove <account-name-or-id>
```

If legacy repo-local config was created, remove it locally after confirming it was never committed:

```bash
rm -f hubspot.config.yml .hsaccount
rm -rf .hs/
git status --short
```

## Proof artifact

Record only these non-secret facts when setup succeeds:

- HubSpot CLI version
- Node.js version
- npm version
- account alias or account ID
- `hs account current` result identifying the intended directory account
- `hs doctor` success or sanitized failure category
- date and operator

Never retain the Personal Access Key, `~/.hscli/config.yml`, `.hs/settings.json`, or full authentication configuration as evidence.
