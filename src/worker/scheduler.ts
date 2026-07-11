/**
 * Periodic safety resync scheduler.
 *
 * Three cadences:
 *   - Active mission resync:   every 2 minutes
 *   - Normal project resync:   every 15 minutes
 *   - Deep portfolio audit:    daily
 *
 * Also triggers on:
 *   - startup
 *   - manual call (e.g. operator presses "refresh evidence")
 *
 * All scheduled work calls the same controllers as event-triggered work.
 * No duplicate code path.
 */

import { enqueueReconcile } from '../events/outbox.js';
import { supabase } from '../lib/supabaseClient.js';
import { runReconcilerCycle } from './reconciler.js';

const ACTIVE_MISSION_INTERVAL_MS = 2 * 60 * 1_000;  // 2 minutes
const NORMAL_RESYNC_INTERVAL_MS = 15 * 60 * 1_000;  // 15 minutes
const DEEP_AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 hours
const RECONCILER_POLL_MS = 2_000; // outbox poll every 2s

async function enqueueActiveMissionResync(): Promise<void> {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('status', 'active');

  if (!projects?.length) return;

  // Projects with active missions get targeted resync
  const { data: activeMissions } = await supabase
    .from('missions')
    .select('id, project_id')
    .in('status', ['implementing', 'preview_ready', 'deploying', 'verifying'])
    .in('project_id', projects.map((p: { id: string }) => p.id));

  for (const mission of activeMissions ?? []) {
    await enqueueReconcile({
      projectId: mission.project_id,
      controller: 'MissionController',
      resourceId: mission.id,
      reason: 'periodic_resync',
    });
    await enqueueReconcile({
      projectId: mission.project_id,
      controller: 'ProjectController',
      reason: 'periodic_resync',
    });
  }
}

async function enqueueNormalProjectResync(): Promise<void> {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('status', 'active');

  for (const project of projects ?? []) {
    await enqueueReconcile({
      projectId: project.id,
      controller: 'ProjectController',
      reason: 'periodic_resync',
    });
  }
}

async function enqueueDeepAudit(): Promise<void> {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('status', 'active');

  for (const project of projects ?? []) {
    // ManifestController checks for manifest drift (added in next milestone)
    await enqueueReconcile({
      projectId: project.id,
      controller: 'ProjectController',
      resourceId: undefined,
      reason: 'periodic_resync',
    });
  }

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    scheduler: 'deep_audit',
    projects: projects?.length ?? 0,
  }));
}

/** Call at startup and after provider reconnections. */
export async function triggerImmediateResync(projectId?: string): Promise<void> {
  if (projectId) {
    await enqueueReconcile({
      projectId,
      controller: 'ProjectController',
      reason: 'startup',
    });
  } else {
    await enqueueNormalProjectResync();
  }
}

export function startScheduler(): void {
  // Startup resync
  triggerImmediateResync().catch(console.error);

  // Outbox worker poll
  setInterval(() => runReconcilerCycle().catch(console.error), RECONCILER_POLL_MS);

  // Active mission resync
  setInterval(() => enqueueActiveMissionResync().catch(console.error), ACTIVE_MISSION_INTERVAL_MS);

  // Normal project resync
  setInterval(() => enqueueNormalProjectResync().catch(console.error), NORMAL_RESYNC_INTERVAL_MS);

  // Deep portfolio audit
  setInterval(() => enqueueDeepAudit().catch(console.error), DEEP_AUDIT_INTERVAL_MS);

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    scheduler: 'started',
    activeMissionIntervalMs: ACTIVE_MISSION_INTERVAL_MS,
    normalResyncIntervalMs: NORMAL_RESYNC_INTERVAL_MS,
    deepAuditIntervalMs: DEEP_AUDIT_INTERVAL_MS,
  }));
}
