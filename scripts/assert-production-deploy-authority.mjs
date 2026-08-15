import { execFileSync } from 'node:child_process';

const AUTHORITY_CONTRACT = 'github-manual-exact-main-v1';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const APPROVAL_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

function fail(message) {
  console.error(`PRODUCTION_DEPLOY_AUTHORITY_BLOCKED: ${message}`);
  process.exit(1);
}

if (process.env.GITHUB_ACTIONS !== 'true') {
  fail('production deployment is allowed only from GitHub Actions');
}

if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
  fail('production deployment requires the manual workflow_dispatch event');
}

if (process.env.GITHUB_WORKFLOW !== 'Deploy') {
  fail('production deployment requires the canonical Deploy workflow');
}

if (process.env.FOUNDER_PRODUCTION_DEPLOY_AUTHORITY !== AUTHORITY_CONTRACT) {
  fail(`missing authority contract ${AUTHORITY_CONTRACT}`);
}

const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() ?? '';
if (!SHA_PATTERN.test(expectedHeadSha)) {
  fail('EXPECTED_HEAD_SHA must be a lowercase 40-character commit SHA');
}

const approvalId = process.env.DEPLOYMENT_APPROVAL_ID?.trim() ?? '';
if (!APPROVAL_PATTERN.test(approvalId)) {
  fail('DEPLOYMENT_APPROVAL_ID must be an auditable 8-200 character reference');
}

let checkedOutSha = '';
try {
  checkedOutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch {
  fail('unable to resolve the checked-out repository head');
}

if (checkedOutSha !== expectedHeadSha) {
  fail(`checked-out SHA ${checkedOutSha || 'unknown'} does not match approved SHA ${expectedHeadSha}`);
}

console.log('Production deploy authority membrane verified.');
console.log(`Approved exact head: ${expectedHeadSha}`);
console.log(`Approval reference: ${approvalId}`);
console.log(`Authority contract: ${AUTHORITY_CONTRACT}`);
