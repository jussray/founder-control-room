#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function classifyProviderToken(value, { accountId = '' } = {}) {
  const token = typeof value === 'string' ? value : '';
  const present = token.length > 0;
  const hasBearerPrefix = /^Bearer\s+/i.test(token);
  const hasWhitespace = /\s/.test(token);
  const hasLeadingOrTrailingWhitespace = token !== token.trim();
  const hasNonAscii = /[^\x20-\x7E]/.test(token);
  const hasNonPrintable = /[^\x21-\x7E]/.test(token);
  const hasWrappingQuote = token.length >= 2 && token[0] === token[token.length - 1] && ['"', "'"].includes(token[0]);
  const looksLikeAssignment = /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
  const matchesAccountId = Boolean(accountId && token === accountId);

  let classification = 'ok';
  if (!present) classification = 'missing';
  else if (matchesAccountId) classification = 'account-id-substitution';
  else if (hasNonAscii) classification = 'non-ascii';
  else if (hasBearerPrefix) classification = 'bearer-prefix';
  else if (looksLikeAssignment) classification = 'assignment-wrapper';
  else if (hasWrappingQuote) classification = 'wrapping-quotes';
  else if (hasLeadingOrTrailingWhitespace || hasWhitespace) classification = 'whitespace';
  else if (hasNonPrintable) classification = 'non-printable';

  return {
    present,
    classification,
    headerSafe: classification === 'ok',
    hasBearerPrefix,
    hasWhitespace,
    hasLeadingOrTrailingWhitespace,
    hasNonAscii,
    hasNonPrintable,
    hasWrappingQuote,
    looksLikeAssignment,
    matchesAccountId,
  };
}

export function classifyCloudflareAccountId(value, { required = false } = {}) {
  const accountId = typeof value === 'string' ? value : '';
  const present = accountId.length > 0;
  let classification = 'ok';

  if (!present && !required) classification = 'not-required';
  else if (!present) classification = 'missing';
  else if (!/^[0-9a-f]{32}$/.test(accountId)) classification = 'invalid-shape';

  return {
    required,
    present,
    classification,
    structurallyValid: classification === 'ok' || classification === 'not-required',
  };
}

export function nextCredentialAction(name, classification) {
  if (classification === 'ok') return 'credential-shape-valid';
  if (classification === 'missing') return `configure ${name} with the raw provider-issued token`;
  if (classification === 'account-id-substitution') return `replace ${name}; an account ID was stored where a token is required`;
  return `replace ${name} with the raw provider-issued token only; no prefix, assignment, quotes, whitespace, or Unicode punctuation`;
}

export function nextAccountAuthorityAction(classification) {
  if (classification === 'ok' || classification === 'not-required') return 'account-authority-shape-valid';
  if (classification === 'missing') return 'configure CLOUDFLARE_ACCOUNT_ID with the provider-issued 32-character lowercase account ID';
  return 'replace CLOUDFLARE_ACCOUNT_ID with the provider-issued 32-character lowercase hexadecimal account ID';
}

export function buildCredentialReceipt({
  name,
  value,
  accountId = '',
  requireAccountId = false,
  purpose = 'provider-api',
}) {
  const shape = classifyProviderToken(value, { accountId });
  const accountAuthority = classifyCloudflareAccountId(accountId, { required: requireAccountId });
  return {
    schemaVersion: 2,
    provider: 'cloudflare',
    credentialName: name,
    purpose,
    observedAt: new Date().toISOString(),
    expectedHeadSha: process.env.EXPECTED_HEAD_SHA || process.env.GITHUB_SHA || null,
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    ok: shape.headerSafe && accountAuthority.structurallyValid,
    shape,
    accountAuthority,
    nextAction: shape.headerSafe
      ? nextAccountAuthorityAction(accountAuthority.classification)
      : nextCredentialAction(name, shape.classification),
    secretValueRead: false,
    secretValuePrinted: false,
    providerMutation: false,
  };
}

export async function writeCredentialReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    options[key] = argv[index + 1];
    index += 1;
  }
  return options;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  const envName = args.env;
  if (!envName) {
    console.error('::error title=Credential contract misuse::--env <ENV_NAME> is required.');
    process.exitCode = 2;
  } else {
    const accountId = args['account-id'] || (args['account-id-env'] ? process.env[args['account-id-env']] : '') || '';
    const receipt = buildCredentialReceipt({
      name: envName,
      value: process.env[envName] ?? '',
      accountId,
      requireAccountId: args['require-account-id'] === 'true' || Boolean(args['account-id-env']),
      purpose: args.purpose || 'provider-api',
    });
    if (args.output) await writeCredentialReceipt(args.output, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.ok) {
      console.error(`::error title=Malformed provider credential::${envName}: ${receipt.shape.classification}; account authority: ${receipt.accountAuthority.classification}. ${receipt.nextAction}`);
      process.exitCode = 1;
    }
  }
}
