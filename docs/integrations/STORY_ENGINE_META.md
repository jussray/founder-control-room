# Story Engine Meta app tracking

Story Engine is the Meta developer app container for Se'kret Bip's Facebook and Instagram social integration setup.

Founder Control Room tracks this as an external dependency and evidence item. It must not become a credential vault for Meta secrets, a social publishing runtime, or a back door into private teen content.

## Boundary

Control Room may record sanitized operational metadata such as:

- external app name: `Story Engine`;
- setup phase/status;
- required review gates;
- evidence that a separate Se'kret Bip PR added placeholder-only configuration;
- founder approval state for any future implementation work.

Control Room must not store:

- Meta App Secret;
- long-lived access tokens;
- webhook verify tokens;
- Facebook Page tokens;
- Instagram account credentials;
- social message/comment content unless a future privacy review explicitly permits a reduced metadata event;
- teen journals, Bridge content, safety-scan content, or private parent/teen data.

## Current status

- App name: `Story Engine`.
- Product scope: Facebook/Instagram social integration planning.
- Implementation status: not implemented.
- Production status: not verified.
- Allowed repository action: placeholder-only setup documentation in `jussray/Sekret-Bip`.

## Required gate before future implementation

A future implementation PR must include:

1. explicit founder approval;
2. a privacy boundary and reduced-data event model;
3. least-privilege Meta permissions/scopes;
4. server-only secret storage and rotation plan;
5. redirect URL and data deletion callback review when applicable;
6. webhook signature/verification proof if webhooks are introduced;
7. fail-closed behavior for missing or invalid Meta configuration;
8. exact-head verification evidence before merge;
9. a Control Room event or note that records README impact as required, not required, or deferred with reason.

## Red-team note

The safe first move is documentation and placeholder config only. Do not wire publishing, webhook ingestion, token refresh, or account-linking UI until the privacy boundary and evidence model are approved.
