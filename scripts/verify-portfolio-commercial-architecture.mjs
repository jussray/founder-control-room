import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [contractText, graduationRule] = await Promise.all([
  read('config/portfolio-commercial-architecture.json'),
  read('docs/COMMERCIAL_PRODUCT_GRADUATION_RULE.md'),
]);

const contract = JSON.parse(contractText);
const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(contract.schemaVersion === 1, 'commercial architecture schemaVersion must be 1');
requireValue(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(contract.contractVersion), 'contractVersion must be date.revision');
requireValue(contract.authority?.repository === 'jussray/founder-control-room', 'FCR must own the portfolio commercial contract');
requireValue(contract.invariants?.repositoryIsNotAutomaticallyACompany === true, 'repo != company invariant is required');
requireValue(contract.invariants?.technicalIndependenceDoesNotRequireSeparateCommercialPackaging === true, 'technical/commercial separation invariant is required');
requireValue(contract.invariants?.standaloneProductIdentityIsIndependentOfBundling === true, 'standalone product identity must survive bundling');
requireValue(contract.invariants?.standalonePeersDoNotDefaultToParentPackaging === true, 'standalone peers must not default to parent-product packaging');
requireValue(contract.invariants?.visibilityUsageAndEngagementAreNotRevenue === true, 'visibility/usage/revenue separation invariant is required');
requireValue(contract.invariants?.moneyClaimsRequireEconomicEvidence === true, 'money claims must require economic evidence');
requireValue(contract.invariants?.customerAndPayerMayDiffer === true, 'customer/payer distinction is required');
requireValue(contract.invariants?.everyCommercialCandidateNeedsARepeatEngine === true, 'repeat-engine invariant is required');
requireValue(contract.invariants?.everyCommercialCandidateNeedsANextMoneyTest === true, 'next-money-test invariant is required');
requireValue(JSON.stringify(contract.invariants?.truthStatuses) === JSON.stringify(['VERIFIED', 'INFERRED', 'UNKNOWN', 'BLOCKED']), 'truth statuses drifted');

const expectedPillars = [
  ['founder-software', 'founder-control-room'],
  ['founder-intelligence', 'chief-ai-machine'],
  ['prompt-governance', 'promptos'],
  ['continuity-infrastructure', 'solcontinuity'],
  ['creator-software', 'storyengine'],
  ['family-product', 'sekret-bip'],
  ['commerce', 'juss-beautiful-hair'],
];
requireValue(
  JSON.stringify((contract.publicPillars ?? []).map((pillar) => [pillar.id, pillar.leadProduct])) === JSON.stringify(expectedPillars),
  'public pillar architecture drifted',
);

const founderSoftware = (contract.publicPillars ?? []).find((pillar) => pillar.id === 'founder-software');
requireValue(!(founderSoftware?.supportingSystems ?? []).includes('promptos'), 'PromptOS must not be nested under FCR supporting systems');
requireValue(!(founderSoftware?.supportingSystems ?? []).includes('solcontinuity'), 'SolContinuity must not be nested under FCR supporting systems');

requireValue(
  JSON.stringify(contract.commercialPriority) === JSON.stringify([
    'juss-beautiful-hair',
    'founder-control-room',
    'storyengine',
    'sekret-bip',
    'think-tank',
  ]),
  'commercial priority order drifted',
);

const requiredProductFields = [
  'repository',
  'role',
  'pillar',
  'customer',
  'payer',
  'value',
  'revenueMechanism',
  'repeatEngine',
  'northStar',
  'nextMoneyTest',
  'claimBoundary',
];

for (const [productId, product] of Object.entries(contract.products ?? {})) {
  for (const field of requiredProductFields) {
    requireValue(Object.hasOwn(product, field), `${productId} missing ${field}`);
  }
  requireValue(Array.isArray(product.revenueMechanism), `${productId} revenueMechanism must be an array`);
  requireValue(typeof product.nextMoneyTest === 'string' && product.nextMoneyTest.length > 20, `${productId} needs a concrete nextMoneyTest`);
  requireValue(typeof product.claimBoundary === 'string' && product.claimBoundary.length > 20, `${productId} needs a claimBoundary`);
}

const chief = contract.products?.['chief-ai-machine'];
requireValue(chief?.role === 'core-founder-intelligence-product', 'Chief commercial role must remain standalone');
requireValue(chief?.pillar === 'founder-intelligence', 'Chief must retain its own public product pillar');
requireValue(chief?.technicalIndependence === true, 'Chief must preserve technical independence');
requireValue(chief?.commercialIndependence === true, 'Chief must preserve commercial independence');
requireValue(chief?.defaultCommercialPackaging === 'chief-owned-offer', 'Chief must default to its own commercial offer');
requireValue(typeof chief?.bundleRule === 'string' && chief.bundleRule.includes('without becoming a module'), 'Chief bundle boundary is required');
requireValue(typeof chief?.separateOfferGate === 'string' && chief.separateOfferGate.includes('does not require FCR demand proof'), 'Chief standalone offer boundary is required');

const promptos = contract.products?.promptos;
requireValue(promptos?.role === 'core-prompt-governance-product', 'PromptOS commercial role must remain standalone');
requireValue(promptos?.pillar === 'prompt-governance', 'PromptOS must retain its own public product pillar');
requireValue(promptos?.technicalIndependence === true, 'PromptOS must preserve technical independence');
requireValue(promptos?.commercialIndependence === true, 'PromptOS must preserve commercial independence');
requireValue(promptos?.defaultCommercialPackaging === 'promptos-owned-offer', 'PromptOS must default to its own commercial offer');
requireValue(typeof promptos?.bundleRule === 'string' && promptos.bundleRule.includes('without becoming a module'), 'PromptOS bundle boundary is required');
requireValue(typeof promptos?.separateOfferGate === 'string' && promptos.separateOfferGate.includes('does not require FCR demand proof'), 'PromptOS standalone offer boundary is required');
requireValue(!promptos?.revenueMechanism?.includes('included-in-fcr'), 'PromptOS must not default to included-in-FCR packaging');

const solcontinuity = contract.products?.solcontinuity;
requireValue(solcontinuity?.role === 'core-continuity-infrastructure-product', 'SolContinuity commercial role must remain standalone');
requireValue(solcontinuity?.pillar === 'continuity-infrastructure', 'SolContinuity must retain its own public product pillar');
requireValue(solcontinuity?.technicalIndependence === true, 'SolContinuity must preserve technical independence');
requireValue(solcontinuity?.commercialIndependence === true, 'SolContinuity must preserve commercial independence');
requireValue(solcontinuity?.defaultCommercialPackaging === 'solcontinuity-owned-offer', 'SolContinuity must default to its own commercial offer');
requireValue(typeof solcontinuity?.bundleRule === 'string' && solcontinuity.bundleRule.includes('without becoming an FCR module'), 'SolContinuity bundle boundary is required');
requireValue(typeof solcontinuity?.separateOfferGate === 'string' && solcontinuity.separateOfferGate.includes('does not require FCR demand proof'), 'SolContinuity standalone offer boundary is required');

const truthWeaver = contract.products?.['truth-weaver'];
requireValue(truthWeaver?.role === 'premium-decision-module', 'Truth Weaver commercial role drifted');

const sleepwealth = contract.products?.['sleepwealth-agent'];
requireValue(sleepwealth?.role === 'research-lane', 'SleepWealth must remain a research lane until demand exists');
requireValue((sleepwealth?.revenueMechanism ?? []).length === 0, 'SleepWealth must not invent a revenue mechanism');

const teardownFields = contract.contentTeardownContract?.requiredFields ?? [];
for (const field of ['product', 'customer', 'payer', 'problem', 'value', 'revenueMechanism', 'repeatEngine', 'northStar', 'proof', 'unproven', 'nextMoneyTest']) {
  requireValue(teardownFields.includes(field), `content teardown missing ${field}`);
}

for (const marker of [
  'REPOSITORY ROLE',
  'CUSTOMER',
  'PAYER',
  'VALUE',
  'REVENUE MECHANISM',
  'REPEAT ENGINE',
  'NORTH STAR',
  'UNPROVEN',
  'NEXT MONEY TEST',
]) {
  requireValue(graduationRule.includes(marker), `commercial graduation rule missing ${marker}`);
}

if (failures.length > 0) {
  console.error('Portfolio commercial architecture verification failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Portfolio commercial architecture ${contract.contractVersion} passed.`);
console.log('Seven public pillars, money-path fields, truth boundaries, and standalone-vs-bundle roles verified.');
console.log('This verification does not prove customers, payments, revenue, retention, checkout, deployment, or demand.');
