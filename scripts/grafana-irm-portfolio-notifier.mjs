import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'fcr/portfolio-actions-audit@v1';
const ACCEPTED_STATES = new Set(['ATTENTION', 'INCOMPLETE_COVERAGE', 'OBSERVED_CHECKS_ONLY', 'BLOCKED']);

export function formatAlert(receipt, detailsLink) {
  if (!receipt || receipt.schema !== SCHEMA || !ACCEPTED_STATES.has(receipt.state)) {
    throw new Error('INVALID_PORTFOLIO_AUDIT_RECEIPT');
  }
  const count = receipt.installationRepositories;
  if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) {
    throw new Error('INVALID_PORTFOLIO_AUDIT_COUNT');
  }
  if (count === undefined && receipt.state !== 'BLOCKED') {
    throw new Error('INVALID_PORTFOLIO_AUDIT_COUNT');
  }
  const healthy = receipt.state === 'OBSERVED_CHECKS_ONLY';
  const payload = {
    alert_uid: 'fcr-portfolio-actions-audit',
    title: 'GitHub portfolio audit: ' + receipt.state,
    state: healthy ? 'ok' : 'alerting',
    message: 'State: ' + receipt.state + '. Accessible installation repositories: ' + (count ?? 'unknown') + '. ' +
      'This is GitHub Actions evidence only, not production verification. ' +
      'Private repository names, SHAs, user data, and raw receipts are withheld.',
  };
  if (typeof detailsLink === 'string' &&
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(detailsLink)) {
    payload.link_to_upstream_details = detailsLink;
  }
  return payload;
}

export function validateWebhookUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('INVALID_GRAFANA_IRM_ENDPOINT'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.grafana.net') ||
    !/^[-a-z0-9]+\.grafana\.net$/.test(parsed.hostname) || parsed.username || parsed.password ||
    parsed.search || parsed.hash || parsed.port ||
    !/^\/integrations\/v1\/formatted_webhook\/[A-Za-z0-9_-]+\/$/.test(parsed.pathname)) {
    throw new Error('INVALID_GRAFANA_IRM_ENDPOINT');
  }
  return parsed;
}

export async function dispatchAlert({ enabled, receipt, url, bearerToken, detailsLink, fetchImpl = fetch }) {
  if (!enabled) return 'DISABLED_UNVERIFIED';
  if (!url || !bearerToken) throw new Error('GRAFANA_IRM_CONFIGURATION_INCOMPLETE');
  validateWebhookUrl(url);
  if (!/^glsa_[^\s]+$/.test(bearerToken)) throw new Error('INVALID_GRAFANA_IRM_TOKEN');
  const body = JSON.stringify(formatAlert(receipt, detailsLink));
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearerToken },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || response.status < 200 || response.status >= 300) {
      throw new Error('GRAFANA_IRM_DELIVERY_UNVERIFIED');
    }
    return 'DELIVERED_HTTP_' + response.status + '_ONLY';
  } catch {
    // Never print a webhook URL, token, exception body, or HTTP response payload.
    throw new Error('GRAFANA_IRM_DELIVERY_UNVERIFIED');
  }
}

async function main() {
  const enabled = process.env.GRAFANA_IRM_ENABLED === 'true';
  if (!enabled) {
    console.log('GRAFANA_IRM_BRIDGE_DISABLED_UNVERIFIED');
    return;
  }
  const receipt = JSON.parse(await readFile(process.env.PORTFOLIO_RECEIPT_PATH ||
    'artifacts/portfolio-actions-audit/receipt.json', 'utf8'));
  const result = await dispatchAlert({
    enabled, receipt, url: process.env.GRAFANA_IRM_WEBHOOK_URL,
    bearerToken: process.env.GRAFANA_IRM_BEARER_TOKEN,
    detailsLink: process.env.GRAFANA_SOURCE_RUN_URL,
  });
  console.log(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeCodes = new Set(['GRAFANA_IRM_CONFIGURATION_INCOMPLETE', 'INVALID_GRAFANA_IRM_ENDPOINT',
      'INVALID_GRAFANA_IRM_TOKEN', 'INVALID_PORTFOLIO_AUDIT_RECEIPT',
      'INVALID_PORTFOLIO_AUDIT_COUNT', 'GRAFANA_IRM_DELIVERY_UNVERIFIED']);
    console.error(safeCodes.has(error.message) ? error.message : 'GRAFANA_IRM_AUDIT_UNAVAILABLE');
    process.exitCode = 1;
  });
}
