import { readFile } from 'node:fs/promises';
import process from 'node:process';

const budgetPath = new URL('../config/zapier-task-budget.json', import.meta.url);
const raw = await readFile(budgetPath, 'utf8');
const budget = JSON.parse(raw);

const fail = (message) => {
  console.error(`Zapier task budget verification failed: ${message}`);
  process.exitCode = 1;
};

const { plan, scope, allocations, analysis_output_contract: outputContract, guardrails } = budget;

if (!Number.isInteger(plan?.monthly_task_limit) || plan.monthly_task_limit <= 0) {
  fail('plan.monthly_task_limit must be a positive integer');
}

if (!Number.isInteger(plan?.operating_ceiling) || plan.operating_ceiling <= 0) {
  fail('plan.operating_ceiling must be a positive integer');
}

if (!Number.isInteger(plan?.emergency_reserve) || plan.emergency_reserve < 0) {
  fail('plan.emergency_reserve must be a non-negative integer');
}

if (plan.operating_ceiling + plan.emergency_reserve !== plan.monthly_task_limit) {
  fail('operating ceiling plus emergency reserve must equal the monthly task limit');
}

if (!Array.isArray(allocations) || allocations.length === 0) {
  fail('allocations must contain at least one budget lane');
}

let calculatedTotal = 0;
for (const allocation of allocations ?? []) {
  const { id, monthly_runs: runs, tasks_per_run: perRun, planned_tasks: planned } = allocation;

  if (!id || !Number.isInteger(runs) || runs < 0 || !Number.isInteger(perRun) || perRun < 0) {
    fail(`allocation ${id ?? '<unknown>'} has invalid run or task values`);
    continue;
  }

  const calculated = runs * perRun;
  if (calculated !== planned) {
    fail(`allocation ${id} declares ${planned} tasks but calculates to ${calculated}`);
  }

  calculatedTotal += calculated;
}

if (calculatedTotal !== scope?.planned_monthly_tasks) {
  fail(`scope planned total ${scope?.planned_monthly_tasks} does not match allocation total ${calculatedTotal}`);
}

if (calculatedTotal > plan.operating_ceiling) {
  fail(`planned total ${calculatedTotal} exceeds operating ceiling ${plan.operating_ceiling}`);
}

const calculatedHeadroom = plan.operating_ceiling - calculatedTotal;
if (calculatedHeadroom !== scope?.headroom_below_operating_ceiling) {
  fail(`declared headroom ${scope?.headroom_below_operating_ceiling} does not match calculated headroom ${calculatedHeadroom}`);
}

if (outputContract?.single_ai_action !== true) {
  fail('analysis output contract must use one shared AI action');
}

const requiredOutputFields = [
  'signal_id',
  'decision',
  'verified_evidence',
  'inferred_conclusions',
  'unknown_information',
  'recommended_next_action',
  'me_reality_now',
  'me_smallest_next_action',
  'me_founder_voice',
  'future_you_guidance',
  'future_you_what_mattered',
  'future_you_what_did_not',
  'future_you_valid_fear',
  'chief_ai_decision',
  'linkedin_draft',
  'facebook_draft',
  'instagram_draft',
  'investor_outreach_draft',
  'publish_allowed'
];

const outputFields = new Set(outputContract?.fields ?? []);
for (const field of requiredOutputFields) {
  if (!outputFields.has(field)) {
    fail(`analysis output contract is missing ${field}`);
  }
}

if (outputContract?.future_you?.time_horizon_years !== 5) {
  fail('FutureYou must reason from a five-year horizon');
}

if (outputContract?.future_you?.voice !== 'first_person_future_self') {
  fail('FutureYou must use first-person future-self voice');
}

if (!outputContract?.future_you?.required_opener) {
  fail('FutureYou must retain its required opener');
}

if (outputContract?.future_you?.generic_advice_allowed !== false) {
  fail('FutureYou must not allow generic advice');
}

if (outputContract?.me?.must_choose_one_smallest_next_action !== true) {
  fail('Me must choose one smallest next action');
}

const requiredGuardrails = [
  'one_ai_call_per_signal',
  'social_channels_generated_in_one_ai_response',
  'future_you_and_me_share_core_ai_action',
  'hubspot_result_note_is_canonical_writeback',
  'founder_control_room_reads_proof_without_a_second_zapier_write',
  'external_send_or_publish_requires_founder_approval',
  'budget_gate_runs_before_billable_actions',
  'stop_new_billable_work_at_operating_ceiling'
];

for (const key of requiredGuardrails) {
  if (guardrails?.[key] !== true) {
    fail(`required guardrail ${key} must be true`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `Zapier budget verified: ${calculatedTotal}/${plan.monthly_task_limit} planned tasks, ` +
    `${calculatedHeadroom} operating headroom, ${plan.emergency_reserve} emergency reserve, ` +
    'FutureYou and Me included in the shared AI action.'
);
