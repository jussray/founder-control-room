export type GuardrailStatus = 'active' | 'partial' | 'planned';

export type Guardrail = Readonly<{
  id: string;
  status: GuardrailStatus;
  summary: string;
  evidence: readonly string[];
}>;

export const CONTROL_ROOM_VISION = Object.freeze({
  id: 'founder-authority-control-room',
  stage: 'operational-foundation',
  northStar:
    'Give the founder verified project truth, evidence-based integration, explicit high-risk action gates, auditable execution, and recoverable provider-independent operations.',
  source: 'docs/VISION.md',
});

export const CONTROL_ROOM_GUARDRAILS: readonly Guardrail[] = Object.freeze([
  Object.freeze({
    id: 'FCR-AUTH-001',
    status: 'active',
    summary:
      'Founder project access requires session validation plus founder allowlist authorization.',
    evidence: ['src/http/middleware/requireFounder.ts'],
  }),
  Object.freeze({
    id: 'FCR-BOUNDARY-001',
    status: 'active',
    summary:
      'Privileged startup validates the code-owned Founder Control Room Supabase project identity and fails closed on mismatch.',
    evidence: [
      'src/lib/supabaseClient.ts',
      'src/lib/supabaseProjectIdentity.ts',
      'src/lib/__tests__/supabaseProjectIdentity.test.ts',
    ],
  }),
  Object.freeze({
    id: 'FCR-DATA-001',
    status: 'active',
    summary:
      'Signed provider events are reduced to typed, bounded, controller-required operational metadata before persistence.',
    evidence: [
      'src/http/webhooks/github.ts',
      'src/http/webhooks/sanitize.ts',
      'src/http/webhooks/__tests__/github.test.ts',
      'src/http/webhooks/__tests__/sanitize.test.ts',
    ],
  }),
  Object.freeze({
    id: 'FCR-APPROVAL-001',
    status: 'active',
    summary:
      'Evidence-backed merges may use standing founder authority; deployment, migration, rollback, auth, secrets, billing, deletion, and publication remain separate gates.',
    evidence: ['docs/FOUNDER_MERGE_AUTHORITY.md', 'GLOBAL_AI.md'],
  }),
  Object.freeze({
    id: 'FCR-PROVIDER-001',
    status: 'active',
    summary: 'Repository and AI providers remain replaceable adapters.',
    evidence: ['src/providers/RepositoryProvider.ts', 'docs/PROVIDERS.md'],
  }),
  Object.freeze({
    id: 'FCR-SECRET-001',
    status: 'active',
    summary:
      'Secrets, founder sessions, and private project payloads are excluded from public status responses.',
    evidence: ['src/http/server.ts'],
  }),
  Object.freeze({
    id: 'FCR-AUDIT-001',
    status: 'partial',
    summary:
      'Founder project reads fail closed on missing audit evidence, and provider-event persistence and status transitions reject silent or missing-row success; mutation atomicity and full provider-action coverage remain incomplete.',
    evidence: [
      'src/http/middleware/projectReadAudit.ts',
      'src/http/middleware/__tests__/projectReadAudit.test.ts',
      'src/events/inbox.ts',
      'src/events/__tests__/inbox.test.ts',
      'src/http/routes/projects.ts',
    ],
  }),
]);

export function publicGuardrailSnapshot() {
  return Object.freeze({
    version: '1.3.2',
    vision: CONTROL_ROOM_VISION,
    guardrails: CONTROL_ROOM_GUARDRAILS.map(({ id, status, summary }) => ({
      id,
      status,
      summary,
    })),
    sensitiveFieldsIncluded: false,
    standingMergeAuthority: true,
    approvalCarryForward: false,
  });
}

const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
});

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => HTML_ENTITIES[character] ?? character);
}

export function renderGuardrailStatusPage() {
  const snapshot = publicGuardrailSnapshot();
  const items = snapshot.guardrails
    .map(
      guardrail =>
        `<li data-guardrail-id="${escapeHtml(guardrail.id)}"><strong>${escapeHtml(guardrail.id)}</strong> <span>${escapeHtml(guardrail.status)}</span><p>${escapeHtml(guardrail.summary)}</p></li>`,
    )
    .join('');

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
      <h2>Guardrail contract</h2>
      <ul>${items}</ul>
    </section>
    <p data-testid="sensitive-status"><code>sensitiveFieldsIncluded=false</code></p>
    <p data-testid="merge-authority-status"><code>standingMergeAuthority=true</code></p>
    <p data-testid="approval-status"><code>approvalCarryForward=false</code></p>
  </main>
</body>
</html>`;
}
