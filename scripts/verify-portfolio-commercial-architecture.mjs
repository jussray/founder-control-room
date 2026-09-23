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
requireValue(contract.invariants?.visibilityUsageAndEngagementAreNotRevenue === true, 'visibility/usage/revenue separation invariant is required');
requireValue(contract.invariants?.moneyClaimsRequireEconomicEvidence === true, 'money claims must require economic evidence');
requireValue(contract.invariants?.customerAndPayerMayDiffer === true, 'customer/payer distinction is required');
requireValue(contract.invariants?.everyCommercialCandidateNeedsARepeatEngine === true, 'repeat-engine invariant is required');
requireValue(contract.invariants?.everyCommercialCandidateNeedsANextMoneyTest === true, 'next-money-test invariant is required');
requireValue(JSON.stringify(contract.invariants?.truthStatuses) === JSON.stringify(['VERIFIED', 'INFERRED', 'UNKNOWN', 'BLOCKED']), 'truth statuses drifted');

const expectedPillars = [
  ['founder-software', 'founder-control-room'],
  ['creator-software', 'storyengine'],
  ['family-product', 'sekret-bip'],
  ['commerce', 'juss-beautiful-hair'],
];
requireValue(
  JSON.stringify((contract.publicPillars ?? []).map((pillar) => [pillar.id, pillar.leadProduct])) === JSON.stringify(expectedPillars),
  'public pillar architecture drifted',
);

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
requireValue(chief?.technicalIndependence === true, 'Chief must preserve technical independence');
requireValue(chief?.defaultCommercialPackaging === 'inside-founder-control-room', 'Chief must default to FCR commercial packaging');
requireValue(typeof chief?.separateOfferGate === 'string' && chief.separateOfferGate.includes('independent customer'), 'Chief separate-offer gate is required');

const promptos = contract.products?.promptos;
requireValue(promptos?.role === 'engine-and-acquisition-layer', 'PromptOS commercial role drifted');
requireValue(promptos?.revenueMechanism?.includes('included-in-fcr'), 'PromptOS must compound FCR by default');

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
console.log('Four public pillars, money-path fields, truth boundaries, and module-vs-company roles verified.');
console.log('This verification does not prove customers, payments, revenue, retention, checkout, deployment, or demand.');
