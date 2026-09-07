import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function collapseSources(entries, label) {
  const populated = entries
    .map(({ source, value }) => ({ source, value: normalize(value) }))
    .filter(({ value }) => Boolean(value));
  const values = [...new Set(populated.map(({ value }) => value))];
  if (values.length > 1) {
    throw new Error(`Conflicting ${label} values are configured across protected sources.`);
  }
  return {
    value: values[0] || '',
    sources: populated.map(({ source }) => source),
  };
}

function resolveSpecificFirst({ specific, generic, label }) {
  const specificState = collapseSources(specific, `Chief-specific ${label}`);
  const genericState = collapseSources(generic, `generic ${label}`);
  if (specificState.value && genericState.value && specificState.value !== genericState.value) {
    throw new Error(`Chief-specific ${label} conflicts with the generic fallback alias.`);
  }
  if (specificState.value) {
    return { value: specificState.value, source: 'chief-specific' };
  }
  if (genericState.value) {
    return { value: genericState.value, source: 'generic-fallback' };
  }
  return { value: '', source: 'none' };
}

function fingerprintSelector(clientId, serviceTokenId) {
  if (!clientId && !serviceTokenId) return null;
  const canonical = JSON.stringify({
    schema: 'chief-access-selector/v1',
    clientId: clientId || null,
    serviceTokenId: serviceTokenId || null,
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function resolveChiefAccessSelector(input = {}) {
  const client = resolveSpecificFirst({
    specific: [
      { source: 'chief-secret', value: input.chiefClientIdSecret },
      { source: 'chief-variable', value: input.chiefClientIdVariable },
    ],
    generic: [
      { source: 'generic-secret', value: input.genericClientIdSecret },
      { source: 'generic-variable', value: input.genericClientIdVariable },
    ],
    label: 'client ID',
  });

  const serviceToken = resolveSpecificFirst({
    specific: [
      { source: 'chief-variable', value: input.chiefServiceTokenIdVariable },
    ],
    generic: [
      { source: 'generic-variable', value: input.genericServiceTokenIdVariable },
    ],
    label: 'service-token ID',
  });

  if (input.requireIdentity && !client.value && !serviceToken.value) {
    throw new Error('Chief Access service-token identity is required before repair.');
  }

  return {
    clientId: client.value,
    clientIdSource: client.source,
    serviceTokenId: serviceToken.value,
    serviceTokenIdSource: serviceToken.source,
    selectorFingerprint: fingerprintSelector(client.value, serviceToken.value),
  };
}

function appendEnv(name, value) {
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required for workflow selector resolution.');
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value || ''}\n`, 'utf8');
}

function main() {
  const resolved = resolveChiefAccessSelector({
    chiefClientIdSecret: process.env.CHIEF_ACCESS_CLIENT_ID_SECRET,
    chiefClientIdVariable: process.env.CHIEF_ACCESS_CLIENT_ID_VARIABLE,
    genericClientIdSecret: process.env.GENERIC_ACCESS_CLIENT_ID_SECRET,
    genericClientIdVariable: process.env.GENERIC_ACCESS_CLIENT_ID_VARIABLE,
    chiefServiceTokenIdVariable: process.env.CHIEF_ACCESS_SERVICE_TOKEN_ID_VARIABLE,
    genericServiceTokenIdVariable: process.env.GENERIC_ACCESS_SERVICE_TOKEN_ID_VARIABLE,
    requireIdentity: process.env.CHIEF_SELECTOR_REQUIRE_IDENTITY === 'true',
  });

  appendEnv('CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID', resolved.clientId);
  appendEnv('CHIEF_RUNTIME_ACCESS_CLIENT_ID', resolved.clientId);
  appendEnv('CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID', resolved.serviceTokenId);
  appendEnv('CHIEF_ACCESS_SELECTOR_FINGERPRINT', resolved.selectorFingerprint || 'none');
  appendEnv('CHIEF_ACCESS_CLIENT_ID_SOURCE', resolved.clientIdSource);
  appendEnv('CHIEF_ACCESS_SERVICE_TOKEN_ID_SOURCE', resolved.serviceTokenIdSource);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `client_id_source=${resolved.clientIdSource}\nservice_token_id_source=${resolved.serviceTokenIdSource}\nselector_fingerprint=${resolved.selectorFingerprint || 'none'}\n`,
      'utf8',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chief Access selector resolution failed.';
    console.error(`::error title=Chief Access selector conflict::${message}`);
    process.exitCode = 1;
  }
}
