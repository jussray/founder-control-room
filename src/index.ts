import 'dotenv/config';
import { createServer } from './http/server.js';
import { startScheduler } from './worker/scheduler.js';
import { startReconciliationConsumer } from './reconciliation/consumer.js';
import { getInbox } from './events/inbox.js';
import { getOutbox } from './events/outbox.js';
import { getDb } from './lib/db.js';

const port = Number(process.env.PORT ?? 8787);
const app = createServer({ serveStatic: true });

app.listen(port, () => {
  console.log(`founder-control-room API listening on :${port}`);
  console.log(`  GET  /control-room/         (frontend)`);
  console.log(`  GET  /health`);
  console.log(`  POST /auth/magic-link`);
  console.log(`  GET  /auth/callback`);
  console.log(`  GET  /projects`);
  console.log(`  POST /projects`);
  console.log(`  GET  /projects/:slug`);
  console.log(`  GET  /projects/:slug/files`);
  console.log(`  GET  /projects/:slug/file`);
  console.log(`  POST /projects/:slug/missions`);
  console.log(`  GET  /projects/:slug/releases`);
  console.log(`  GET  /projects/:slug/connections    (MCP/Connector Hub)`);
  console.log(`  POST /projects/:slug/connections`);
  console.log(`  POST /projects/:slug/connections/:connectionId/check`);
  console.log(`  POST /webhooks/github`);
  console.log(`  POST /approvals/:missionId/execute`);
  console.log(`  POST /approvals/:missionId/patch`);
  console.log(`  PATCH /missions/:missionId          (assign builder/reviewer agent)`);
  console.log(`  GET  /missions/:missionId/council`);
  console.log(`  POST /missions/:missionId/council`);
  console.log(`  GET  /missions/:missionId/runs`);
  console.log(`  GET  /missions/:missionId/costs`);
  console.log(`  POST /missions/:missionId/costs`);
  console.log(`  GET  /agents`);
  console.log(`  GET  /authority-levels`);
  console.log(`  GET  /promptos`);
  console.log(`  POST /promptos`);
  console.log(`  GET  /promptos/:id`);
  console.log(`  PATCH /promptos/:id`);
  console.log(`  GET  /terminal/:projectSlug/commands`);
  console.log(`  POST /terminal/:projectSlug/run`);
  console.log(`  POST /terminal/runs/:runId/cancel`);
  console.log(`  GET  /dashboard/tasks`);
  console.log(`  GET  /dashboard/activity`);
  console.log(`  GET  /dashboard/costs`);
  console.log(`  POST /dashboard/manual-analysis`);
  console.log(`  POST /api/reconcile             (inbound drift reports)`);
  console.log(`  GET  /mcp/servers`);
  console.log(`  GET  /mcp/servers/:serverId/capabilities`);
  console.log(`  POST /mcp/servers/:serverId/tools/:toolName/preview`);
  console.log(`  POST /mcp/servers/:serverId/tools/:toolName/invoke`);

  // Start the outbox worker and all periodic safety resyncs
  startScheduler();

  // Start reconciliation event bus consumer
  // Listens on inbox 'reconciliation.report' → persists → forwards drift to outbox
  startReconciliationConsumer(getInbox(), getOutbox(), getDb());
});
