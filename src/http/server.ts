import express from "express";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { handleGitHubWebhook } from "./webhooks/github.js";

export function createServer() {
  const app = express();

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Mounted before express.json() — GitHub's HMAC signature is computed over
  // the exact raw request bytes, so this route needs the unparsed Buffer body
  // rather than the globally JSON-parsed one.
  app.post(
    "/webhooks/github",
    express.raw({ type: "application/json" }),
    handleGitHubWebhook
  );

  app.use(express.json());
  app.use("/auth", authRouter);
  app.use("/projects", projectsRouter);

  return app;
}
