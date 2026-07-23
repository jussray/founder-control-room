# HubSpot + OpenAI Plugin Contract

Date: 2026-07-22
Branch: `codex/hubspot-openai-plugin-contract`
Base: `dd2592b86f790b0b69aa37a8ef0a86bdc03e2db4`

## Goal

Represent the connected HubSpot CRM and OpenAI Developers build surface in Founder Control Room without creating duplicate authority, exposing credentials, moving storefront heads, or authorizing commercial execution.

## Reality

- The Plugin Center already declared GitHub, Supabase, Cloudflare, OpenAI, Gmail, Shopify, and other capabilities.
- HubSpot was used by Founder Signal Engine documentation and live CRM state but was missing from the typed Plugin Center catalog.
- OpenAI Developers was referenced in repository operating instructions, while the Plugin Center described only a generic OpenAI model capability.
- The verified storefront PR heads remain separate and must not move for this governance change.

## Red Team I — premise

Adding a second OpenAI provider type would create duplicate authority and provider drift. Omitting HubSpot leaves a real connected surface outside the typed authority inventory. The correct change is additive: add HubSpot, and clarify that OpenAI Developers is a build surface inside the existing OpenAI provider boundary.

## Lindy choice

- Keep one OpenAI provider identity.
- Add an explicit CRM capability with separate read and mutation authority.
- Keep OAuth and API keys provider-held.
- Encode high-risk defaults in typed contracts and tests.

## L99 boundaries

- GitHub: repository evidence only; this branch does not touch storefront PR heads.
- HubSpot: minimized CRM metadata; no customer export, payment, quote publication, or unconfirmed record mutation.
- OpenAI: server-side model and developer build artifacts; no raw keys, client keys, autonomous provider actions, or model-as-approval.
- Shopify: unchanged; no catalog, inventory, pricing, checkout, customer, or vendor operation.
- Supabase: unchanged; no migration or data write.

## Decision

1. Bump Plugin Center contract additively from `1.0.0` to `1.1.0`.
2. Add `manage_crm_records` as an L6, critical, evidence-required, separately gated capability.
3. Add a `hubspot` plugin descriptor with confirmation, association, export, messaging, and payment/quote blocks.
4. Rename the existing OpenAI catalog label to `OpenAI Platform / Developers` and document that Agents SDK and ChatGPT App work remain inside the existing OpenAI provider boundary.
5. Add integration assertions for both provider contracts.

## Bill Gates pass

Bottleneck: the real CRM and developer-tool surfaces were not fully represented in the typed provider inventory.

Highest leverage: encode the missing authority boundaries once in the Plugin Center so UI, routes, tests, and future connection rows share the same contract.

Standardize: every new provider must define data boundary, secret policy, capabilities, blocked defaults, proof requirement, and separate founder gates.

Do not scale yet: do not create HubSpot project-connection rows, CRM automations, OpenAI keys, Agents SDK runtimes, outreach, quotes, payments, or deployment from this PR.

## Elon Musk pass

- Deleted the idea of a duplicate `openai-developers` authority type.
- Reused the existing OpenAI provider contract.
- Added one CRM mutation capability instead of many tool-specific capabilities.
- Kept the change to registry, tests, provider documentation, and this decision record.

## Proof required

- Typecheck.
- Unit/integration tests, including Plugin Center integration test.
- Lint.
- Build.
- Exact-head GitHub Actions with real steps and logs.
- Playwright is inapplicable because no user-facing browser behavior changes.

## Rollback

Revert this branch or its eventual squash merge. No migration, provider connection, key, CRM record, storefront data, deployment, or commercial state must be undone.

## Next gate

Open a reviewed pull request, inspect exact-head CI, and merge only if the required checks genuinely execute and pass. This merge does not authorize HubSpot writes, OpenAI key creation, storefront changes, deployment, outreach, publication, spending, or customer/vendor data access.
