import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  v10CapabilityRegistryHash,
} from '../dist/founder-os-lab/capabilityKernel.js';
import {
  V10_DECISION_CYCLE_CONTRACT,
  V10_DECISION_LENSES,
  v10DecisionReceiptHash,
} from '../dist/lib/v10DecisionAuthorityGate.js';

const proxyEnvKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
];

for (const key of proxyEnvKeys) delete process.env[key];
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

// The real E2E server persists opaque founder sessions through the same
// encrypted-at-rest path as production. Supply a deterministic test-only key
// at the harness boundary so every spawned scenario proves that path without
// adding a production fallback or requiring a repository secret.
process.env.FOUNDER_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');

// Keep the public package-script contract stable while proving each long
// journey against a fresh real server. The application correctly enforces a
// per-IP general request limit; running all three journeys in one process
// would test shared limiter exhaustion instead of their independent behavior.
if (!process.env.FCR_E2E_SCENARIO) {
  const runnerPath = new URL('./direct-browser-run.mjs', import.meta.url).pathname;
  for (const scenario of ['full', 'capability-workbench', 'guarded-terminal']) {
    console.log(`\n=== direct-browser scenario: ${scenario} ===`);
    execFileSync(process.execPath, [runnerPath], {
      cwd: process.cwd(),
      env: { ...process.env, FCR_E2E_SCENARIO: scenario },
      stdio: 'inherit',
    });
  }
  process.exit(0);
}

const E2E_DEMO_ROOT_SHA = 'a'.repeat(40);
const REAL_REPO_HEAD_SHA = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: process.cwd(),
  encoding: 'utf8',
}).trim().toLowerCase();
const E2E_CAPABILITY = {
  id: 'review-verify-merge',
  version: '1.0.0',
  origin: 'founder-native',
  owner: 'juss',
  sourceHash: 'c'.repeat(64),
  authorityCeiling: 'privileged',
};
const E2E_REGISTRY_HASH = v10CapabilityRegistryHash([E2E_CAPABILITY]);

process.env.E2E_FAKE_GITHUB_ROOT_SHA = E2E_DEMO_ROOT_SHA;
process.env.E2E_APPROVED_V10_REGISTRY_HASH = E2E_REGISTRY_HASH;
process.env.E2E_APPROVED_V10_REGISTRY_ENTRIES_JSON = JSON.stringify([E2E_CAPABILITY]);

function chiefPlan(projectSlug, requestedAuthority, expectedHeadSha) {
  const base = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: projectSlug === 'founder-control-room'
      ? 'Create the exact-head guarded terminal proof branch.'
      : 'Ship the onboarding flow',
    projectSlug,
    expectedHeadSha: String(expectedHeadSha).trim().toLowerCase(),
    registryHash: E2E_REGISTRY_HASH,
    requestedAuthority,
    strategicLenses: ['futureyou', 'truthmode', 'redteam'],
    routingReason: 'E2E Chief-provider fixture selects the smallest approved capability set for this exact privileged action.',
    capabilities: [E2E_CAPABILITY],
    proofRequirements: ['fresh founder proof gate', 'exact-head GitHub evidence', 'approved registry snapshot'],
    outcomeSignals: ['privileged-action-receipt', 'exact-head-preserved'],
    rollback: requestedAuthority === 'privileged'
      ? 'Revert the merge commit if post-merge proof fails.'
      : 'Delete the sandbox branch if branch proof fails.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

function chiefDecisionReceipt(projectSlug, expectedHeadSha) {
  const base = {
    contract: V10_DECISION_CYCLE_CONTRACT,
    goal: 'Authorize only the exact founder-reviewed merge after every required V10 witness is bound.',
    workspaceId: 'e2e-workspace',
    projectSlug,
    expectedHeadSha: String(expectedHeadSha).trim().toLowerCase(),
    customerOutcome: 'The intended reviewed change reaches the default branch without approval identity drift.',
    desiredState: 'Chief recommendation, PromptOS handoff, founder approval, capability plan, and exact head resolve to one merge identity.',
    currentState: 'The exact branch head is reviewed and proof-gated for merge.',
    bottleneck: 'Privileged execution must prove that the founder approved the same decision that Chief and PromptOS carried.',
    decisionClass: 'high-consequence',
    reality: {
      verified: ['The browser scenario has exact-head GitHub evidence and a passing founder proof gate.'],
      inferred: ['Binding one decision identity reduces cross-surface interpretation drift.'],
      unknown: ['No post-merge runtime claim is made by this local provider fixture.'],
      blocked: [],
    },
    lensReports: V10_DECISION_LENSES.map((lens) => ({
      lens,
      finding: `${lens} confirms the exact merge identity must remain bounded.`,
      recommendation: `${lens} requires the existing proof and rollback gates to remain intact.`,
      confidence: 0.9,
      evidenceRefs: [`e2e:${lens}`],
      assumptions: [`fixture:${lens}`],
      risks: [`drift:${lens}`],
      blockers: [],
      requestedEvidence: [`exact:${lens}`],
      metrics: [],
    })),
    dissent: ['Redteam blocks any merge whose decision, founder approval, plan, or exact head diverges.'],
    candidateOptions: ['Bind exact decision identity before merge.', 'Leave decision identity implicit.'],
    recommendation: 'Bind the portable decision and explicit founder approval to the exact merge execution.',
    authorityCeiling: 'reason',
    proofRequirements: ['exact-head execution evidence', 'founder decision binding', 'independent review receipt'],
    outcomeSignals: ['one-bound-merge-execution'],
    rollback: 'Revert the merge commit if downstream proof fails.',
    stopConditions: ['decision hash mismatch', 'founder decision mismatch', 'head drift'],
    nextGate: 'Founder Control Room may resolve merge authority only after the exact founder decision validates.',
    requiresFounderApproval: true,
    executionAuthorized: false,
  };
  return { ...base, decisionHash: v10DecisionReceiptHash(base) };
}

let activeBrowserPage = null;

async function replaceLegacyBearerWithOpaqueCookie(url, init) {
  const headers = new Headers(init.headers ?? {});
  const authorization = headers.get('authorization');
  if (!authorization) return init;

  if (!/^Bearer (?:undefined|null)?$/i.test(authorization.trim())) {
    throw new Error('E2E_BROWSER_BEARER_REGRESSION: browser-readable bearer credentials must not cross the opaque-session boundary');
  }
  if (!activeBrowserPage) {
    throw new Error('E2E_OPAQUE_COOKIE_UNAVAILABLE: no authenticated browser page is bound to the direct request');
  }

  const cookies = await activeBrowserPage.context().cookies(url);
  const founderCookie = cookies.find((cookie) => cookie.name === '__Host-fcr_session');
  if (!founderCookie || !founderCookie.value || founderCookie.httpOnly !== true) {
    throw new Error('E2E_OPAQUE_COOKIE_UNAVAILABLE: expected an HttpOnly __Host-fcr_session cookie');
  }

  headers.delete('authorization');
  headers.set('cookie', `${founderCookie.name}=${founderCookie.value}`);
  return { ...init, headers };
}

// run.mjs performs a few provider-boundary calls with Node fetch. Its legacy
// code still asks sessionStorage for an access token. After the opaque-session
// cutover that value must be absent. Translate only that explicit stale test
// shape into the real HttpOnly browser cookie, and fail if a readable bearer
// token ever reappears. This keeps the browser UI itself cookie-native while
// preserving the existing long-form E2E journey.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  init = await replaceLegacyBearerWithOpaqueCookie(url, init);

  if (url.includes('/approvals/') && url.endsWith('/execute') && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      if (body?.actionType === 'create_branch' && !body.capabilityPlan) {
        body.capabilityPlan = chiefPlan('founder-control-room', 'reversible', REAL_REPO_HEAD_SHA);
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // Preserve malformed requests unchanged so the real route can reject them.
    }
  }
  return originalFetch(input, init);
};

async function withV10PlanAwarePage(page) {
  activeBrowserPage = page;
  const originalClick = page.click.bind(page);
  page.click = async (selector, options) => {
    if (selector === '#create-branch-form button[type=submit]') {
      await page.fill(
        '#create-branch-form textarea[name="capabilityPlan"]',
        JSON.stringify(chiefPlan('demo-project', 'reversible', E2E_DEMO_ROOT_SHA)),
      );
    }

    if (selector === '#execute-merge-form button[type=submit]') {
      const expectedHeadSha = await page.locator('#execute-merge-form input[name="expectedHeadSha"]').inputValue();
      const plan = chiefPlan('demo-project', 'privileged', expectedHeadSha);
      const decisionReceipt = chiefDecisionReceipt('demo-project', expectedHeadSha);
      await page.fill(
        '#execute-merge-form textarea[name="capabilityPlan"]',
        JSON.stringify(plan),
      );
      await page.fill(
        '#execute-merge-form textarea[name="decisionReceipt"]',
        JSON.stringify(decisionReceipt),
      );
      await page.fill(
        '#execute-merge-form input[name="promptOSDecisionHash"]',
        decisionReceipt.decisionHash,
      );
    }

    return originalClick(selector, options);
  };
  return page;
}

const originalLaunch = chromium.launch.bind(chromium);
Object.defineProperty(chromium, 'launch', {
  configurable: true,
  async value(options = {}) {
    const args = [...new Set([...(options.args ?? []), '--no-proxy-server'])];
    const browser = await originalLaunch({ ...options, args });
    return new Proxy(browser, {
      get(target, property) {
        if (property === 'newPage') {
          return async (...args) => withV10PlanAwarePage(await target.newPage(...args));
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  },
});

await import('./run.mjs');
