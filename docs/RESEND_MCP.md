# Resend MCP control-room boundary

This repository enables the hosted Resend MCP server for OpenCode through `opencode.json`.

## Authenticate

Run locally from the repository:

```bash
opencode mcp auth resend
opencode mcp list
```

OAuth credentials are stored outside the repository. Never commit API keys, OAuth tokens, Supabase service-role keys, invite codes, or private user content.

## Control Room role

Control Room agents may use Resend MCP to collect evidence for Se'kret Bip email operations, including:

- sender-domain verification state;
- email delivery and failure status;
- API request-log evidence;
- template/version evidence;
- webhook and bounce evidence relevant to an approved release.

Control Room is evidence and approval authority, not an automatic production sender. Do not send live onboarding email, mutate contacts, publish templates, rotate keys, change domains, deploy application code, or modify production data without explicit founder approval.

For the Se'kret Bip parent/trusted-adult onboarding lane, record the repository PR/head SHA, deployed Edge Function version, verified sender, smoke-test outcome, and whether manual invite-code fallback remained available.
