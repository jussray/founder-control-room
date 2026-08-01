# WhoAmI — founder identity truth

`WhoAmI` is a read-only Python utility for confirming the local founder context and exact repository state before guarded Control Room work.

## Run

```bash
npm run whoami
npm run whoami -- --json
npm run whoami -- --expected-repo founder-control-room
npm run whoami -- --expected-head <40-character-sha>
```

## Output

The command reports:

- founder display name and role;
- Control Room environment label;
- Python and platform version;
- detected repository root;
- current branch;
- exact Git HEAD;
- dirty/clean working-tree state.

`FOUNDER_EMAIL` is omitted by default. It is included only when the operator explicitly passes `--include-email`.

## Environment

Optional, non-secret values:

```text
FOUNDER_DISPLAY_NAME=Juss
FOUNDER_ROLE=Founder
FOUNDER_EMAIL=<founder email>
CONTROL_ROOM_ENV=local
```

The script never prints environment variables whose names imply tokens, secrets, passwords, credentials, or keys. It runs Git with fixed argument arrays, never through a shell.

## Boundary

This first slice does not authenticate a browser session, grant founder authority, query Supabase, execute a mission, write an audit event, deploy, merge, or mutate a repository. It is local identity and repository truth only.

A future founder-only HTTP/UI surface may consume the structured JSON result, but it must still use the existing `requireFounder` session boundary and may not treat local environment values as authentication.

## Verification

```bash
python3 -m unittest scripts/test_whoami.py
```

## Rollback

Remove `scripts/whoami.py`, `scripts/test_whoami.py`, this document, and the package scripts. No database, account, credential, deployment, or user-data rollback is required.
