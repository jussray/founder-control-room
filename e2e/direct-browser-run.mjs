import { chromium } from 'playwright';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  v10CapabilityRegistryHash,
} from '../dist/founder-os-lab/capabilityKernel.js';

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

const E2E_DEMO_ROOT_SHA = 'a'.repeat(40);
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

function chiefPlan(requestedAuthority, expectedHeadSha) {
  const base = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Ship the onboarding flow',
    projectSlug: 'demo-project',
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

async function withV10PlanAwarePage(page) {
  const originalClick = page.click.bind(page);
  page.click = async (selector, options) => {
    if (selector === '#create-branch-form button[type=submit]') {
      await page.fill(
        '#create-branch-form textarea[name="capabilityPlan"]',
        JSON.stringify(chiefPlan('reversible', E2E_DEMO_ROOT_SHA)),
      );
    }

    if (selector === '#execute-merge-form button[type=submit]') {
      const expectedHeadSha = await page.locator('#execute-merge-form input[name="expectedHeadSha"]').inputValue();
      await page.fill(
        '#execute-merge-form textarea[name="capabilityPlan"]',
        JSON.stringify(chiefPlan('privileged', expectedHeadSha)),
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
