#!/usr/bin/env node
/**
 * FCR-owned Grafana observation only. No browser sessions, database writes,
 * dashboard edits, redirects, unbounded hosts, or raw telemetry in receipts.
 */
const ORIGIN = 'https://charmingpeacock2261.grafana.net';
const UID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const PROJECT_PATTERN = /^[a-z0-9]{20}$/;

function safeText(value) {
  return typeof value === 'string' ? value.slice(0, 120) : null;
}

function currentVariable(dashboard, name) {
  const item = dashboard?.templating?.list?.find((entry) => entry?.name === name);
  const value = item?.current?.value;
  return typeof value === 'string' ? value : null;
}

function allPanels(panels) {
  return (Array.isArray(panels) ? panels : []).flatMap((panel) => [
    panel, ...allPanels(panel?.panels)
  ]);
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new Error('BLOCKED_READ_TOKEN_NOT_CONFIGURED');
  }
}

async function getJson(fetchImpl, token, route) {
  const response = await fetchImpl(ORIGIN + route, {
    method: 'GET',
    redirect: 'error',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response || !response.ok) {
    const code = Number.isInteger(response?.status) ? response.status : 'UNKNOWN';
    throw new Error('BLOCKED_GRAFANA_HTTP_' + code);
  }
  const body = await response.text();
  if (body.length > 1048576) throw new Error('BLOCKED_RESPONSE_TOO_LARGE');
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('BLOCKED_INVALID_JSON');
  }
}

/** Inspect only the known Grafana account. The caller supplies the exact UID. */
export async function inspectGrafana({ token, uid, expectedProjectRef, fetchImpl = fetch }) {
  verifyToken(token);
  if (uid !== undefined && !UID_PATTERN.test(uid)) throw new Error('BLOCKED_INVALID_DASHBOARD_UID');
  if (expectedProjectRef !== undefined && !PROJECT_PATTERN.test(expectedProjectRef)) {
    throw new Error('BLOCKED_INVALID_PROJECT_REF');
  }
  if (!uid) {
    const entries = await getJson(fetchImpl, token, '/api/search?type=dash-db&limit=100');
    if (!Array.isArray(entries)) throw new Error('BLOCKED_INVALID_SEARCH_RESULT');
    const dashboards = entries.filter((entry) => UID_PATTERN.test(entry?.uid) && entry?.type === 'dash-db')
      .map((entry) => ({ uid: entry.uid, title: safeText(entry.title) }))
      .filter((entry) => /supabase|postgres|realtime/i.test(entry.title || ''));
    return {
      contract: 'fcr/grafana-observation@v1', status: 'NEEDS_EXACT_DASHBOARD_UID',
      instance: ORIGIN, dashboards, providerMutationAuthorized: false,
      browserVerified: false, metricsVerified: false,
    };
  }
  const payload = await getJson(fetchImpl, token, '/api/dashboards/uid/' + encodeURIComponent(uid));
  const dashboard = payload?.dashboard;
  if (!dashboard || dashboard.uid !== uid) throw new Error('BLOCKED_DASHBOARD_IDENTITY_MISMATCH');
  const project = currentVariable(dashboard, 'project');
  const identifier = currentVariable(dashboard, 'supabase_identifier');
  const panels = allPanels(dashboard.panels);
  const targets = [
    { title: 'Realtime replication status', metric: 'replication_realtime_slot_status' },
    { title: 'Realtime replication lag', metric: 'replication_realtime_lag_bytes' },
  ].map(({ title, metric }) => {
    const panel = panels.find((entry) => entry?.title === title);
    return {
      title, id: Number.isInteger(panel?.id) ? panel.id : null,
      configuredMetric: Boolean(panel?.targets?.some((target) =>
        typeof target.expr === 'string' && target.expr.includes(metric))),
      noValue: safeText(panel?.fieldConfig?.defaults?.noValue),
    };
  });
  const compactTiles = panels.filter((panel) =>
    ['CPU Cores', 'Uptime', 'SWAP Total', 'RootFS Total', 'Data Disk Total', 'RAM Total'].includes(panel?.title))
    .map((panel) => ({
      id: panel.id, title: panel.title, width: panel.gridPos?.w ?? null,
      textMode: safeText(panel.options?.textMode),
    }));
  const projectStatus = !project || !expectedProjectRef ? 'PROJECT_UNVERIFIED'
    : project === expectedProjectRef ? 'PROJECT_MATCH' : 'PROJECT_MISMATCH';
  return {
    contract: 'fcr/grafana-observation@v1', status: 'DASHBOARD_CONFIG_INSPECTED',
    instance: ORIGIN, dashboardUid: uid, dashboardTitle: safeText(dashboard.title),
    project, identifier, projectStatus, targets, compactTiles,
    datasourceTypes: [...new Set(panels.map((panel) => safeText(panel?.datasource?.type)).filter(Boolean))].sort(),
    providerMutationAuthorized: false, browserVerified: false, metricsVerified: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !arg.startsWith('--uid=') && !arg.startsWith('--expected-project=')) ||
      args.filter((arg) => arg.startsWith('--uid=')).length > 1 ||
      args.filter((arg) => arg.startsWith('--expected-project=')).length > 1) {
    throw new Error('BLOCKED_INVALID_ARGUMENTS');
  }
  const uid = args.find((arg) => arg.startsWith('--uid='))?.slice(6);
  const expectedProjectRef = args.find((arg) => arg.startsWith('--expected-project='))?.slice(19);
  const result = await inspectGrafana({
    token: process.env.FCR_GRAFANA_READ_TOKEN, uid, expectedProjectRef,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.projectStatus === 'PROJECT_MISMATCH') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch((error) => {
    console.error(String(error.message).startsWith('BLOCKED_') ? error.message : 'BLOCKED_PROVIDER_INSPECTION');
    process.exitCode = 1;
  });
}
