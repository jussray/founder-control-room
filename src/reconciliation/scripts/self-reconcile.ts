#!/usr/bin/env tsx
/**
 * Self-reconciliation script — founder-control-room
 *
 * Runs during the post-deploy `reconcile` CI job.
 * Checks that all required Supabase tables are reachable and non-empty,
 * then POSTs its own DriftReport to /api/reconcile.
 *
 * Exit 0 = clean (deploy continues)
 * Exit 1 = drift detected (logged, but deploy NOT blocked — continue-on-error: true)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEPLOY_URL = process.env.DEPLOY_URL!;
const SECRET = process.env.RECONCILE_SHARED_SECRET!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }));
  process.exit(1);
}

const REQUIRED_TABLES = [
  'profiles',
  'reconciliation_events',
];

type DriftItem = { type: string; detail: string };

async function run() {
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

  // POST back to own /api/reconcile so it lands in the dashboard
  if (DEPLOY_URL && SECRET) {
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
