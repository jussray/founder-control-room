# HubSpot CLI safe setup

## Purpose

Connect a developer workstation to HubSpot without storing a Personal Access Key, account configuration, or repo-local account context in Git.

## Authority and boundaries

- Authoritative repository: `jussray/founder-control-room`
- Target branch for setup documentation: `chore/hubspot-cli-safe-setup`
- Authentication is local to the developer workstation.
- Never paste a HubSpot Personal Access Key into GitHub, HubSpot CRM notes, issues, pull requests, logs, screenshots, or chat.
- Do not commit generated HubSpot CLI configuration.
- Authentication does not authorize deployment, publishing, deletion, CRM mutation, or production changes.

## Prerequisites

The repository requires Node.js 20 or newer.

```bash
node --version
npm --version
```

Stop if Node reports a version below 20.

## Recommended setup

HubSpot recommends global authentication through `hs account auth` rather than creating a repo-local `hubspot.config.yml` with `hs init`.

```bash
npm install -g @hubspot/cli@latest
hs --version
hs account auth
```

During `hs account auth`:

1. Follow the browser prompt to generate a Personal Access Key.
2. Paste the key only into the local terminal prompt.
3. Choose an account alias without spaces, such as `founder-control-room`.
4. Do not record the key in any project file.

## Verify the local connection

```bash
hs account list
hs doctor
```

Verification is successful only when:

- `hs --version` returns a CLI version;
- the intended HubSpot account appears in `hs account list`;
- `hs doctor` reports the expected active account and configuration location;
- no Personal Access Key or generated config appears in `git status`.

```bash
git status --short
```

Expected result: no `hubspot.config.yml`, `.hsaccount`, or `.hs/` entry is staged or untracked.

## Legacy fallback

`hs init` is still supported, but it creates `hubspot.config.yml` in the current directory. This repository ignores that file to prevent accidental credential exposure.

```bash
hs init
```

Use the legacy path only when a current HubSpot workflow explicitly requires it. Prefer `hs account auth` for new setup.

## Failure handling

### npm registry or network failure

If installation returns `503`, `EAI_AGAIN`, timeout, or DNS errors:

1. Do not retry in a loop.
2. Confirm the configured registry:

```bash
npm config get registry
```

3. Retry later from a normal workstation network:

```bash
npm install -g @hubspot/cli@latest
```

A registry failure does not indicate a HubSpot account or repository defect.

### Permission failure

If global installation returns `EACCES`, repair the local npm installation or use a Node version manager. Do not run npm with an unreviewed privilege escalation command.

## Rollback

Remove the authenticated local account without changing repository history:

```bash
hs account list
hs account remove <account-name-or-id>
```

If a legacy repo-local config was created, delete it locally after confirming it was never committed:

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
- `hs doctor` success or sanitized failure category
- date and operator

Never retain the Personal Access Key or full authentication configuration as evidence.
