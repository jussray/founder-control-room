# Zapier SDK tooling

This package keeps Zapier SDK access on a server-side developer boundary instead of adding it to the Founder Control Room runtime bundle.

## Local setup

Requirements: Node.js 20+ and a Zapier account with at least one connected app.

```bash
cd tools/zapier
npm ci
npx skills add zapier/sdk -y
npm run login
npm run verify:readonly
```

`npm run login` opens Zapier's browser authentication flow with interactive CLI prompts disabled.

`npm run verify:readonly` performs the approved account-scoped validation:

- proves the local Zapier session can authenticate;
- observes at most 100 apps and 100 owned connections;
- reports only counts, expiration count, and app keys;
- discards profile fields;
- never prints connection IDs, titles, account labels, or email addresses;
- never runs an app action or performs a write.

When either observed count is exactly 100, the output marks that additional records may exist beyond the inspected page.

## Development checks

```bash
npm run typecheck
npm test
```

The focused test verifies that connection IDs, titles, labels, emails, and raw provider errors cannot enter the approved summary output.

## Raw exploration

Raw CLI inventory may contain account labels, titles, connection IDs, or other sensitive metadata. Run these only in a private local terminal and never paste, commit, upload, or attach their output:

```bash
npm run apps:raw
npm run connections:raw
npx zapier-sdk list-actions github
npx zapier-sdk list-actions hubspot
```

Generate TypeScript types only for integrations selected for implementation:

```bash
npx zapier-sdk add github hubspot --types-output ./src/generated
```

## Production credentials

Browser login is for local development. For a server or deployment, create approved client credentials locally:

```bash
npx zapier-sdk create-client-credentials "founder-control-room"
```

Store the returned values in the deployment secret manager as:

- `ZAPIER_CREDENTIALS_CLIENT_ID`
- `ZAPIER_CREDENTIALS_CLIENT_SECRET`

The bootstrap also supports an approved `ZAPIER_CREDENTIALS` direct token, but client credentials are preferred for server-side use.

Never commit `.env`, tokens, client secrets, generated connection output, or app data. Credential creation, rotation, deployment, and live write actions remain separate approval gates.

Official quickstart: https://docs.zapier.com/sdk/quickstart
