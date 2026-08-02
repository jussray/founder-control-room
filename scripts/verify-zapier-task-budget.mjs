import { readFile } from 'node:fs/promises';
import process from 'node:process';

const budgetPath = new URL('../config/zapier-task-budget.json', import.meta.url);
const budget = JSON.parse(await readFile(budgetPath, 'utf8'));
const failures = [];
const fail = (message) => failures.push(message);
const requireTrue = (value, message) => {
  if (value !== true) fail(message);
};
const requireFalse = (value, message) => {
  if (value !== false) fail(message);
};

const {
  version,
  plan,
  scope,
  allocations,
  analysis_output_contract: outputContract,
  buffer_distribution: bufferDistribution,
  non_billable_primitives_assumed_when_available: assumedPrimitives,
  capability_truth: capabilityTruth,
  guardrails,
} = budget;

if (version !== 5) fail('budget version must be 5 for capability-truth review-window planning');
if (plan?.name !== 'Conservative 100-task planning envelope') {
  fail('plan name must describe a planning envelope rather than claim a live Zapier tier');
}
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
requireFalse(plan?.live_plan_verified, 'repository budget must not claim the live Zapier plan is verified');
requireFalse(plan?.free_two_step_plan_sufficient, 'a free two-step Zap must not be treated as sufficient');
requireTrue(plan?.multi_step_or_backend_orchestration_required, 'multi-step Zap or backend orchestration must be required');
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

requireTrue(outputContract?.single_ai_action, 'analysis output contract must use one shared AI action');
const requiredOutputFields = [
  'signal_id', 'decision', 'verified_evidence', 'inferred_conclusions',
  'unknown_information', 'recommended_next_action', 'me_reality_now',
  'me_smallest_next_action', 'me_founder_voice', 'future_you_guidance',
  'future_you_what_mattered', 'future_you_what_did_not', 'future_you_valid_fear',
  'chief_ai_decision', 'social_campaign_angle', 'social_campaign_media_brief',
  'linkedin_draft', 'facebook_draft', 'facebook_founder_draft',
  'facebook_brand_draft', 'instagram_draft', 'threads_draft', 'x_draft',
  'tiktok_caption', 'youtube_shorts_draft', 'pinterest_draft', 'bluesky_draft',
  'mastodon_draft', 'google_business_draft', 'investor_outreach_draft',
  'publish_allowed',
];
const outputFields = new Set(outputContract?.fields ?? []);
for (const field of requiredOutputFields) {
  if (!outputFields.has(field)) fail(`analysis output contract is missing ${field}`);
}
if (outputContract?.future_you?.time_horizon_years !== 5) fail('FutureYou must reason from a five-year horizon');
if (outputContract?.future_you?.voice !== 'first_person_future_self') fail('FutureYou must use first-person future-self voice');
if (!outputContract?.future_you?.required_opener) fail('FutureYou must retain its required opener');
if (outputContract?.future_you?.generic_advice_allowed !== false) fail('FutureYou must not allow generic advice');
requireTrue(outputContract?.me?.must_choose_one_smallest_next_action, 'Me must choose one smallest next action');

if (bufferDistribution?.mode !== 'parallel_schedule_review_window') {
  fail('Buffer distribution must use the parallel 20-minute schedule review window');
}
if (!Number.isInteger(bufferDistribution?.parallel_channel_slots) || bufferDistribution.parallel_channel_slots < 2) {
  fail('Buffer distribution must reserve at least two parallel channel slots');
}
requireTrue(bufferDistribution?.selected_channels_must_be_unique, 'Buffer distribution must require unique selected channels');
requireTrue(bufferDistribution?.one_billable_buffer_action_per_selected_channel, 'Buffer distribution must account for one Buffer action per selected channel');
requireTrue(bufferDistribution?.one_billable_gmail_digest_per_campaign, 'Buffer distribution must account for one Gmail digest per campaign');
requireTrue(bufferDistribution?.platform_native_copy_required, 'Buffer distribution must require platform-native copy');

const campaignAllocation = allocations.find((allocation) => allocation.id === 'approved-buffer-parallel-campaigns');
if (!campaignAllocation) {
  fail('approved-buffer-parallel-campaigns allocation is required');
} else {
  const expectedTasksPerRun = bufferDistribution.parallel_channel_slots + 1;
  if (campaignAllocation.tasks_per_run !== expectedTasksPerRun) {
    fail(`campaign tasks per run must equal ${expectedTasksPerRun}: one per Buffer channel plus one Gmail digest`);
  }
  if (campaignAllocation.topology_requirement !== 'multi_step_zap_or_backend_orchestration') {
    fail('campaign allocation must declare its multi-step or backend topology requirement');
  }
}

const reviewWindow = bufferDistribution?.review_window;
if (reviewWindow?.minutes !== 20) fail('review window must be exactly 20 minutes');
if (reviewWindow?.starts_from !== 'generated_at') fail('review window must start from generated_at');
if (reviewWindow?.notification_provider !== 'gmail') fail('review notification provider must be Gmail');
if (reviewWindow?.notification_mode !== 'one_campaign_digest_for_up_to_three_posts') {
  fail('review notification must be one campaign digest for up to three posts');
}
if (reviewWindow?.notification_failure_policy !== 'cancel_scheduled_batch') {
  fail('Gmail notification failure must cancel the scheduled batch');
}
if (reviewWindow?.no_reply_behavior !== 'publish_by_existing_buffer_schedule') {
  fail('no reply must preserve the existing Buffer schedule');
}
if (reviewWindow?.edit_policy !== 'regenerate_and_revalidate_before_buffer_update') {
  fail('edit requests must regenerate and revalidate before Buffer update');
}
if (reviewWindow?.share_now_allowed !== false) fail('share_now must remain disabled');
requireTrue(reviewWindow?.instant_private_reply_ingress_required, 'review window must require instant private reply ingress');
requireFalse(reviewWindow?.gmail_polling_allowed_for_deadline_commands, 'Gmail polling must not control deadline commands');
if (reviewWindow?.preferred_reply_ingress !== 'cloudflare_email_routing_worker') {
  fail('preferred reply ingress must be the Cloudflare Email Routing Worker path');
}
requireFalse(reviewWindow?.reply_ingress_live_proof_complete, 'repository config must not claim live reply-ingress proof');

const contentContract = bufferDistribution?.publish_content_contract;
if (contentContract?.source !== 'structured_ai_output_only') fail('Buffer copy must come from structured AI output only');
if (contentContract?.validated_output_field !== 'validated_post_text') fail('Buffer must map only validated_post_text');
if (!Number.isInteger(contentContract?.minimum_characters) || contentContract.minimum_characters < 80) {
  fail('Buffer copy must require at least 80 characters');
}
requireTrue(contentContract?.require_https_proof_url, 'Buffer copy must require an HTTPS proof URL');
requireTrue(contentContract?.require_exact_source_commit_sha, 'Buffer copy must require an exact source commit SHA');
requireTrue(contentContract?.reject_prompt_like_copy, 'Buffer copy must reject prompt-like copy');
requireTrue(contentContract?.reject_unresolved_template_tokens, 'Buffer copy must reject unresolved template tokens');
requireTrue(contentContract?.schedule_mode_requires_standing_authority, 'Buffer scheduling must require standing authority');
if (contentContract?.review_window_minutes !== 20) fail('content contract review window must be 20 minutes');
if (contentContract?.notification_mode !== 'gmail_campaign_digest') fail('content contract must require Gmail campaign digest');
if (contentContract?.notification_failure_policy !== 'cancel_scheduled_batch') fail('content contract must cancel on notification failure');
if (contentContract?.share_now_allowed !== false) fail('content contract must reject share_now');
if (contentContract?.buffer_api_sharing_mode !== 'customScheduled') fail('Buffer API sharing mode must be customScheduled');
if (contentContract?.buffer_api_due_at_source !== 'scheduled_at') fail('Buffer API dueAt must derive from scheduled_at');

const requiredDraftPlatforms = [
  'linkedin', 'facebook', 'instagram', 'threads', 'x', 'tiktok',
  'youtube_shorts', 'pinterest', 'bluesky', 'mastodon', 'google_business',
];
const draftPlatforms = new Set(bufferDistribution?.supported_draft_platforms ?? []);
for (const platform of requiredDraftPlatforms) {
  if (!draftPlatforms.has(platform)) fail(`Buffer coverage contract is missing ${platform}`);
}

const requiredAllowedSourceFields = [
  'linkedin_draft', 'facebook_founder_draft', 'facebook_brand_draft', 'instagram_draft',
];
const allowedSourceFields = new Set(contentContract?.allowed_source_fields ?? []);
for (const field of requiredAllowedSourceFields) {
  if (!allowedSourceFields.has(field)) fail(`Buffer allowed source fields are missing ${field}`);
}
const forbiddenSourceFields = new Set(contentContract?.forbidden_source_fields ?? []);
for (const field of ['prompt', 'system_prompt', 'user_message', 'instructions', 'raw_response']) {
  if (!forbiddenSourceFields.has(field)) fail(`Buffer forbidden source fields are missing ${field}`);
}
const requiredChannelRoutes = {
  juss_rayy_linkedin: 'linkedin_draft',
  juss_and_co_facebook: 'facebook_founder_draft',
  juss_beautiful_hair_facebook: 'facebook_brand_draft',
};
for (const [channel, field] of Object.entries(requiredChannelRoutes)) {
  if (contentContract?.channel_routes?.[channel] !== field) fail(`Buffer route ${channel} must map to ${field}`);
}

if (!Array.isArray(assumedPrimitives) || assumedPrimitives.length === 0) {
  fail('non-billable primitives must be listed only as assumptions when available');
}
for (const unsupportedClaim of ['sub-zaps', 'forms', 'zapier-manager']) {
  if (assumedPrimitives?.includes(unsupportedClaim)) {
    fail(`${unsupportedClaim} must not be represented as a guaranteed non-billable primitive`);
  }
}

requireTrue(capabilityTruth?.webhook_trigger_required, 'webhook trigger capability must be required');
requireTrue(capabilityTruth?.multi_step_workflow_or_backend_orchestration_required, 'multi-step or backend orchestration must be required');
requireTrue(capabilityTruth?.instant_private_reply_ingress_required, 'instant private reply ingress must be required');
requireFalse(capabilityTruth?.gmail_polling_sufficient_for_twenty_minute_window, 'Gmail polling must not be treated as sufficient');
requireTrue(capabilityTruth?.repository_budget_is_not_live_plan_proof, 'repository budget must not be live-plan proof');
requireTrue(capabilityTruth?.activation_stops_until_capabilities_are_verified, 'activation must stop until capabilities are verified');

const requiredGuardrails = [
  'one_ai_call_per_signal', 'social_channels_generated_in_one_ai_response',
  'future_you_and_me_share_core_ai_action', 'buffer_parallel_distribution',
  'one_buffer_action_per_active_channel', 'one_gmail_review_digest_per_campaign',
  'gmail_notification_failure_cancels_batch', 'gmail_polling_never_controls_deadline_commands',
  'instant_private_reply_ingress_required', 'nonselected_social_channels_remain_review_drafts',
  'hubspot_result_note_is_canonical_writeback',
  'founder_control_room_reads_proof_without_a_second_zapier_write',
  'external_send_or_publish_requires_founder_approval', 'budget_gate_runs_before_billable_actions',
  'stop_new_billable_work_at_operating_ceiling', 'buffer_never_receives_prompt_or_instructions',
  'buffer_content_must_pass_firewall', 'share_now_requires_named_run_authority',
];
for (const key of requiredGuardrails) {
  requireTrue(guardrails?.[key], `required guardrail ${key} must be true`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Zapier task budget verification failed: ${failure}`);
  process.exit(1);
}

console.log(
  `Founder Signal planning envelope verified: ${calculatedTotal}/${plan.monthly_task_limit} planned tasks, ` +
  `${calculatedHeadroom} operating headroom, ${plan.emergency_reserve} emergency reserve, ` +
  `${bufferDistribution.parallel_channel_slots} Buffer schedules plus one Gmail digest per campaign; ` +
  'live plan capability and instant reply ingress remain explicit activation gates.',
);
