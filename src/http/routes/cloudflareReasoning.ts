import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import {
  CLOUDFLARE_REASONING_CONTRACT,
  reasonAboutCloudflare,
} from '../../reasoning/cloudflare/reason.js';
import type {
  CloudflareDesiredState,
  CloudflareSignal,
  CloudflareSignalKind,
  CloudflareSignalStatus,
} from '../../reasoning/cloudflare/types.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const cloudflareReasoningRouter = Router();

type Row = Record<string, unknown>;

function asObject(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Row
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstString(row: Row, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(row[key]);
    if (value) return value;
  }
  return undefined;
}

function normalizeStatus(value: unknown): CloudflareSignalStatus {
  const status = asString(value)?.toLowerCase();
  if (!status) return 'unknown';
  if (['success', 'succeeded', 'deployed', 'healthy', 'active', 'ready', 'pass', 'passed'].includes(status)) {
    return 'success';
  }
  if (['pending', 'queued', 'running', 'in_progress', 'building', 'processing'].includes(status)) {
    return 'pending';
  }
  if (['warning', 'degraded', 'partial', 'stale'].includes(status)) {
    return 'warning';
  }
  if (['failure', 'failed', 'error', 'unhealthy', 'cancelled', 'canceled', 'blocked'].includes(status)) {
    return 'failure';
  }
  return 'unknown';
}

function normalizeKind(value: unknown): CloudflareSignalKind {
  const resource = asString(value)?.toLowerCase() ?? '';
  if (resource.includes('worker')) return 'worker_deployment';
  if (resource.includes('page')) return 'pages_deployment';
  if (resource.includes('health') || resource.includes('smoke')) return 'runtime_health';
  if (resource.includes('authority') || resource.includes('deployment_path')) return 'deployment_authority';
  if (resource.includes('credential') || resource.includes('token') || resource.includes('auth')) return 'credential';
  if (resource.includes('dns')) return 'dns';
  if (resource.includes('route')) return 'route';
  if (resource.includes('secret') || resource.includes('binding')) return 'secret_binding';
  if (resource.includes('release') || resource.includes('marker')) return 'release_marker';
  return 'other';
}

function normalizeAuthority(value: unknown): CloudflareSignal['authority'] {
  const authority = asString(value)?.toLowerCase();
  if (authority === 'native_git' || authority === 'git_integration' || authority === 'workers_builds') {
    return 'native_git';
  }
  if (authority === 'token_upload' || authority === 'wrangler' || authority === 'api_token') {
    return 'token_upload';
  }
  if (authority === 'manual') return 'manual';
  return authority ? 'unknown' : undefined;
}

function observationToSignal(row: Row): CloudflareSignal {
  const state = asObject(row['observed_state']);
  return {
    id: asString(row['id']) ?? randomUUID(),
    kind: normalizeKind(row['resource_type']),
    status: normalizeStatus(
      state['status']
      ?? state['state']
      ?? state['conclusion']
      ?? state['health'],
    ),
    source: 'provider_observation',
    observedAt: firstString(row, ['observed_at', 'created_at']) ?? new Date(0).toISOString(),
    resourceId: firstString(row, ['resource_id']),
    environment: firstString(state, ['environment']),
    commitSha: firstString(state, ['commit_sha', 'head_sha', 'sha']),
    url: firstString(state, ['url', 'deployment_url', 'environment_url']),
    detailCode: firstString(state, ['error_code', 'code']),
    authority: normalizeAuthority(state['authority'] ?? state['deployment_authority']),
  };
}

function releaseToSignal(row: Row): CloudflareSignal {
  const environment = firstString(row, ['environment']);
  const deployUrl = firstString(row, ['deploy_url', 'url']);
  const resourceText = `${firstString(row, ['resource_type']) ?? ''} ${deployUrl ?? ''} ${environment ?? ''}`.toLowerCase();
  const kind: CloudflareSignalKind = resourceText.includes('page')
    ? 'pages_deployment'
    : resourceText.includes('worker')
      ? 'worker_deployment'
      : 'release_marker';

  return {
    id: asString(row['id']) ?? randomUUID(),
    kind,
    status: normalizeStatus(row['state'] ?? row['status']),
    source: 'release_ledger',
    observedAt: firstString(row, ['observed_at', 'provider_updated_at', 'created_at']) ?? new Date(0).toISOString(),
    resourceId: firstString(row, ['provider_deployment_id', 'id']),
    environment,
    commitSha: firstString(row, ['commit_sha', 'head_sha', 'sha']),
    url: deployUrl,
    authority: normalizeAuthority(row['deployment_authority']),
  };
}

function eventToSignal(row: Row): CloudflareSignal {
  const metadata = asObject(row['metadata']);
  const eventType = firstString(row, ['event_type']) ?? 'other';
  return {
    id: asString(row['id']) ?? randomUUID(),
    kind: normalizeKind(metadata['resource_type'] ?? eventType),
    status: normalizeStatus(
      metadata['status']
      ?? metadata['state']
      ?? row['decision']
      ?? row['severity'],
    ),
    source: 'project_event',
    observedAt: firstString(row, ['created_at']) ?? new Date(0).toISOString(),
    resourceId: firstString(metadata, ['resource_id', 'deployment_id']),
    environment: firstString(metadata, ['environment']),
    commitSha: firstString(metadata, ['commit_sha', 'head_sha', 'sha']),
    url: firstString(metadata, ['url', 'deployment_url']),
    detailCode: firstString(metadata, ['error_code', 'code']),
    authority: normalizeAuthority(metadata['authority'] ?? metadata['deployment_authority']),
  };
}

function desiredFromConnection(row: Row | undefined): CloudflareDesiredState {
  if (!row) return {};
  const config = asObject(row['connection_config'] ?? row['config']);
  return {
    workerName: firstString(config, ['workerName', 'worker_name', 'worker']),
    pagesProject: firstString(config, ['pagesProject', 'pages_project', 'pages']),
    productionUrl: firstString(config, ['productionUrl', 'production_url', 'url']),
    deploymentAuthority: normalizeAuthority(
      config['deploymentAuthority'] ?? config['deployment_authority'] ?? config['authority'],
    ),
  };
}

function isCloudflareConnection(row: Row): boolean {
  return firstString(row, ['provider', 'connection_type'])?.toLowerCase() === 'cloudflare';
}

cloudflareReasoningRouter.get('/contract', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  res.status(200).json(CLOUDFLARE_REASONING_CONTRACT);
});

cloudflareReasoningRouter.post(
  '/:slug/reason',
  requireFounder,
  async (req: FounderRequest, res: Response) => {
    const { slug } = req.params as { slug: string };
    const body = asObject(req.body);
    const requestedCommit = asString(body['desiredCommit']);
    const maxEvidenceAgeMinutes = typeof body['maxEvidenceAgeMinutes'] === 'number'
      ? body['maxEvidenceAgeMinutes']
      : undefined;

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (projectError) {
      return res.status(500).json({ error: 'Failed to load project registry state' });
    }
    if (!project) {
      return res.status(404).json({ error: `No project registered with slug "${slug}"` });
    }

    const projectRow = project as Row;
    const projectId = asString(projectRow['id']);
    if (!projectId) {
      return res.status(500).json({ error: 'Project registry row has no stable id' });
    }

    const signals: CloudflareSignal[] = [];
    const evidenceErrors: string[] = [];

    const connectionsResult = await supabase
      .from('project_connections')
      .select('*')
      .eq('project_id', projectId);
    if (connectionsResult.error) evidenceErrors.push('project_connections');
    const connectionRows = (connectionsResult.data ?? []) as Row[];
    const cloudflareConnection = connectionRows.find(isCloudflareConnection);

    const observationResult = await supabase
      .from('provider_observations')
      .select('*')
      .eq('project_id', projectId)
      .eq('provider', 'cloudflare')
      .order('observed_at', { ascending: false })
      .limit(50);
    if (observationResult.error) {
      evidenceErrors.push('provider_observations');
    } else {
      signals.push(...((observationResult.data ?? []) as Row[]).map(observationToSignal));
    }

    const releaseResult = await supabase
      .from('releases')
      .select('*')
      .eq('project_id', projectId)
      .eq('provider', 'cloudflare')
      .order('observed_at', { ascending: false })
      .limit(25);
    if (releaseResult.error) {
      evidenceErrors.push('releases');
    } else {
      signals.push(...((releaseResult.data ?? []) as Row[]).map(releaseToSignal));
    }

    const eventResult = await supabase
      .from('project_events')
      .select('id,event_type,severity,decision,metadata,created_at')
      .eq('project_id', projectId)
      .eq('provider', 'cloudflare')
      .order('created_at', { ascending: false })
      .limit(50);
    if (eventResult.error) {
      evidenceErrors.push('project_events');
    } else {
      signals.push(...((eventResult.data ?? []) as Row[]).map(eventToSignal));
    }

    const manifestResult = await supabase
      .from('project_manifests')
      .select('commit_sha,imported_at')
      .eq('project_id', projectId)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (manifestResult.error) evidenceErrors.push('project_manifests');

    const desired = desiredFromConnection(cloudflareConnection);
    desired.commitSha = requestedCommit
      ?? asString((manifestResult.data as Row | null)?.['commit_sha']);

    for (const source of evidenceErrors) {
      signals.push({
        id: `evidence-error:${source}`,
        kind: 'other',
        status: 'warning',
        source: 'control_room_query',
        observedAt: new Date().toISOString(),
        resourceId: source,
        detailCode: 'EVIDENCE_SOURCE_UNAVAILABLE',
      });
    }

    const report = reasonAboutCloudflare({
      projectId,
      projectName: asString(projectRow['name']),
      desired,
      signals,
      maxEvidenceAgeMinutes,
    });

    const { error: auditError } = await supabase.from('project_events').insert({
      project_id: projectId,
      source_event_id: randomUUID(),
      event_type: 'cloudflare_reasoning_completed',
      severity: report.outcome === 'blocked'
        ? 'error'
        : report.outcome === 'verified'
          ? 'info'
          : 'warning',
      screen: 'control-room-api',
      provider: 'cloudflare',
      decision: report.outcome,
      metadata: {
        route: `POST /cloudflare/${slug}/reason`,
        confidence: report.confidence,
        fresh_signal_count: report.freshSignalIds.length,
        stale_signal_count: report.staleSignalIds.length,
        missing_evidence: report.missingEvidence,
        proposed_action_ids: report.ooda.act.map((item) => item.id),
        evidence_source_errors: evidenceErrors,
        requested_by_founder: Boolean(req.founder),
        sensitive_fields_included: false,
      },
    });

    if (auditError) {
      return res.status(503).json({
        error: 'Cloudflare reasoning completed but audit evidence could not be persisted',
        code: 'AUDIT_WRITE_FAILED',
      });
    }

    return res.status(200).json({
      contract: CLOUDFLARE_REASONING_CONTRACT,
      report,
      sourceSummary: {
        connectionConfigured: Boolean(cloudflareConnection),
        signalCount: signals.length,
        unavailableSources: evidenceErrors,
        rawProviderPayloadIncluded: false,
      },
    });
  },
);
