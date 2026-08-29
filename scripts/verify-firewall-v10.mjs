import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const policyPath = 'security/firewall-v10.policy.json';
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const server = readFileSync('src/http/server.ts', 'utf8');
const conveyor = readFileSync('src/http/routes/n8nConveyor.ts', 'utf8');
const founderAuth = readFileSync('src/http/middleware/requireFounder.ts', 'utf8');
const csrf = readFileSync('src/http/middleware/csrf.ts', 'utf8');
const security = readFileSync('src/http/middleware/security.ts', 'utf8');
const failures = [];

function requireTruthy(path, value) {
  if (!value) failures.push(`${path} must be truthy`);
}

function requireEqual(path, value, expected) {
  if (value !== expected) failures.push(`${path} expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`);
}

function requireArray(path, value, min = 1) {
  if (!Array.isArray(value) || value.length < min) failures.push(`${path} must contain at least ${min} item(s)`);
}

function requireContains(path, source, needle) {
  if (!source.includes(needle)) failures.push(`${path} must contain ${JSON.stringify(needle)}`);
}

function findKey(value, key, path = '$') {
  if (!value || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, key)) return `${path}.${key}`;
  for (const [childKey, childValue] of Object.entries(value)) {
    const found = findKey(childValue, key, `${path}.${childKey}`);
    if (found) return found;
  }
  return null;
}

requireEqual('version', policy.version, '10');
requireEqual('repository', policy.repository, 'jussray/founder-control-room');
requireEqual('mode', policy.mode, 'desired-state-with-observed-app-bindings');
requireEqual('activationStage', policy.activationStage, 'policy-ci-only');
requireEqual('evidence.productionCloudflareApplied', policy.evidence?.productionCloudflareApplied, 'unknown');
requireEqual('evidence.securityEventsReviewed', policy.evidence?.securityEventsReviewed, 'unknown');
requireEqual('evidence.productionBlockModeAuthorized', policy.evidence?.productionBlockModeAuthorized, false);
requireEqual('evidence.openApiV3SchemaEvidence', policy.evidence?.openApiV3SchemaEvidence, 'unknown');

requireArray('cloudflare.primaryHosts', policy.cloudflare?.primaryHosts, 2);
requireTruthy('cloudflare.managedWaf.desired', policy.cloudflare?.managedWaf?.desired);
requireTruthy('cloudflare.managedWaf.planAware', policy.cloudflare?.managedWaf?.planAware);
requireEqual('cloudflare.managedWaf.productionApplied', policy.cloudflare?.managedWaf?.productionApplied, 'unknown');
requireEqual('cloudflare.managedWaf.blockModeAuthorized', policy.cloudflare?.managedWaf?.blockModeAuthorized, false);
requireTruthy('cloudflare.apiShield.schemaValidation.desired', policy.cloudflare?.apiShield?.schemaValidation?.desired);
requireTruthy('cloudflare.apiShield.schemaValidation.planAware', policy.cloudflare?.apiShield?.schemaValidation?.planAware);
requireEqual('cloudflare.apiShield.schemaValidation.activationReady', policy.cloudflare?.apiShield?.schemaValidation?.activationReady, false);
requireEqual('cloudflare.apiShield.schemaValidation.productionApplied', policy.cloudflare?.apiShield?.schemaValidation?.productionApplied, 'unknown');
requireEqual('cloudflare.apiShield.schemaValidation.repositoryOpenApiV3Evidence', policy.cloudflare?.apiShield?.schemaValidation?.repositoryOpenApiV3Evidence, 'unknown');
requireTruthy('cloudflare.apiShield.schemaValidation.requiresVerifiedOpenApiV3', policy.cloudflare?.apiShield?.schemaValidation?.requiresVerifiedOpenApiV3);
requireEqual('cloudflare.apiShield.sessionAuth.edgeJwtRequired', policy.cloudflare?.apiShield?.sessionAuth?.edgeJwtRequired, false);
requireTruthy('cloudflare.botDefense.desired', policy.cloudflare?.botDefense?.desired);
requireTruthy('cloudflare.botDefense.planAware', policy.cloudflare?.botDefense?.planAware);
requireEqual('cloudflare.botDefense.productionApplied', policy.cloudflare?.botDefense?.productionApplied, 'unknown');
requireEqual('cloudflare.botDefense.zoneWideChallengeAuthorized', policy.cloudflare?.botDefense?.zoneWideChallengeAuthorized, false);
requireEqual('cloudflare.botDefense.activationReady', policy.cloudflare?.botDefense?.activationReady, false);
requireTruthy('cloudflare.botDefense.requiresMachineClientCompatibilityProof', policy.cloudflare?.botDefense?.requiresMachineClientCompatibilityProof);
requireArray('cloudflare.botDefense.machineClientsToPreserve', policy.cloudflare?.botDefense?.machineClientsToPreserve, 4);

requireEqual('bindings.conveyor.mountPath', policy.bindings?.conveyor?.mountPath, '/automation/conveyor');
requireEqual('bindings.conveyor.advancePath', policy.bindings?.conveyor?.advancePath, '/advance');
requireEqual('bindings.conveyor.fullMutationPath', policy.bindings?.conveyor?.fullMutationPath, '/automation/conveyor/advance');
requireEqual('bindings.conveyor.founderAuthMiddleware', policy.bindings?.conveyor?.founderAuthMiddleware, 'requireFounder');
requireTruthy('bindings.conveyor.sameOriginBrowserMutationGateBeforeMount', policy.bindings?.conveyor?.sameOriginBrowserMutationGateBeforeMount);

requireTruthy('controls.rateLimiting.desired', policy.controls?.rateLimiting?.desired);
requireEqual('controls.rateLimiting.productionApplied', policy.controls?.rateLimiting?.productionApplied, 'unknown');
requireEqual('controls.rateLimiting.applicationBaseline.generalPerIp.limit', policy.controls?.rateLimiting?.applicationBaseline?.generalPerIp?.limit, 60);
requireEqual('controls.rateLimiting.applicationBaseline.generalPerIp.periodSeconds', policy.controls?.rateLimiting?.applicationBaseline?.generalPerIp?.periodSeconds, 60);
requireEqual('controls.rateLimiting.applicationBaseline.magicLinkPerIp.limit', policy.controls?.rateLimiting?.applicationBaseline?.magicLinkPerIp?.limit, 5);
requireEqual('controls.rateLimiting.applicationBaseline.magicLinkPerIp.periodSeconds', policy.controls?.rateLimiting?.applicationBaseline?.magicLinkPerIp?.periodSeconds, 900);
requireArray('controls.rateLimiting.edgeRoutes', policy.controls?.rateLimiting?.edgeRoutes, 2);
const conveyorAdvanceRoute = policy.controls.rateLimiting.edgeRoutes.find((route) => route.method === 'POST' && route.path === '/automation/conveyor/advance');
if (!conveyorAdvanceRoute) failures.push('missing exact POST /automation/conveyor/advance edge route');
const staleConveyorRoute = policy.controls.rateLimiting.edgeRoutes.find((route) => String(route.path ?? '').includes('/api/founder-conveyor'));
if (staleConveyorRoute) failures.push(`stale conveyor route must not remain: ${JSON.stringify(staleConveyorRoute)}`);
for (const route of policy.controls.rateLimiting.edgeRoutes) {
  if (!route.method || !route.path || !route.limit || !route.periodSeconds || route.enforcement !== 'observe-before-block') {
    failures.push(`edge rate limit route is incomplete or prematurely enforcing: ${JSON.stringify(route)}`);
  }
}

requireTruthy('controls.auth.failClosed', policy.controls?.auth?.failClosed);
requireTruthy('controls.auth.privateRoutesRequireServerVerifiedSession', policy.controls?.auth?.privateRoutesRequireServerVerifiedSession);
requireArray('controls.auth.founderSessionMethods', policy.controls?.auth?.founderSessionMethods, 2);
requireEqual('controls.auth.founderAllowlist', policy.controls?.auth?.founderAllowlist, 'founder_users');
requireEqual('controls.auth.edgeJwtRequired', policy.controls?.auth?.edgeJwtRequired, false);
requireTruthy('controls.auth.forbiddenClientSecrets', policy.controls?.auth?.forbiddenClientSecrets);
requireArray('controls.auth.criticalServerOnlySecrets', policy.controls?.auth?.criticalServerOnlySecrets, 2);

requireEqual('controls.headers.runtimeObserved.referrerPolicy', policy.controls?.headers?.runtimeObserved?.referrerPolicy, 'no-referrer');
requireEqual('controls.headers.runtimeObserved.xFrameOptions', policy.controls?.headers?.runtimeObserved?.xFrameOptions, 'SAMEORIGIN');
requireTruthy('controls.headers.runtimeObserved.hstsInProduction', policy.controls?.headers?.runtimeObserved?.hstsInProduction);
requireTruthy('controls.headers.csp.desired', policy.controls?.headers?.csp?.desired);
requireEqual('controls.headers.csp.productionApplied', policy.controls?.headers?.csp?.productionApplied, 'unknown');
requireEqual('controls.headers.csp.activationMode', policy.controls?.headers?.csp?.activationMode, 'report-only-until-surface-proof');
requireTruthy('controls.headers.csp.surfaceProofRequired', policy.controls?.headers?.csp?.surfaceProofRequired);

requireTruthy('controls.integrations.githubWritesRequireExactHead', policy.controls?.integrations?.githubWritesRequireExactHead);
requireTruthy('controls.integrations.hubspotWritesRequireExplicitApproval', policy.controls?.integrations?.hubspotWritesRequireExplicitApproval);
requireTruthy('controls.integrations.n8nReceiptsRequireIdempotencyKey', policy.controls?.integrations?.n8nReceiptsRequireIdempotencyKey);
requireEqual('controls.integrations.automationPublishAllowed', policy.controls?.integrations?.automationPublishAllowed, false);
requireTruthy('controls.integrations.draftOnlyByDefault', policy.controls?.integrations?.draftOnlyByDefault);
requireTruthy('controls.observability.securityEventsRequiredBeforeBlockMode', policy.controls?.observability?.securityEventsRequiredBeforeBlockMode);
requireTruthy('controls.observability.noSilentNulls', policy.controls?.observability?.noSilentNulls);
requireTruthy('controls.productDesign.blockedStateMustBeHumanReadable', policy.controls?.productDesign?.blockedStateMustBeHumanReadable);
requireTruthy('controls.productDesign.legitimateUsersGetRecoveryPath', policy.controls?.productDesign?.legitimateUsersGetRecoveryPath);
requireTruthy('controls.productDesign.noMisleadingConnectedOrProtectedClaims', policy.controls?.productDesign?.noMisleadingConnectedOrProtectedClaims);

const enabledClaim = findKey(policy.cloudflare, 'enabled');
if (enabledClaim) failures.push(`${enabledClaim} must not claim live provider enablement without evidence`);

requireContains('server conveyor mount', server, "app.use('/automation/conveyor', n8nConveyorRouter);");
requireContains('conveyor founder auth', conveyor, 'n8nConveyorRouter.use(requireFounder);');
requireContains('conveyor advance route', conveyor, "n8nConveyorRouter.post('/advance'");
requireContains('founder bearer support', founderAuth, 'const explicitBearer = bearerToken(req);');
requireContains('founder cookie support', founderAuth, 'readFounderSession(req)');
requireContains('founder allowlist', founderAuth, ".from('founder_users')");
requireContains('csrf bearer bypass', csrf, "authorization?.startsWith('Bearer ')");
requireContains('csrf same-origin enforcement', csrf, "fetchSite !== 'same-origin'");
requireContains('runtime referrer policy', security, "res.setHeader('Referrer-Policy', 'no-referrer');");
requireContains('runtime frame policy', security, "res.setHeader('X-Frame-Options', 'SAMEORIGIN');");
requireContains('runtime hsts', security, "res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');");
if (!/export const rateLimitGeneral = createRateLimiter\(\s*60 \* 1_000,\s*60,/s.test(security)) failures.push('application general rate limiter drifted from 60 requests per 60 seconds');
if (!/export const rateLimitMagicLink = createRateLimiter\(\s*15 \* 60 \* 1_000,\s*5,/s.test(security)) failures.push('application magic-link limiter drifted from 5 requests per 15 minutes');

const csrfIndex = server.indexOf('app.use(requireSameOriginBrowserMutation);');
const conveyorMountIndex = server.indexOf("app.use('/automation/conveyor', n8nConveyorRouter);");
if (csrfIndex < 0 || conveyorMountIndex < 0 || csrfIndex >= conveyorMountIndex) {
  failures.push('same-origin browser mutation gate must remain before conveyor mount');
}

if (failures.length) {
  console.error('Firewall v10 policy failed verification:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const expectedSha = process.env.EXPECTED_SHA?.trim() || null;
const githubSha = process.env.GITHUB_SHA?.trim() || null;
const headSha = expectedSha || githubSha;
const receiptShaSource = expectedSha ? 'EXPECTED_SHA' : githubSha ? 'GITHUB_SHA' : 'none';
if (process.env.GITHUB_ACTIONS === 'true' && !/^[0-9a-f]{40}$/i.test(headSha ?? '')) {
  console.error('Firewall v10 policy failed verification:');
  console.error('- EXPECTED_SHA or GITHUB_SHA must provide an exact 40-character commit SHA in CI');
  process.exit(1);
}

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/firewall-v10-proof.json', `${JSON.stringify({
  schema: 'founder-control-room/firewall-v10-proof@v2',
  repository: policy.repository,
  headSha,
  receiptShaSource,
  policyVersion: policy.version,
  activationStage: policy.activationStage,
  providerState: policy.evidence.productionCloudflareApplied,
  productionBlockModeAuthorized: policy.evidence.productionBlockModeAuthorized,
  conveyorBinding: policy.bindings.conveyor,
  status: 'verified',
}, null, 2)}\n`);

console.log(`Firewall v10 policy verified for ${policy.repository}${headSha ? ` at ${headSha}` : ''}`);
