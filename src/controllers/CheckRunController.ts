/**
 * CheckRunController
 *
 * Triggered by GitHub check_run events.
 * Reads current check status → normalizes to Evidence → stores in Postgres.
 * Enqueues MissionController if all required checks for a mission are resolved.
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import { enqueueReconcile } from '../events/outbox.js';
import type {
  ReconcileRequest,
  ReconcileResult,
  EvidenceRecord,
  EvidenceKind,
  EvidenceStatus,
} from '../reconciliation/types.js';

const CHECK_NAME_TO_KIND: Record<string, EvidenceKind> = {
  typecheck: 'typecheck',
  'type-check': 'typecheck',
  tsc: 'typecheck',
  lint: 'lint',
  eslint: 'lint',
  'unit-tests': 'unit_test',
  'unit tests': 'unit_test',
  vitest: 'unit_test',
  jest: 'unit_test',
  playwright: 'browser_test',
  'playwright brand moat': 'browser_test',
  'rls-audit': 'rls_audit',
  'security-scan': 'security_scan',
  sonarqube: 'security_scan',
  'deployment boundary': 'security_scan',
  'production build': 'integration_test',
  build: 'integration_test',
  'qodo-contracts': 'integration_test',
};

function mapConclusion(conclusion: string | null): EvidenceStatus {
  if (conclusion === 'success') return 'pass';
  if (conclusion === 'neutral' || conclusion === 'skipped') return 'warn';
  if (conclusion === null) return 'pending';
  return 'fail';
}

function resolveKind(checkName: string): EvidenceKind {
  const normalized = checkName.toLowerCase().trim();
  const exact = CHECK_NAME_TO_KIND[normalized];
  if (exact) return exact;

  if (normalized.includes('playwright') || normalized.includes('browser')) return 'browser_test';
  if (normalized.includes('typecheck') || normalized.includes('type check') || normalized.includes('tsc')) {
    return 'typecheck';
  }
  if (normalized.includes('lint')) return 'lint';
  if (normalized.includes('unit') || normalized.includes('vitest') || normalized.includes('jest')) {
    return 'unit_test';
  }
  if (normalized.includes('security') || normalized.includes('sonar') || normalized.includes('boundary')) {
    return 'security_scan';
  }
  if (normalized.includes('build') || normalized.includes('compile')) return 'integration_test';

  // Unknown checks are retained as provenance but cannot accidentally satisfy
  // a concrete required check such as typecheck or Playwright.
  return 'artifact_provenance';
}

export class CheckRunController extends BaseController {
  readonly name = 'CheckRunController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId, sourceEventId } = req;

    if (!resourceId) {
      return this.done('converged', 'No resourceId – nothing to reconcile');
    }

    // Fetch the stored event payload from the inbox
    const { data: event } = await supabase
      .from('provider_events')
      .select('payload, project_id')
      .eq('id', sourceEventId)
      .single();

    if (!event) {
      return this.done('retry', `Event ${sourceEventId} not found`);
    }

    const payload = event.payload as Record<string, unknown>;
    const checkRun = payload['check_run'] as Record<string, unknown>;
    if (!checkRun) return this.done('converged', 'No check_run in payload');

    const checkName = (checkRun['name'] as string) ?? 'unknown';
    const conclusion = (checkRun['conclusion'] as string | null) ?? null;
    const headSha = (checkRun['head_sha'] as string) ?? undefined;
    const detailsUrl = (checkRun['details_url'] as string) ?? undefined;

    const evidenceRecord: EvidenceRecord = {
      projectId,
      subject: `check:${checkName}`,
      kind: resolveKind(checkName),
      status: mapConclusion(conclusion),
      provider: 'github',
      commitSha: headSha,
      detailsRef: detailsUrl,
    };

    // Find mission associated with this commit. A mission with an explicit
    // policy snapshot can additionally bind its expected head SHA; the exact
    // SHA is enforced again at merge time.
    const { data: mission } = await supabase
      .from('missions')
      .select('id, status, policy_snapshot')
      .eq('project_id', projectId)
      .in('status', ['implementing', 'preview_ready', 'awaiting_approval'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const expectedHeadSha = mission?.policy_snapshot?.expectedHeadSha as string | undefined;
    if (mission && (!expectedHeadSha || !headSha || expectedHeadSha.toLowerCase() === headSha.toLowerCase())) {
      evidenceRecord.missionId = mission.id;
    }

    // Persist evidence
    const { data: inserted, error } = await supabase
      .from('evidence')
      .insert({
        project_id: evidenceRecord.projectId,
        mission_id: evidenceRecord.missionId ?? null,
        subject: evidenceRecord.subject,
        kind: evidenceRecord.kind,
        status: evidenceRecord.status,
        provider: evidenceRecord.provider,
        commit_sha: evidenceRecord.commitSha ?? null,
        details_ref: evidenceRecord.detailsRef ?? null,
      })
      .select('id')
      .single();

    if (error) {
      this.log('error', 'Failed to persist evidence', { error: error.message });
      return this.done('retry', error.message);
    }

    this.log('info', 'Evidence persisted', {
      projectId,
      kind: evidenceRecord.kind,
      status: evidenceRecord.status,
      missionId: evidenceRecord.missionId,
      headSha,
    });

    // If there is an active mission and the evidence matched its expected SHA,
    // enqueue MissionController to re-evaluate.
    if (evidenceRecord.missionId) {
      await enqueueReconcile(
        {
          projectId,
          controller: 'MissionController',
          resourceId: evidenceRecord.missionId,
          reason: 'dependency_changed',
          sourceEventId,
        },
        // Small debounce – coalesce burst check_run events
        { availableAt: new Date(Date.now() + 3_000).toISOString() },
      );
    }

    return {
      status: 'converged',
      observedChanges: [{
        resourceType: 'check_run',
        resourceId: resourceId,
        field: 'conclusion',
        previousValue: null,
        newValue: conclusion,
      }],
      proposedActions: [],
      evidenceIds: [inserted!.id],
      requiresApproval: false,
    };
  }

  private done(status: ReconcileResult['status'], message: string): ReconcileResult {
    return {
      status,
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      message,
      ...(status === 'retry' ? { retryAfter: new Date(Date.now() + 10_000).toISOString() } : {}),
    };
  }
}
