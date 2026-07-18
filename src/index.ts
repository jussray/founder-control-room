import 'dotenv/config';
import { createServer } from './http/server.js';
import { startScheduler } from './worker/scheduler.js';

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
  console.log(`  POST /webhooks/github`);
  console.log(`  POST /approvals/:missionId/execute`);
  console.log(`  POST /approvals/:missionId/patch`);
  console.log(`  GET  /terminal/:projectSlug/commands`);
  console.log(`  POST /terminal/:projectSlug/run`);
  console.log(`  POST /terminal/runs/:runId/cancel`);
  console.log(`  GET  /dashboard/tasks`);
  console.log(`  GET  /dashboard/activity`);
  console.log(`  POST /dashboard/manual-analysis`);

  // Start the outbox worker and all periodic safety resyncs
  startScheduler();
});
