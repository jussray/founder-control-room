import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/http/routes/controlRoomUi.ts"),
  "utf8",
);
const server = readFileSync(
  resolve(process.cwd(), "src/http/server.ts"),
  "utf8",
);
const auth = readFileSync(
  resolve(process.cwd(), "src/http/routes/auth.ts"),
  "utf8",
);

describe("Founder Control Room UI contract", () => {
  it("requires founder auth for the dashboard but leaves login assets public", () => {
    expect(source).toContain('controlRoomUiRouter.get("/login"');
    expect(source).toContain('controlRoomUiRouter.get(\n  "/",\n  requireFounder');
    expect(server).toContain('app.use("/control-room", controlRoomUiRouter)');
    expect(auth).toContain('res.redirect(303, "/control-room")');
  });

  it("uses external same-origin scripts under a no-inline CSP", () => {
    expect(source).toContain('<script src="/control-room/app.js" defer></script>');
    expect(source).toContain('<script src="/control-room/login.js" defer></script>');
    expect(source).not.toMatch(/<script>[^<]/);
    expect(source).not.toContain("innerHTML");
    expect(source).toContain("textContent");
  });

  it("can verify and propose a mission but cannot integrate or deploy", () => {
    expect(source).toContain("/verification/scan");
    expect(source).toContain("/verification/propose-mission");
    expect(source).not.toContain("/merge");
    expect(source).not.toContain("/integrate");
    expect(source).not.toContain("/deploy");
    expect(source).not.toContain("/rollback");
  });

  it("sends CSRF on cookie-backed writes and keeps credentials same-origin", () => {
    expect(source).toContain("headers.set('x-csrf-token', csrfToken())");
    expect(source).toContain("credentials: 'same-origin'");
    expect(server).toContain('app.use("/projects", requireCsrf');
    expect(server).toContain('app.use("/approvals", requireCsrf');
  });

  it("states the non-carrying approval boundary in the visible UI", () => {
    expect(source).toContain("Verification can prepare a repair mission");
    expect(source).toContain("never authorizes branch creation, merge, deployment, rollback, secret access, or destructive work");
  });
});
