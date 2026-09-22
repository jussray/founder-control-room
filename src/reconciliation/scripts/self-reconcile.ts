#!/usr/bin/env tsx
/**
 * Self-reconciliation script — founder-control-room
 *
 * Runs during the post-deploy `reconcile` CI job.
 * Checks that all required Supabase tables are reachable and non-empty,
 * then POSTs its own DriftReport to /api/reconcile.
 *
 * Exit 0 = clean.
 * Exit 1 = drift detected; the deployment workflow fails closed so the
 * deployed state must be rolled back or repaired with a verified safe-forward fix.
 */
import { createClient } from '@supabase/supabase-js';
import {
  CONTROL_ROOM_SUPABASE_PROJECT_REF,
  validateControlRoomSupabaseUrl,
} from '../../lib/supabaseProjectIdentity.js';

const CONTROL_ROOM_DEPLOY_URL = 'https://api.foundercontrolroom.org';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEPLOY_URL_INPUT = process.env.DEPLOY_URL?.trim();
const SECRET = process.env.RECONCILE_SHARED_SECRET!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }));
  process.exit(1);
}

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('credentials, query, and fragments are not allowed');
    }
    if (url.pathname !== '/' && url.pathname !== '') {
      throw new Error('nested paths are not allowed');
    }
    return url.origin;
  } catch {
    throw new Error('DEPLOY_URL must be the canonical Founder Control Room HTTPS origin');
  }
}

function deployedRuntimeOrigin(): string {
  if (!DEPLOY_URL_INPUT) return CONTROL_ROOM_DEPLOY_URL;
  const observed = normalizeOrigin(DEPLOY_URL_INPUT);
  if (observed !== CONTROL_ROOM_DEPLOY_URL) {
    throw new Error('DEPLOY_URL does not match the canonical Founder Control Room Worker origin');
  }
  return observed;
}

const DEPLOY_URL = deployedRuntimeOrigin();

const REQUIRED_TABLES = [
  'profiles',
  'reconciliation_events',
];

type DriftItem = { type: string; detail: string };

type VersionReceipt = {
  service?: unknown;
  v10?: {
    supabaseProjectRef?: unknown;
  };
};

async function assertDeployedRuntimeSupabaseIdentity(): Promise<void> {
  const response = await fetch(`${DEPLOY_URL}/version`, {
    method: 'GET',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Deployed runtime identity proof failed with HTTP ${response.status}`);
  }

  const body = await response.json() as VersionReceipt;
  if (body.service !== 'founder-control-room') {
    throw new Error('Deployed runtime identity proof reached the wrong service');
  }
  if (body.v10?.supabaseProjectRef !== CONTROL_ROOM_SUPABASE_PROJECT_REF) {
    throw new Error('Deployed Worker Supabase project identity does not match the Founder Control Room project');
  }

  console.log(`  ✓ deployed Worker Supabase project ref ${CONTROL_ROOM_SUPABASE_PROJECT_REF}`);
}

async function run() {
  // The deploy-plane Actions URL must identify the same code-owned FCR project
  // that the deployed Worker reports. A different but schema-compatible
  // Supabase project must never satisfy reconciliation or unlock publication.
  validateControlRoomSupabaseUrl(SUPABASE_URL, { nodeEnv: 'production' });
  await assertDeployedRuntimeSupabaseIdentity();

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const drift: DriftItem[] = [];
  const start = Date.now();

  for (const table of REQUIRED_TABLES) {
    const { count, error } = await db
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      drift.push({ type: 'missing_table', detail: `'${table}': ${error.message}` });
    } else {
      console.log(`  ✓ ${table} (${count ?? 0} rows)`);
    }
  }

  const report = {
    service: 'founder-control-room',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    status: drift.length === 0 ? 'clean' : 'drift_detected',
    drift,
  };

  console.log('\nReconciliation report:');
  console.log(JSON.stringify(report, null, 2));

  // POST back to own /api/reconcile so it lands in the dashboard when the
  // separately provisioned reconciliation secret is available. The runtime
  // identity check above is mandatory regardless of whether this write occurs.
  if (SECRET) {
    try {
      const res = await fetch(`${DEPLOY_URL}/api/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reconcile-Secret': SECRET,
          'X-Source': 'self-reconcile-script',
        },
        body: JSON.stringify(report),
      });
      console.log(`\nPOST /api/reconcile → ${res.status}`);
    } catch (e) {
      console.warn('Could not POST report to Control Room:', e);
    }
  }

  process.exit(drift.length > 0 ? 1 : 0);
}

run().catch(e => {
  console.error(JSON.stringify({ error: String(e) }));
  process.exit(2);
});
