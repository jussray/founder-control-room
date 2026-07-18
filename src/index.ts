import 'dotenv/config';
import { createServer } from './http/server.js';
import { startScheduler } from './worker/scheduler.js';

const port = Number(process.env.PORT ?? 8787);
const app = createServer();

app.listen(port, () => {
  console.log(`founder-control-room API listening on :${port}`);
  console.log(`  GET  /health`);
  console.log(`  POST /auth/magic-link`);
  console.log(`  GET  /auth/callback`);
  console.log(`  GET  /projects/:slug`);
  console.log(`  POST /webhooks/github`);
  console.log(`  POST /approvals/:missionId/execute`);
  console.log(`  GET  /terminal/:projectSlug/commands`);
  console.log(`  POST /terminal/:projectSlug/run`);
  console.log(`  POST /terminal/runs/:runId/cancel`);

  // Start the outbox worker and all periodic safety resyncs
  startScheduler();
});
