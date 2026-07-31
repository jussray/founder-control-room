import { readFile } from 'node:fs/promises';
import process from 'node:process';

const budgetPath = new URL('../config/zapier-task-budget.json', import.meta.url);
const raw = await readFile(budgetPath, 'utf8');
const budget = JSON.parse(raw);

const fail = (message) => {
  console.error(`Zapier task budget verification failed: ${message}`);
  process.exitCode = 1;
};

const {
  plan,
  scope,
  allocations,
  analysis_output_contract: outputContract,
  buffer_distribution: bufferDistribution,
  guardrails
} = budget;

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
  'social_campaign_angle',
  'social_campaign_media_brief',
  'linkedin_draft',
  'facebook_draft',
  'facebook_founder_draft',
  'facebook_brand_draft',
  'instagram_draft',
  'threads_draft',
  'x_draft',
  'tiktok_caption',
  'youtube_shorts_draft',
  'pinterest_draft',
  'bluesky_draft',
  'mastodon_draft',
  'google_business_draft',
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

if (bufferDistribution?.mode !== 'parallel_review_first') {
  fail('Buffer distribution must remain parallel and review-first');
}

if (!Number.isInteger(bufferDistribution?.parallel_channel_slots) || bufferDistribution.parallel_channel_slots < 2) {
  fail('Buffer distribution must reserve at least two parallel channel slots');
}

if (bufferDistribution?.selected_channels_must_be_unique !== true) {
  fail('Buffer distribution must require unique selected channels');
}

if (bufferDistribution?.one_billable_buffer_action_per_selected_channel !== true) {
  fail('Buffer distribution must account for one billable action per selected channel');
}

if (bufferDistribution?.platform_native_copy_required !== true) {
  fail('Buffer distribution must require platform-native copy');
}

const bufferAllocation = allocations.find(
  (allocation) => allocation.id === 'approved-buffer-parallel-campaigns'
);

if (!bufferAllocation) {
  fail('approved-buffer-parallel-campaigns allocation is required');
} else if (bufferAllocation.tasks_per_run !== bufferDistribution.parallel_channel_slots) {
  fail(
    'Buffer campaign tasks per run must equal the configured number of parallel channel slots'
  );
}

const requiredDraftPlatforms = [
  'linkedin',
  'facebook',
  'instagram',
  'threads',
  'x',
  'tiktok',
  'youtube_shorts',
  'pinterest',
  'bluesky',
  'mastodon',
  'google_business'
];

const draftPlatforms = new Set(bufferDistribution?.supported_draft_platforms ?? []);
for (const platform of requiredDraftPlatforms) {
  if (!draftPlatforms.has(platform)) {
    fail(`Buffer coverage contract is missing ${platform}`);
  }
}

const contentContract = bufferDistribution?.publish_content_contract;
if (contentContract?.source !== 'structured_ai_output_only') {
  fail('Buffer publish copy must come from structured AI output only');
}

if (contentContract?.validated_output_field !== 'validated_post_text') {
  fail('Buffer must map only validated_post_text into the publish action');
}

if (!Number.isInteger(contentContract?.minimum_characters) || contentContract.minimum_characters < 80) {
  fail('Buffer publish copy must require at least 80 characters');
}

if (contentContract?.require_https_proof_url !== true) {
  fail('Buffer publish copy must require an HTTPS proof URL');
}

if (contentContract?.require_exact_source_commit_sha !== true) {
  fail('Buffer publish copy must require an exact source commit SHA');
}

if (contentContract?.reject_prompt_like_copy !== true) {
  fail('Buffer publish copy must reject prompt-like copy');
}

if (contentContract?.reject_unresolved_template_tokens !== true) {
  fail('Buffer publish copy must reject unresolved template tokens');
}

if (contentContract?.queue_or_publish_requires_founder_approval !== true) {
  fail('Buffer queue or publish mode must require founder approval');
}

const requiredAllowedSourceFields = [
  'linkedin_draft',
  'facebook_founder_draft',
  'facebook_brand_draft',
  'instagram_draft'
];
const allowedSourceFields = new Set(contentContract?.allowed_source_fields ?? []);
for (const field of requiredAllowedSourceFields) {
  if (!allowedSourceFields.has(field)) {
    fail(`Buffer allowed source fields are missing ${field}`);
  }
}

const forbiddenSourceFields = new Set(contentContract?.forbidden_source_fields ?? []);
for (const field of ['prompt', 'system_prompt', 'user_message', 'instructions', 'raw_response']) {
  if (!forbiddenSourceFields.has(field)) {
    fail(`Buffer forbidden source fields are missing ${field}`);
  }
}

const requiredChannelRoutes = {
  juss_rayy_linkedin: 'linkedin_draft',
  juss_and_co_facebook: 'facebook_founder_draft',
  juss_beautiful_hair_facebook: 'facebook_brand_draft'
};
for (const [channel, field] of Object.entries(requiredChannelRoutes)) {
  if (contentContract?.channel_routes?.[channel] !== field) {
    fail(`Buffer route ${channel} must map to ${field}`);
  }
}

const requiredGuardrails = [
  'one_ai_call_per_signal',
  'social_channels_generated_in_one_ai_response',
  'future_you_and_me_share_core_ai_action',
  'buffer_parallel_distribution',
  'one_buffer_action_per_active_channel',
  'nonselected_social_channels_remain_review_drafts',
  'hubspot_result_note_is_canonical_writeback',
  'founder_control_room_reads_proof_without_a_second_zapier_write',
  'external_send_or_publish_requires_founder_approval',
  'budget_gate_runs_before_billable_actions',
  'stop_new_billable_work_at_operating_ceiling',
  'buffer_never_receives_prompt_or_instructions',
  'buffer_content_must_pass_firewall'
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
    `${bufferDistribution.parallel_channel_slots} Buffer channels per approved campaign, ` +
    'platform-ready copy is firewall-validated before Buffer.'
);
