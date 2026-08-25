import { requestHash } from './safety.js';
import { hubForMcpProject } from './vaultHub.js';
import { supabase } from '../lib/supabaseClient.js';
import {
  routeFcrSkills,
  type FcrSkillRouterAction,
} from '../lib/fcrSkillRouter.js';
import type { V10CapabilityPlan } from '../founder-os-lab/capabilityKernel.js';

export const EXTERNAL_MCP_TOOL_NAMES = [
  'chief_audit_repository',
  'chief_list_capabilities',
  'chief_preview_capability_plan',
  'fcr_list_projects',
  'fcr_get_current_truth',
  'fcr_preview_skill_route',
] as const;

export type ExternalMcpToolName = (typeof EXTERNAL_MCP_TOOL_NAMES)[number];

export interface ExternalMcpIdentity {
  userId: string;
  email: string;
  clientId: string;
  authMode: 'oauth' | 'static';
}

export interface ExternalMcpReceipt {
  contract: 'founder-control-room/external-mcp-receipt@v1';
  id: string;
  projectSlug: string;
  toolName: ExternalMcpToolName;
  requestHash: string;
  resultHash: string;
  createdAt: string;
  privacy: {
    cookiesUsed: false;
    fingerprintsUsed: false;
    rawArgumentsStored: false;
    rawResultStored: false;
  };
}

export interface RecordExternalMcpEvidenceInput {
  identity: ExternalMcpIdentity;
  requestId: string;
  projectSlug: string;
  toolName: ExternalMcpToolName;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

export interface ExternalMcpToolDependencies {
  env?: NodeJS.ProcessEnv;
  invokeReadTool?: (input: {
    serverId: string;
    projectId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }) => Promise<unknown>;
  listProjects?: (allowedProjects: ReadonlySet<string>) => Promise<unknown>;
  listCapabilities?: (projectSlug: string) => Promise<unknown>;
  getCurrentTruth?: (projectSlug: string) => Promise<unknown>;
  previewCapabilityPlan?: (proposal: Record<string, unknown>) => Promise<unknown>;
  previewSkillRoute?: (input: {
    goal: string;
    action: FcrSkillRouterAction;
    projectSlug: string;
    expectedHeadSha: string;
    expectedRegistryHash: string;
    capabilityPlan: V10CapabilityPlan;
    provider: string;
  }) => Promise<unknown> | unknown;
  recordEvidence?: (input: RecordExternalMcpEvidenceInput) => Promise<ExternalMcpReceipt>;
}

type JsonRecord = Record<string, unknown>;

const TOOL_SET = new Set<string>(EXTERNAL_MCP_TOOL_NAMES);
const READ_ONLY_ROUTE_ACTIONS = new Set<FcrSkillRouterAction>([
  'inspect',
  'plan',
  'review',
  'draft',
]);
const FULL_SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1-${maxLength} characters`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength = 200): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, field, maxLength);
}

function noUnexpectedKeys(value: JsonRecord, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key)).sort();
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unexpected fields: ${unexpected.join(', ')}`);
  }
}

function projectSlug(value: unknown): string {
  const slug = text(value, 'projectId', 120);
  if (!PROJECT_SLUG.test(slug)) throw new Error('projectId is not a valid project slug');
  return slug;
}

function allowedProject(slug: string, allowedProjects: ReadonlySet<string>): string {
  if (!allowedProjects.has(slug)) {
    throw new Error('Requested project is outside this remote MCP grant');
  }
  return slug;
}

async function defaultInvokeReadTool(input: {
  serverId: string;
  projectId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  const hub = await hubForMcpProject(input.serverId, input.projectId);
  const result = await hub.invoke(input);
  if (result.policy.decision !== 'allow' || result.policy.risk !== 'read') {
    throw new Error('Remote read MCP refused a non-read policy result.');
  }
  return result;
}

async function projectRow(slug: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id,slug,name,repo_provider,repo_identifier,status,risk_level,updated_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`project_lookup_failed:${error.message}`);
  if (!data) throw new Error(`Project is not registered: ${slug}`);
  return data as {
    id: string;
    slug: string;
    name: string;
    repo_provider: string;
    repo_identifier: string | null;
    status: string;
    risk_level: string;
    updated_at: string;
  };
}

async function defaultListProjects(allowedProjects: ReadonlySet<string>) {
  const slugs = [...allowedProjects].sort();
  if (slugs.length === 0) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('slug,name,repo_provider,repo_identifier,status,risk_level,updated_at')
    .in('slug', slugs)
    .order('slug', { ascending: true });
  if (error) throw new Error(`project_list_failed:${error.message}`);
  return (data ?? []).map((project) => ({
    slug: project.slug,
    name: project.name,
    repositoryProvider: project.repo_provider,
    repositoryIdentifier: project.repo_identifier,
    status: project.status,
    riskLevel: project.risk_level,
    updatedAt: project.updated_at,
  }));
}

async function capabilityEvidence(slug: string) {
  const project = await projectRow(slug);
  const { data, error } = await supabase
    .from('repository_capability_evidence')
    .select('capability_id,claimed_status,observed_status,evidence_paths,missing_evidence_paths,required_signal_ids,failed_signal_ids,reason,commit_sha,last_verified_at,updated_at,usage_assertion_ids,failed_usage_assertion_ids')
    .eq('project_id', project.id)
    .order('capability_id', { ascending: true });
  if (error) throw new Error(`capability_evidence_failed:${error.message}`);
  return {
    project,
    capabilities: (data ?? []).map((capability) => ({
      id: capability.capability_id,
      claimedStatus: capability.claimed_status,
      observedStatus: capability.observed_status,
      sourceCommitSha: capability.commit_sha,
      evidencePaths: capability.evidence_paths ?? [],
      missingEvidencePaths: capability.missing_evidence_paths ?? [],
      requiredSignalIds: capability.required_signal_ids ?? [],
      failedSignalIds: capability.failed_signal_ids ?? [],
      usageAssertionIds: capability.usage_assertion_ids ?? [],
      failedUsageAssertionIds: capability.failed_usage_assertion_ids ?? [],
      reason: capability.reason,
      lastVerifiedAt: capability.last_verified_at,
      updatedAt: capability.updated_at,
      authority: 'observation_only',
    })),
  };
}

async function defaultListCapabilities(slug: string) {
  const evidence = await capabilityEvidence(slug);
  return {
    project: evidence.project.slug,
    repository: evidence.project.repo_identifier,
    source: 'repository_capability_evidence',
    trustedRegistrySnapshot: false,
    executionAuthority: false,
    capabilities: evidence.capabilities,
  };
}

async function defaultGetCurrentTruth(slug: string) {
  const evidence = await capabilityEvidence(slug);
  const project = evidence.project;
  const [runs, findings, manifest] = await Promise.all([
    supabase
      .from('repository_verification_runs')
      .select('id,source,repository_provider,repository_identifier,branch,commit_sha,manifest_hash,overall_status,signature_verified,scanned_at,received_at')
      .eq('project_id', project.id)
      .order('received_at', { ascending: false })
      .limit(1),
    supabase
      .from('repository_findings')
      .select('fingerprint,category,severity,status,title,suggested_action,first_seen_at,last_seen_at,resolved_at')
      .eq('project_id', project.id)
      .order('last_seen_at', { ascending: false }),
    supabase
      .from('project_manifests')
      .select('repository_provider,repository_identifier,path,commit_sha,content_hash,schema_version,validation_status,validation_errors,default_branch,observed_at')
      .eq('project_id', project.id)
      .is('superseded_at', null)
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError = runs.error ?? findings.error ?? manifest.error;
  if (firstError) throw new Error(`current_truth_failed:${firstError.message}`);
  const latestRun = runs.data?.[0] ?? null;
  const openFindings = (findings.data ?? []).filter((finding) => finding.status === 'open');

  return {
    project: {
      slug: project.slug,
      name: project.name,
      repositoryProvider: project.repo_provider,
      repositoryIdentifier: project.repo_identifier,
      status: project.status,
      riskLevel: project.risk_level,
      updatedAt: project.updated_at,
    },
    exactTarget: latestRun ? {
      branch: latestRun.branch,
      commitSha: latestRun.commit_sha,
      repository: latestRun.repository_identifier,
    } : null,
    latestVerification: latestRun ? {
      id: latestRun.id,
      source: latestRun.source,
      overallStatus: latestRun.overall_status,
      manifestHash: latestRun.manifest_hash,
      signatureVerified: latestRun.signature_verified,
      scannedAt: latestRun.scanned_at,
      receivedAt: latestRun.received_at,
    } : null,
    manifest: manifest.data ? {
      path: manifest.data.path,
      commitSha: manifest.data.commit_sha,
      contentHash: manifest.data.content_hash,
      schemaVersion: manifest.data.schema_version,
      validationStatus: manifest.data.validation_status,
      validationErrors: manifest.data.validation_errors ?? [],
      defaultBranch: manifest.data.default_branch,
      observedAt: manifest.data.observed_at,
    } : null,
    capabilities: evidence.capabilities,
    findings: openFindings.map((finding) => ({
      fingerprint: finding.fingerprint,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      suggestedAction: finding.suggested_action,
      firstSeenAt: finding.first_seen_at,
      lastSeenAt: finding.last_seen_at,
    })),
    truthBoundary: {
      repositoryEvidenceOnly: true,
      liveRuntimeVerified: false,
      executionAuthority: false,
    },
  };
}

function chiefBaseUrl(env: NodeJS.ProcessEnv): URL {
  const configured = env.CHIEF_AI_BASE_URL?.trim();
  if (!configured) throw new Error('CHIEF_AI_BASE_URL is not configured');
  const url = new URL(configured);
  if (url.protocol !== 'https:') throw new Error('CHIEF_AI_BASE_URL must use https');
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url;
}

async function defaultPreviewCapabilityPlan(
  proposal: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
) {
  const baseUrl = chiefBaseUrl(env);
  const endpoint = new URL('/api/chief/capability-plan', baseUrl);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(proposal),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : `Chief capability-plan preview failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function defaultPreviewSkillRoute(input: {
  goal: string;
  action: FcrSkillRouterAction;
  projectSlug: string;
  expectedHeadSha: string;
  expectedRegistryHash: string;
  capabilityPlan: V10CapabilityPlan;
  provider: string;
}) {
  return routeFcrSkills({
    goal: input.goal,
    action: input.action,
    projectSlug: input.projectSlug,
    expectedHeadSha: input.expectedHeadSha,
    expectedRegistryHash: input.expectedRegistryHash,
    capabilityPlan: input.capabilityPlan,
    repository: { projectId: input.projectSlug, provider: input.provider },
  });
}

async function defaultRecordEvidence(
  input: RecordExternalMcpEvidenceInput,
): Promise<ExternalMcpReceipt> {
  const project = await projectRow(input.projectSlug);
  const inputDigest = requestHash(input.arguments);
  const resultDigest = requestHash(input.result);
  const { data, error } = await supabase
    .from('mcp_tool_calls')
    .insert({
      project_id: project.id,
      server_id: 'founder-control-room-external',
      tool_name: input.toolName,
      risk: 'read',
      policy_decision: 'allow',
      status: 'passed',
      request_hash: inputDigest,
      request_summary: {
        contract: 'founder-control-room/external-mcp-receipt@v1',
        requestId: input.requestId,
        projectSlug: input.projectSlug,
        argumentKeys: Object.keys(input.arguments).sort(),
        actorHash: requestHash(input.identity.userId),
        clientHash: requestHash(input.identity.clientId),
        authMode: input.identity.authMode,
        cookiesUsed: false,
        fingerprintsUsed: false,
      },
      response_summary: {
        resultHash: resultDigest,
        rawResultStored: false,
      },
      duration_ms: input.durationMs,
      estimated_cost_usd: 0,
    })
    .select('id,created_at')
    .single();

  if (error || !data) {
    throw new Error(`evidence_persistence_unavailable:${error?.message ?? 'missing receipt row'}`);
  }

  return {
    contract: 'founder-control-room/external-mcp-receipt@v1',
    id: data.id,
    projectSlug: input.projectSlug,
    toolName: input.toolName,
    requestHash: inputDigest,
    resultHash: resultDigest,
    createdAt: data.created_at,
    privacy: {
      cookiesUsed: false,
      fingerprintsUsed: false,
      rawArgumentsStored: false,
      rawResultStored: false,
    },
  };
}

export function externalMcpToolDefinitions(): JsonRecord[] {
  const readAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  return [
    {
      name: 'chief_audit_repository',
      title: 'Audit repository evidence with Chief',
      description:
        'Read public GitHub repository evidence through Chief ProofMode and return claim/implementation/test/deployment/verification layers plus redacted proof receipts. Never mutates a repository.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['owner', 'repo'],
        properties: {
          owner: { type: 'string', minLength: 1, maxLength: 120 },
          repo: { type: 'string', minLength: 1, maxLength: 120 },
          ref: { type: 'string', minLength: 1, maxLength: 200 },
          acknowledges: {
            type: 'array',
            maxItems: 50,
            uniqueItems: true,
            items: { type: 'string', format: 'uuid' },
          },
        },
      },
      annotations: { ...readAnnotations, openWorldHint: true },
    },
    {
      name: 'chief_list_capabilities',
      title: 'List observed Chief capabilities',
      description:
        'List sanitized capability metadata observed for chief-ai-machine. This is repository evidence, not a trusted registry snapshot and not execution authority.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: readAnnotations,
    },
    {
      name: 'chief_preview_capability_plan',
      title: 'Preview a Chief capability plan',
      description:
        'Ask Chief to compose a proposal-only capability plan from a supplied goal plan and registry snapshot. The result cannot execute, approve, merge, deploy, migrate, send, or delete anything.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['proposal'],
        properties: {
          proposal: { type: 'object', additionalProperties: true },
        },
      },
      annotations: readAnnotations,
    },
    {
      name: 'fcr_list_projects',
      title: 'List granted Founder Control Room projects',
      description:
        'List only sanitized project registry rows included in the server-held OAuth/static grant. Secret refs, provider credentials, private content, and cross-project rows are excluded.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: readAnnotations,
    },
    {
      name: 'fcr_get_current_truth',
      title: 'Get current project truth',
      description:
        'Read the latest exact-head repository verification, manifest status, capability evidence, and open findings for one granted project. Repository evidence is never promoted into live runtime proof.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['projectId'],
        properties: {
          projectId: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      annotations: readAnnotations,
    },
    {
      name: 'fcr_preview_skill_route',
      title: 'Preview a fail-closed skill route',
      description:
        'Validate a Chief capability plan against FCR project, exact-head, registry-hash, provider, parallel-lens, and proof requirements. Only inspect/plan/review/draft actions are accepted and executionAllowed is always false.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'projectId',
          'goal',
          'action',
          'expectedHeadSha',
          'expectedRegistryHash',
          'capabilityPlan',
        ],
        properties: {
          projectId: { type: 'string', minLength: 1, maxLength: 120 },
          goal: { type: 'string', minLength: 1, maxLength: 2000 },
          action: { type: 'string', enum: [...READ_ONLY_ROUTE_ACTIONS] },
          expectedHeadSha: { type: 'string', pattern: '^[0-9a-fA-F]{40}$' },
          expectedRegistryHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
          capabilityPlan: { type: 'object', additionalProperties: true },
          provider: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      annotations: readAnnotations,
    },
  ];
}

export function isExternalMcpToolName(value: unknown): value is ExternalMcpToolName {
  return typeof value === 'string' && TOOL_SET.has(value);
}

export function createExternalMcpToolExecutor(
  overrides: ExternalMcpToolDependencies = {},
): (input: {
  name: ExternalMcpToolName;
  arguments: JsonRecord;
  allowedProjects: ReadonlySet<string>;
  identity: ExternalMcpIdentity;
  requestId: string;
}) => Promise<JsonRecord> {
  const env = overrides.env ?? process.env;
  const invokeReadTool = overrides.invokeReadTool ?? defaultInvokeReadTool;
  const listProjects = overrides.listProjects ?? defaultListProjects;
  const listCapabilities = overrides.listCapabilities ?? defaultListCapabilities;
  const getCurrentTruth = overrides.getCurrentTruth ?? defaultGetCurrentTruth;
  const previewCapabilityPlan = overrides.previewCapabilityPlan
    ?? ((proposal: Record<string, unknown>) => defaultPreviewCapabilityPlan(proposal, env));
  const previewSkillRoute = overrides.previewSkillRoute ?? defaultPreviewSkillRoute;
  const recordEvidence = overrides.recordEvidence ?? defaultRecordEvidence;

  return async (input) => {
    const startedAt = Date.now();
    let result: unknown;
    let receiptProject = 'founder-control-room';

    if (input.name === 'chief_audit_repository') {
      allowedProject('chief-ai-machine', input.allowedProjects);
      noUnexpectedKeys(input.arguments, ['owner', 'repo', 'ref', 'acknowledges'], input.name);
      const owner = text(input.arguments.owner, 'owner', 120);
      const repo = text(input.arguments.repo, 'repo', 120);
      const ref = optionalText(input.arguments.ref, 'ref', 200);
      const acknowledges = input.arguments.acknowledges;
      if (acknowledges !== undefined && (
        !Array.isArray(acknowledges)
        || acknowledges.length > 50
        || !acknowledges.every((value) => typeof value === 'string')
      )) {
        throw new Error('acknowledges must be an array of at most 50 receipt IDs');
      }
      receiptProject = 'chief-ai-machine';
      result = await invokeReadTool({
        serverId: 'proofmode',
        projectId: 'chief-ai-machine',
        toolName: 'audit_repository',
        arguments: {
          owner,
          repo,
          ...(ref ? { ref } : {}),
          ...(acknowledges ? { acknowledges } : {}),
        },
      });
    } else if (input.name === 'chief_list_capabilities') {
      allowedProject('chief-ai-machine', input.allowedProjects);
      noUnexpectedKeys(input.arguments, [], input.name);
      receiptProject = 'chief-ai-machine';
      result = await listCapabilities('chief-ai-machine');
    } else if (input.name === 'chief_preview_capability_plan') {
      allowedProject('chief-ai-machine', input.allowedProjects);
      noUnexpectedKeys(input.arguments, ['proposal'], input.name);
      if (!isRecord(input.arguments.proposal)) throw new Error('proposal must be an object');
      const goalPlan = input.arguments.proposal.goalPlan;
      if (!isRecord(goalPlan) || goalPlan.project !== 'chief-ai-machine') {
        throw new Error('proposal.goalPlan.project must be chief-ai-machine');
      }
      receiptProject = 'chief-ai-machine';
      result = await previewCapabilityPlan(input.arguments.proposal);
    } else if (input.name === 'fcr_list_projects') {
      allowedProject('founder-control-room', input.allowedProjects);
      noUnexpectedKeys(input.arguments, [], input.name);
      result = await listProjects(input.allowedProjects);
    } else if (input.name === 'fcr_get_current_truth') {
      noUnexpectedKeys(input.arguments, ['projectId'], input.name);
      receiptProject = allowedProject(projectSlug(input.arguments.projectId), input.allowedProjects);
      result = await getCurrentTruth(receiptProject);
    } else {
      noUnexpectedKeys(
        input.arguments,
        [
          'projectId',
          'goal',
          'action',
          'expectedHeadSha',
          'expectedRegistryHash',
          'capabilityPlan',
          'provider',
        ],
        input.name,
      );
      receiptProject = allowedProject(projectSlug(input.arguments.projectId), input.allowedProjects);
      const action = text(input.arguments.action, 'action', 40) as FcrSkillRouterAction;
      if (!READ_ONLY_ROUTE_ACTIONS.has(action)) {
        throw new Error('fcr_preview_skill_route accepts only inspect, plan, review, or draft');
      }
      const expectedHeadSha = text(input.arguments.expectedHeadSha, 'expectedHeadSha', 40);
      const expectedRegistryHash = text(
        input.arguments.expectedRegistryHash,
        'expectedRegistryHash',
        64,
      );
      if (!FULL_SHA.test(expectedHeadSha)) throw new Error('expectedHeadSha must be a full Git SHA');
      if (!HASH.test(expectedRegistryHash)) throw new Error('expectedRegistryHash must be sha256');
      if (!isRecord(input.arguments.capabilityPlan)) throw new Error('capabilityPlan must be an object');
      result = await previewSkillRoute({
        goal: text(input.arguments.goal, 'goal', 2000),
        action,
        projectSlug: receiptProject,
        expectedHeadSha,
        expectedRegistryHash,
        capabilityPlan: input.arguments.capabilityPlan as unknown as V10CapabilityPlan,
        provider: optionalText(input.arguments.provider, 'provider', 120) ?? 'github',
      });
    }

    const receipt = await recordEvidence({
      identity: input.identity,
      requestId: input.requestId,
      projectSlug: receiptProject,
      toolName: input.name,
      arguments: input.arguments,
      result,
      durationMs: Math.max(0, Date.now() - startedAt),
    });

    return {
      data: result,
      receipt,
      governanceBoundary: {
        readOrPreviewOnly: true,
        executionAllowed: false,
        founderApprovalGranted: false,
        cookiesUsed: false,
        fingerprintsUsed: false,
      },
    };
  };
}
