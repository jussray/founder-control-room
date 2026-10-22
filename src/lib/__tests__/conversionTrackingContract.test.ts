import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contract = JSON.parse(
  readFileSync('config/conversion-tracking.contract.json', 'utf8'),
);
const worker = readFileSync('workers/jussco-conversions/worker.js', 'utf8');
const schema = readFileSync('workers/jussco-conversions/schema.sql', 'utf8');

describe('portfolio conversion tracking contract', () => {
  it('locks the four approved conversion events', () => {
    expect(contract.eventNames).toEqual([
      'call_click',
      'whatsapp_click',
      'pickup_request',
      'directions_click',
    ]);

    for (const eventName of contract.eventNames) {
      expect(worker).toContain(eventName);
      expect(schema).toContain(eventName);
    }
  });

  it('stores only minimal business interaction context', () => {
    expect(contract.allowedPayloadFields).toEqual([
      'project',
      'event_name',
      'page_path',
      'cta_location',
      'service_context',
      'occurred_at',
    ]);

    for (const forbidden of [
      'CF-Connecting-IP',
      'User-Agent',
      'Cookie',
      'browser_fingerprint',
      'device_id',
      'phone_number',
      'message_text',
      'user_id',
    ]) {
      expect(worker).not.toContain(forbidden);
      expect(schema).not.toContain(forbidden);
    }
  });

  it('does not silently delete conversion history', () => {
    expect(contract.retention.automaticDeletionEnabled).toBe(false);
    expect(contract.retention.deletionRequiresExplicitFounderApproval).toBe(true);
    expect(worker).not.toMatch(/DELETE\s+FROM\s+conversion_events/i);
  });

  it('pins the deployed Cloudflare D1 binding and health probe', () => {
    expect(contract.storage.workerName).toBe('jussco-conversions');
    expect(contract.storage.databaseName).toBe('jussco-conversions');
    expect(contract.storage.databaseId).toBe('3b77c3d5-4068-4597-9d97-96009d339e73');
    expect(contract.storage.bindingName).toBe('DB');
    expect(worker).toContain("SELECT 1 AS ok");
  });

  it('maps Pappa Razzy routes to the approved four events', () => {
    expect(contract.projects['pappa-razzy-laundry'].redirectRoutes).toEqual({
      call_click: '/pappa/call',
      whatsapp_click: '/pappa/whatsapp',
      pickup_request: '/pappa/pickup',
      directions_click: '/pappa/directions',
    });

    expect(worker).toContain('pappa-razzy-laundry');
    expect(worker).toContain('https://pappa-razzy-laundry.p9s5nbwqyt.chatgpt.site');
  });
});
