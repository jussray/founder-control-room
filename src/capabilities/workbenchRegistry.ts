export interface Capability {
  id: string;
  kind: 'Automation' | 'Contract' | 'Prompt';
  category: 'automations' | 'contracts' | 'prompts' | 'integrations';
  score: number;
  summary: string;
  purpose: string;
  inputs: string[][];
  environment: string[];
  proof: string[];
  risk: string;
  implementation: string;
  runtime?: 'dynamic';
}

const risk = {
  hmac: 'Verification only. It performs no downstream action and stores no request body.',
  ledger: 'Uses the FCR operational database only. Product, customer, teen, vendor, and credential data are forbidden.',
  prompt: 'Advisory output only. A prompt cannot grant itself execution, merge, deploy, publish, or provider authority.',
};

export const capabilities = [
  {
    id: 'project-health-refresh-v1', kind: 'Automation', category: 'automations', score: 99, runtime: 'dynamic',
    summary: 'Refresh current repository identity, default-branch head, and provider verification signals.',
    purpose: 'Give the founder a current provider-backed repository health observation through FCR\'s durable reconciliation loop instead of relying on stale screen state.',
    inputs: [['projectSlug', 'string', 'Registered active FCR project slug']],
    environment: ['Registered active project', 'Repository provider connection available to FCR'],
    proof: ['Durable controller_outbox run ID', 'Provider observation persisted by ProjectController', 'Run reaches a terminal reconciliation state'],
    risk: 'Read-only provider reconciliation. It cannot merge, deploy, publish, change credentials, or mutate repository/provider configuration.',
    implementation: 'Runtime-backed: POST /capabilities/project-health-refresh-v1/runs with { projectSlug }, then poll GET /capabilities/runs/:runId.',
  },
  {
    id: 'webhook-verify-hmac-worker-v1', kind: 'Automation', category: 'automations', score: 98,
    summary: 'Verify raw webhook bytes with HMAC-SHA256 before parsing.',
    purpose: 'Reject forged or replayed provider events before they enter Founder Control Room.',
    inputs: [['rawBody', 'string', 'Exact request bytes'], ['signature', 'string', 'Provider signature header'], ['secret', 'secret ref', 'Worker-side secret'], ['timestamp', 'unix seconds', 'Replay-window witness']],
    environment: ['WEBHOOK_HMAC_SECRET', 'WEBHOOK_MAX_AGE_SECONDS=300'],
    proof: ['Authentic body accepted', 'Mutated body rejected', 'Stale timestamp rejected'],
    risk: risk.hmac,
    implementation: `export async function verifyHmac(rawBody, signature, secret) {\n  if (!signature) return false;\n  const key = await crypto.subtle.importKey(\n    'raw', new TextEncoder().encode(secret),\n    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']\n  );\n  const expected = new Uint8Array(await crypto.subtle.sign(\n    'HMAC', key, new TextEncoder().encode(rawBody)\n  ));\n  const received = signature.replace(/^sha256=/, '');\n  if (!/^[0-9a-f]+$/i.test(received) || received.length !== expected.length * 2) return false;\n  let mismatch = 0;\n  expected.forEach((byte, index) => {\n    mismatch |= byte ^ Number.parseInt(received.slice(index * 2, index * 2 + 2), 16);\n  });\n  return mismatch === 0;\n}`,
  },
  {
    id: 'event-dedupe-supabase-v1', kind: 'Automation', category: 'automations', score: 92,
    summary: 'Claim each provider event once in the FCR event ledger.',
    purpose: 'Stop duplicate deliveries from repeating CRM writes, jobs, or review tasks.',
    inputs: [['eventId', 'uuid', 'Stable provider event ID'], ['correlationId', 'uuid', 'Cross-step trace'], ['payload', 'json', 'Sanitized operational event']],
    environment: ['FCR Supabase service role (server only)'],
    proof: ['First claim returns claimed', 'Second claim returns duplicate', 'Browser roles have no table policy'],
    risk: risk.ledger,
    implementation: `create table automation_events (\n  id uuid primary key,\n  correlation_id uuid not null,\n  event_type text not null,\n  payload jsonb not null,\n  status text not null check (status in ('received','processing','completed','failed')),\n  received_at timestamptz not null default now()\n);\nalter table automation_events enable row level security;\nrevoke all on automation_events from anon, authenticated;`,
  },
  {
    id: 'event-envelope-contract-v1', kind: 'Contract', category: 'contracts', score: 90,
    summary: 'One typed event shape across Workers, n8n, HubSpot, GitHub, and Python.',
    purpose: 'Make every automation identify source, tenant, correlation, time, and payload before execution.',
    inputs: [['id', 'uuid', 'Idempotency identity'], ['type', 'string', 'Namespaced event type'], ['source', 'enum', 'Origin system'], ['correlationId', 'uuid', 'Cross-step trace']],
    environment: ['No environment variables'],
    proof: ['Valid fixture accepted', 'Unknown source rejected', 'Malformed UUID rejected'],
    risk: 'Validation proves shape, not truth or authority. Provider identity and founder approval remain separate gates.',
    implementation: `const EventEnvelope = z.object({\n  id: z.string().uuid(),\n  type: z.string().min(3),\n  source: z.enum(['github','hubspot','n8n','zapier','app','expo']),\n  occurredAt: z.string().datetime(),\n  correlationId: z.string().uuid(),\n  tenantId: z.string().uuid().optional(),\n  data: z.record(z.unknown()),\n}).strict();`,
  },
  {
    id: 'shared-capability-runtime-v1', kind: 'Contract', category: 'contracts', score: 96,
    summary: 'Route voice, text, mobile, desktop, automation, and future interaction surfaces through one FCR capability and authority runtime.',
    purpose: 'Keep every founder interaction modality on the same intent, live-authority, consequence, approval, execution-receipt, outcome-verification, and next-gate spine instead of creating surface-specific operating systems.',
    inputs: [
      ['surface', 'enum', 'voice | text | mobile | desktop | automation | future'],
      ['intent', 'text', 'Canonical founder outcome or bounded sub-intent'],
      ['capabilityId', 'string', 'Progressively disclosed bounded capability'],
      ['authorityRevision', 'string', 'Current authority/policy revision checked again before execution'],
      ['proposalId', 'string', 'Exact action proposal and approval-binding identity when mutation is possible'],
    ],
    environment: ['FCR remains the control plane', 'Provider credentials remain behind connector/tool boundaries', 'No surface grants itself authority'],
    proof: [
      'Capability discovery is treated as a hint, never execution authority',
      'Live authority is rechecked immediately before execution',
      'Approvals bind to the exact proposal instead of an unscoped yes/no utterance',
      'External mutations emit modality-independent execution receipts and idempotency evidence',
      'Provider acceptance and verified founder outcome remain separate truth states',
      'Completion claims require the common FCR evidence threshold',
    ],
    risk: 'Contract only. It does not expose provider credentials, enable a voice tool, widen V10 privileged authority, grant execution, or replace existing approval middleware. Any real tool/runtime integration must adopt this contract without weakening the current authority ceiling.',
    implementation: `type Surface = 'voice' | 'text' | 'mobile' | 'desktop' | 'automation' | 'future';\ntype Consequence = 'READ' | 'REVERSIBLE_WRITE' | 'CONSEQUENTIAL_WRITE';\ntype ActionState = 'PROPOSED' | 'WAITING_APPROVAL' | 'APPROVED' | 'PRE_COMMIT' | 'COMMITTING' | 'PROVIDER_ACCEPTED' | 'VERIFYING' | 'VERIFIED' | 'UNKNOWN' | 'CONTRADICTED' | 'DENIED' | 'CANCELLED' | 'FAILED';\n\ninterface CapabilityRequest {\n  surface: Surface;\n  intent: string;\n  capabilityId: string;\n  authorityRevision: string;\n  consequence: Consequence;\n  proposalId?: string;\n}\n\n// Discovery does not authorize. Recheck live authority at the commit boundary.\n// Bind approval to proposalId, preserve cancellation before commit, emit an\n// execution receipt, verify outcome when required, then permit completion claim.`,
  },
  {
    id: 'google-cloud-provider-v1', kind: 'Contract', category: 'integrations', score: 95,
    summary: 'Use Google Cloud and Google Workspace capabilities through one least-privilege FCR provider boundary.',
    purpose: 'Let FCR and the assistant use the same Google capability without replacing Supabase Google sign-in, storing provider secrets in Git, or turning a gcloud login into mutation authority.',
    inputs: [
      ['projectId', 'string', 'Exact Google Cloud project identity'],
      ['account', 'provider identity', 'Currently authorized Google account or workload identity'],
      ['declaredScopes', 'scope list', 'Exact least-privilege OAuth scopes for the requested capability'],
      ['intent', 'text', 'Bounded founder outcome'],
      ['proposalId', 'string', 'Required exact proposal identity when mutation is possible'],
    ],
    environment: [
      'Google Cloud CLI 584.0.0 when CLI execution is required',
      'Supabase remains the FCR Google login identity broker',
      'Google OAuth credentials remain outside the repository',
      'FCR shared capability runtime performs live authority checks',
    ],
    proof: [
      'Installed CLI version and checksum match the pinned toolchain contract',
      'Observed account, project, and scopes match the intended capability before execution',
      'Assistant and FCR use the same Google capability and authority boundary',
      'Mutations require exact proposal-bound founder approval plus a live authority recheck',
      'Provider acceptance is not called verified outcome without outcome evidence',
      'Continuity fingerprints and proof cookies update or invalidate bidirectionally without becoming authority',
    ],
    risk: 'Integration contract only. It does not create a Google project, configure OAuth consent, grant Workspace scopes, store credentials, spend money, change IAM, enable billing, delete resources, or authorize mutations. Sensitive/restricted scopes and high-impact operations remain blocked until separately reviewed and approved.',
    implementation: `provider=google-cloud; connectionType=other; label=Google Cloud;\ncli=584.0.0; oauth=least-privilege; credentials=external;\n// Observe current account/project/scopes first. Discovery is not authority.\n// For writes: bind approval to proposalId, recheck authority, execute, capture receipt, verify outcome, update continuity markers.`,
  },
  {
    id: 'external-application-submission-v1', kind: 'Contract', category: 'contracts', score: 97,
    summary: 'Bind external application submissions to an exact approved payload, exact uploaded artifacts, provider readiness, and a captured confirmation receipt.',
    purpose: 'Prevent FCR from losing approved form answers, silently reconstructing missing facts, discovering browser/payment/auth blockers only after work begins, or claiming submission without provider confirmation evidence.',
    inputs: [
      ['payloadSnapshotRef', 'evidence ref', 'Durable exact approved application payload snapshot'],
      ['payloadSha256', 'sha256', 'Hash of the exact approved payload'],
      ['approvalReceipt', 'receipt', 'Founder approval bound to payload hash and artifact hashes'],
      ['requiredFields', 'form schema', 'Live required-field map from the destination form'],
      ['uploads', 'artifact refs', 'Exact approved files plus hashes'],
      ['providerReadiness', 'preflight', 'Browser, authentication, and execution/budget readiness checked before form mutation'],
    ],
    environment: ['FCR remains the control plane', 'External browser/provider remains the execution surface', 'No missing field may be invented from adjacent documents or memory'],
    proof: [
      'Exact approved payload is durably referenced and hash-bound before form entry',
      'Every live required field validates before submit is permitted',
      'Every required upload hash matches the founder-approved artifact set',
      'Provider browser/auth/execution readiness is checked before form mutation begins',
      'Founder approval is rejected if payload or artifact hashes drift',
      'Completion requires provider confirmation evidence bound back to the same payload and artifacts',
    ],
    risk: 'Contract and validation only. It does not create provider credentials, fund a browser wallet, bypass login or CAPTCHA, invent missing application answers, or independently grant submission authority.',
    implementation: `validateExternalApplicationSubmission(bundle) -> { ready, blockers };\n// ready=false on missing required fields, missing payload snapshot, hash drift, missing uploads, or provider-readiness failure.\nvalidateExternalApplicationConfirmation(receipt, approvedBundle) -> { ready, blockers };\n// completion is allowed only when confirmation evidence binds to the same approved payload and artifacts.`,
  },
  {
    id: 'founder-reasoning-stack-v1', kind: 'Prompt', category: 'prompts', score: 89,
    summary: 'First principles → Socrates → 80/20 → FutureYou → truth-first delivery.',
    purpose: 'Turn a rough founder goal into one reversible decision with proof and rollback.',
    inputs: [['goal', 'text', 'Desired outcome'], ['reality', 'evidence', 'Verified current state'], ['constraints', 'list', 'Authority, time, privacy, cost']],
    environment: ['No credentials', 'Advisory authority only'],
    proof: ['Facts separated from assumptions', 'One selected move', 'Stop and rollback defined'],
    risk: risk.prompt,
    implementation: `Goal: [OUTCOME]\nReality: [VERIFIED / INFERRED / UNKNOWN / BLOCKED]\nReason from first principles and ask only questions that change the answer.\nApply 80/20 and FutureYou. Attack the premise, then the chosen plan.\nReturn: decision, proof, risk, rollback, and one next gate.\nDo not inflate claims or turn advice into authority.`,
  },
  ...[
    ['social-strategy-architect-v1', 'Build positioning, three content pillars, growth, conversion, KPIs, and a 90-day plan.'],
    ['content-pillar-builder-v1', 'Create five authority-building pillars with educational, entertaining, and inspirational executions.'],
    ['content-calendar-30-day-v1', 'Produce a balanced 30-day calendar with topic, hook, format, goal, and CTA.'],
    ['scroll-stopping-post-v1', 'Write one clear post with a strong hook, useful body, honest close, and one CTA.'],
    ['short-form-video-60s-v1', 'Create a 60-second Dialogue and Visuals/B-roll script with retention beats.'],
    ['community-growth-system-v1', 'Build sustainable engagement habits, conversations, challenges, and advocate loops.'],
    ['social-performance-analyzer-v1', 'Diagnose post performance from supplied metrics and recommend evidence-backed changes.'],
  ].map(([id, summary], index) => ({
    id, kind: 'Prompt', category: 'prompts', score: 82 - index,
    summary, purpose: 'Create a review-ready social asset without publishing or inventing performance.',
    inputs: [['business', 'text', 'Name and focus'], ['audience', 'text', 'Specific intended reader'], ['goal', 'text', 'One measurable outcome']],
    environment: ['No provider credentials', 'Draft/review only'], proof: ['Required inputs named', 'One clear output shape', 'Claims require evidence'], risk: risk.prompt,
    implementation: `${summary}\nContext: [BUSINESS] [AUDIENCE] [GOAL]\nConstraints: use specific evidence, avoid generic advice, protect private implementation.\nOutput: review-ready draft plus assumptions and one next action.`,
  })),
  {
    id: 'conversation-command-contracts-v1', kind: 'Contract', category: 'contracts', score: 78,
    summary: 'Typed intent contracts for compact, btw, loop, goal, resume, plan, and effort.',
    purpose: 'Keep commands explicit so monitoring, context, and execution authority cannot blur together.',
    inputs: [['command', 'enum', 'compact | btw | loop | goal | resume | plan | effort'], ['scope', 'text', 'Bounded subject'], ['authority', 'enum', 'read | propose | execute']],
    environment: ['Scheduler required only for loop', 'No implicit execution'],
    proof: ['Loop requires cadence', 'Goal requires stop condition', 'Execute requires explicit authority'],
    risk: 'A command is intent, not a permission receipt. Monitoring must be read-only unless separately approved.',
    implementation: `const CommandIntent = z.discriminatedUnion('command', [\n  z.object({ command: z.literal('loop'), cadence: z.string(), check: z.string(), authority: z.literal('read') }),\n  z.object({ command: z.literal('goal'), stopCondition: z.string(), authority: z.enum(['read','propose','execute']) }),\n  z.object({ command: z.enum(['compact','btw','resume','plan','effort']), scope: z.string() }),\n]);`,
  },
];