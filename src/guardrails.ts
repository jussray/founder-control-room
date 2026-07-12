export type GuardrailStatus = "active" | "partial" | "planned";

export type Guardrail = Readonly<{
  id: string;
  status: GuardrailStatus;
  summary: string;
  evidence: readonly string[];
}>;

export const CONTROL_ROOM_VISION = Object.freeze({
  id: "founder-authority-control-room",
  stage: "backend-foundation",
  northStar: "Give the founder verified project truth, explicit approval gates, auditable execution, and recoverable provider-independent operations.",
  source: "docs/VISION.md",
});

export const CONTROL_ROOM_GUARDRAILS: readonly Guardrail[] = Object.freeze([
  Object.freeze({ id: "FCR-AUTH-001", status: "active", summary: "Founder project access requires session validation plus founder allowlist authorization.", evidence: ["src/http/middleware/requireFounder.ts"] }),
  Object.freeze({ id: "FCR-BOUNDARY-001", status: "active", summary: "Control Room uses its own Supabase trust boundary and does not borrow Se’kret Bip credentials.", evidence: ["src/lib/supabaseClient.ts", "docs/ARCHITECTURE.md"] }),
  Object.freeze({ id: "FCR-DATA-001", status: "partial", summary: "Only curated operational evidence may cross project boundaries; raw private product content is forbidden.", evidence: ["README.md", "docs/ARCHITECTURE.md"] }),
  Object.freeze({ id: "FCR-APPROVAL-001", status: "active", summary: "Sandbox, branch, merge, deploy, and rollback remain separate approval gates.", evidence: ["docs/ARCHITECTURE.md", "README.md"] }),
  Object.freeze({ id: "FCR-PROVIDER-001", status: "active", summary: "Repository and AI providers remain replaceable adapters.", evidence: ["src/providers/RepositoryProvider.ts", "docs/PROVIDERS.md"] }),
  Object.freeze({ id: "FCR-SECRET-001", status: "active", summary: "Secrets, founder sessions, and private project payloads are excluded from public status responses.", evidence: ["src/http/server.ts"] }),
  Object.freeze({ id: "FCR-AUDIT-001", status: "active", summary: "Project reads and material provider actions require audit evidence.", evidence: ["src/http/routes/projects.ts"] }),
]);

export function publicGuardrailSnapshot() {
  return Object.freeze({
    version: "1.0.0",
    vision: CONTROL_ROOM_VISION,
    guardrails: CONTROL_ROOM_GUARDRAILS.map(({ id, status, summary }) => ({ id, status, summary })),
    sensitiveFieldsIncluded: false,
    approvalCarryForward: false,
  });
}

const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
});

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => HTML_ENTITIES[character] ?? character);
}

export function renderGuardrailStatusPage() {
  const snapshot = publicGuardrailSnapshot();
  const items = snapshot.guardrails
    .map(guardrail => `<li data-guardrail-id="${escapeHtml(guardrail.id)}"><strong>${escapeHtml(guardrail.id)}</strong> <span>${escapeHtml(guardrail.status)}</span><p>${escapeHtml(guardrail.summary)}</p></li>`)
    .join("");

  return `<!doctype html>
<html lang="en" data-guardrails="active" data-product-stage="${escapeHtml(snapshot.vision.stage)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Founder Control Room Guardrails</title>
  <style>body{font-family:system-ui,sans-serif;max-width:880px;margin:40px auto;padding:0 20px;line-height:1.5;background:#0b1020;color:#edf2ff}article{background:#151c33;border:1px solid #33416b;border-radius:16px;padding:24px}li{margin:18px 0}span{font-size:.8rem;text-transform:uppercase;color:#9fb3ff}code{color:#b9fbc0}</style>
</head>
<body>
  <main>
    <h1>Founder Control Room guardrails</h1>
    <p data-testid="vision-stage">Stage: <strong>${escapeHtml(snapshot.vision.stage)}</strong></p>
    <article>
      <h2>North star</h2>
      <p>${escapeHtml(snapshot.vision.northStar)}</p>
    </article>
    <section>
      <h2>Active contract</h2>
      <ul>${items}</ul>
    </section>
    <p data-testid="sensitive-status"><code>sensitiveFieldsIncluded=false</code></p>
    <p data-testid="approval-status"><code>approvalCarryForward=false</code></p>
  </main>
</body>
</html>`;
}
