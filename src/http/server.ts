import express from "express";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";

export function createServer() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/projects", projectsRouter);

  return app;
}
