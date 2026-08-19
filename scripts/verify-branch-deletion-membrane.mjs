import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contract = JSON.parse(
  await readFile(new URL('../.control-room/founder-control.contract.json', import.meta.url), 'utf8'),
);
const providerInterface = await readFile(new URL('../src/providers/RepositoryProvider.ts', import.meta.url), 'utf8');
const providerFactory = await readFile(new URL('../src/providers/providerFactory.ts', import.meta.url), 'utf8');

const rules = contract.workLifecycle?.rules;
assert.ok(rules, 'workLifecycle rules are required');
assert.equal(rules.directBranchDeletionExposed, false);
assert.equal(rules.branchDeletionRequiresReceiptAwareReconciler, true);

assert.doesNotMatch(providerInterface, /\bdeleteBranch\s*\(/, 'RepositoryProvider must not expose ambient branch deletion before an obligation-aware retirement reconciler exists');
assert.doesNotMatch(providerFactory, /\bdeleteBranch\s*\(/, 'providerForProject must not forward ambient branch deletion before supersession authority is verified');

console.log('Branch deletion membrane verified: canonical repository authority exposes no ambient deleteBranch capability.');
