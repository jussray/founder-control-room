import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");
const server = read("src/http/server.ts");
const security = read("src/http/middleware/security.ts");
const auth = read("src/http/routes/auth.ts");
const guard = read("src/http/middleware/requireFounder.ts");
const cookies = read("src/http/middleware/sessionCookies.ts");
const packageJson = read("package.json");

describe("HTTP security composition", () => {
  it("mounts headers, CORS, and audit before signed raw-body routes", () => {
    const helmet = server.indexOf("app.use(helmetMiddleware)");
    const cors = server.indexOf("app.use(corsMiddleware)");
    const audit = server.indexOf("app.use(requestAudit)");
    const webhook = server.indexOf('"/webhooks/github"');
    const json = server.indexOf("express.json");

    expect(helmet).toBeGreaterThan(-1);
    expect(cors).toBeGreaterThan(helmet);
    expect(audit).toBeGreaterThan(cors);
    expect(webhook).toBeGreaterThan(audit);
    expect(json).toBeGreaterThan(webhook);
  });

  it("keeps signed callbacks outside general rate limiting and CSRF", () => {
    const webhook = server.indexOf('"/webhooks/github"');
    const ingest = server.indexOf('"/ingest/repository-verification"');
    const general = server.indexOf("app.use(rateLimitGeneral)");
    expect(general).toBeGreaterThan(webhook);
    expect(general).toBeGreaterThan(ingest);
    expect(server).toContain('app.use("/projects", requireCsrf');
  });

  it("sets a same-origin no-inline executable content policy", () => {
    expect(security).toContain("default-src 'self'");
    expect(security).toContain("script-src 'self'");
    expect(security).toContain("frame-ancestors 'none'");
    expect(security).toContain("object-src 'none'");
    expect(security).toContain("Strict-Transport-Security");
  });

  it("uses bounded native middleware without undeclared security packages", () => {
    expect(security).not.toContain('from "helmet"');
    expect(security).not.toContain('from "cors"');
    expect(security).not.toContain('from "express-rate-limit"');
    expect(packageJson).not.toContain('"helmet"');
    expect(packageJson).not.toContain('"express-rate-limit"');
  });

  it("uses HttpOnly rotating browser sessions while retaining explicit bearer mode", () => {
    expect(cookies).toContain('export const ACCESS_COOKIE = "fcr_access"');
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Lax");
    expect(guard).toContain('founderAuthMode?: "bearer" | "cookie"');
    expect(guard).toContain("refreshCookieSession");
    expect(auth).toContain("setFounderSessionCookies");
    expect(auth).toContain('res.redirect(303, "/control-room")');
  });

  it("does not write founder email addresses to request audit logs", () => {
    expect(security).toContain("founderUserId");
    expect(security).not.toContain("founder: founder.email");
  });
});
