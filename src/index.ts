import "dotenv/config";
import { createServer } from "./http/server.js";
import { startScheduler } from "./worker/scheduler.js";

const port = Number(process.env.PORT ?? 8787);
const app = createServer();

app.listen(port, () => {
  console.log(`founder-control-room API listening on :${port}`);
  console.log(`  GET  /health`);
  console.log(`  POST /auth/magic-link   { "email": "founder@example.com" }`);
  console.log(`  GET  /auth/callback?token_hash=...&type=magiclink`);
  console.log(`  GET  /projects/:slug    (Authorization: Bearer <access_token>)`);
  console.log(`  POST /webhooks/github`);
});

startScheduler();
