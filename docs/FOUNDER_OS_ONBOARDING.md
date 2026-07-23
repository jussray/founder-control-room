# Founder OS onboarding

## Product boundary

Founder Control Room is the source of operational truth. GitHub, Cloudflare,
Supabase, OpenAI, HubSpot, and Playwright are replaceable provider adapters.

The onboarding flow creates only:

- a Control Room project registry row;
- disconnected provider slots with declared authority levels;
- an auditable onboarding event;
- links into GitHub Workspace, Command Bridge, Plugin Center, and the main
  Control Room cockpit.

It does **not** create or store provider credentials, connect a provider, merge
code, deploy production, mutate CRM data, send external communication, spend
money, alter DNS, apply migrations, or grant future approval.

## Frontend flow

1. Authenticate with Google through Supabase Auth or use the magic-link fallback.
2. Pass the private founder allowlist check.
3. Name or reuse a project workspace.
4. Declare provider slots.
5. Confirm the no-approval-carries-forward authority boundary.
6. Enter the Control Room modules.

The state screen is derived from the existing `projects` and
`project_connections` tables, so the flow resumes without a second onboarding
truth source.

## Provider status model

Every provider created during onboarding starts as `disconnected`. A connection
can become active only after provider-held authorization is completed and a
separate health check records evidence.

HubSpot is classified as L6 because CRM mutations and external customer
operations require a fresh founder decision. OpenAI is L3 by default because
model capability is not approval authority. GitHub repository integration is L5;
Cloudflare and Supabase production operations are L6. Playwright is L3 evidence
collection.

## Independent evidence

Founder Control Room registers the allowlisted command:

```text
verify.founder-onboarding
npm run verify:founder-onboarding
```

This contract verifies the Google OAuth route, private allowlist boundary,
workspace bootstrap route, disconnected-by-default provider slots, no-secret
storage rule, HubSpot schema parity, Cloudflare Worker composition, and the
separate merge/deploy approval boundary.

A passing contract is source evidence only. Exact-head typecheck, unit tests,
browser tests, deployment evidence, and founder approvals remain separate gates.

## Rollout gates

1. Apply the reviewed HubSpot connection-type migration in the dedicated Founder
   Control Room Supabase project.
2. Configure Google as a Supabase Auth provider and add the exact production and
   preview callback URLs.
3. Deploy a preview from the exact branch head.
4. Run typecheck, tests, the onboarding contract, and Playwright against the
   preview.
5. Review screenshots, console output, network failures, and callback behavior.
6. Merge only with exact-head evidence and explicit founder approval.
7. Deploy production through a separate founder-approved release action.
