import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./dispatch.ts', import.meta.url), 'utf8');

describe('founder content dispatch execution-order contract', () => {
  it('reserves the exact authorization before building the provider request', () => {
    const reserve = source.indexOf(".from('approval_executions')\n    .insert({");
    const executionId = source.indexOf('const executionId = String(reservation.id);');
    const providerPayload = source.indexOf("event_type: 'first_party_founder_content_schedule'");
    const requestHash = source.indexOf('const requestHash = sha256(body);');
    const providerFetch = source.indexOf("const response = await (options.fetchImpl ?? fetch)(hookUrl");

    expect(reserve).toBeGreaterThan(-1);
    expect(executionId).toBeGreaterThan(reserve);
    expect(providerPayload).toBeGreaterThan(executionId);
    expect(requestHash).toBeGreaterThan(providerPayload);
    expect(providerFetch).toBeGreaterThan(requestHash);
  });

  it('binds the body to the durable FCR execution UUID before external dispatch', () => {
    expect(source).toContain('founder_content_execution_id: executionId');
    expect(source).toContain('provider_request_hash: requestHash');
    expect(source).toContain(".eq('status', 'pending')");
    expect(source).toContain("'x-founder-content-execution-id': executionId");
  });

  it('keeps sauce-bearing internal evidence out of the provider payload', () => {
    const payloadStart = source.indexOf('const payload = {');
    const payloadEnd = source.indexOf('const body = JSON.stringify(payload);');
    const payload = source.slice(payloadStart, payloadEnd);

    expect(payload).not.toContain('internal_evidence');
    expect(payload).not.toContain('raw_diff');
    expect(payload).not.toContain('private_metrics');
    expect(payload).not.toContain('unreleased_roadmap');
    expect(payload).not.toContain('customer_private_data');
    expect(payload).not.toContain('security_sensitive_details');
    expect(payload).not.toContain('private_prompt');
    expect(payload).not.toContain('chain_of_thought');
  });

  it('never upgrades hook acceptance into provider execution proof', () => {
    expect(source).toContain('providerExecutionProven: false');
    expect(source).not.toContain('providerExecutionProven: true');
    expect(source).toContain('FOUNDER_CONTENT_AUDIT_INCOMPLETE');
    expect(source).toContain('do not retry automatically');
  });
});
