import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const commandPath = path.resolve(process.cwd(), '.github/workflows/n8n-conveyor-probe-command.yml');
const liveProbePath = path.resolve(process.cwd(), '.github/workflows/n8n-conveyor-live-probe.yml');
const commandWorkflow = fs.readFileSync(commandPath, 'utf8');
const liveProbeWorkflow = fs.readFileSync(liveProbePath, 'utf8');

describe('n8n conveyor probe founder command contract', () => {
  it('accepts only the founder command on canonical downstream provider issue 299', () => {
    expect(commandWorkflow).toContain('issue_comment:');
    expect(commandWorkflow).toContain("github.event.issue.number == 299");
    expect(commandWorkflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(commandWorkflow).toContain("startsWith(github.event.comment.body, '/probe-n8n-conveyor ')");
    expect(commandWorkflow).toContain(
      'Expected exactly: /probe-n8n-conveyor <40-char-main-sha> <base64url-capability-plan-json>',
    );
    expect(commandWorkflow).toContain("re.fullmatch(r'[0-9a-f]{40}', sha)");
  });

  it('rejects authority drift before dispatching the live probe', () => {
    expect(commandWorkflow).toContain("plan.get('contract') != 'juss-v10/capability-plan@v1'");
    expect(commandWorkflow).toContain("plan.get('selectedBy') != 'chief-ai-machine'");
    expect(commandWorkflow).toContain("plan.get('projectSlug') != 'founder-control-room'");
    expect(commandWorkflow).toContain("plan.get('requestedAuthority') != 'draft'");
    expect(commandWorkflow).toContain("capability.get('id') != 'n8n-live-probe'");
    expect(commandWorkflow).toContain("capability.get('origin') != 'repo-native'");
    expect(commandWorkflow).toContain("capability.get('owner') != 'chief-ai-machine'");
    expect(commandWorkflow).toContain("capability.get('authorityCeiling') not in {'reason', 'draft'}");
    expect(commandWorkflow).toContain("str(plan.get('expectedHeadSha', '')).lower() != sha");
  });

  it('requires the requested SHA to remain current main immediately before dispatch', () => {
    expect(commandWorkflow).toContain('/git/ref/heads/main');
    expect(commandWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$TARGET_SHA"');
    expect(commandWorkflow.indexOf('Verify requested SHA is current main')).toBeLessThan(
      commandWorkflow.indexOf('Dispatch manual n8n conveyor live probe'),
    );
  });

  it('delegates only to the existing manual live probe and keeps secrets out of the bridge', () => {
    expect(commandWorkflow).toContain('actions: write');
    expect(commandWorkflow).toContain('/actions/workflows/n8n-conveyor-live-probe.yml/dispatches');
    expect(commandWorkflow).toContain('target_sha:$sha');
    expect(commandWorkflow).toContain('capability_plan_json:$plan');
    expect(commandWorkflow).not.toContain('N8N_CONVEYOR_WEBHOOK_URL');
    expect(commandWorkflow).not.toContain('N8N_CONVEYOR_BEARER_TOKEN');
    expect(commandWorkflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(commandWorkflow).not.toContain('secrets.');
    expect(commandWorkflow).not.toContain('wrangler deploy');
    expect(commandWorkflow).not.toContain('supabase db push');
    expect(commandWorkflow).not.toContain('api.buffer.com');
  });

  it('preserves the target workflow as manual-only and production-environment gated', () => {
    expect(liveProbeWorkflow).toContain('workflow_dispatch:');
    expect(liveProbeWorkflow).not.toMatch(/\npull_request:/);
    expect(liveProbeWorkflow).not.toMatch(/\npush:/);
    expect(liveProbeWorkflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(liveProbeWorkflow).toContain('environment: production');
    expect(liveProbeWorkflow).toContain('test "$(git rev-parse HEAD)" = "${N8N_CONVEYOR_PROBE_HEAD_SHA}"');
    expect(liveProbeWorkflow).toContain('FCR_V10_RECEIPT_PERSISTENCE_REQUIRED:');
    expect(liveProbeWorkflow).toContain('npx tsx scripts/verify-n8n-conveyor-live.ts');
    expect(liveProbeWorkflow).toContain('actions/upload-artifact@v4');
  });
});
