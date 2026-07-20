import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal mock types matching the real inbox/outbox interface
const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockSubscribe = vi.fn();
const mockInsert = vi.fn().mockResolvedValue({ error: null });

const mockInbox = { subscribe: mockSubscribe, publish: mockPublish } as any;
const mockOutbox = { publish: mockPublish } as any;
const mockDb = { from: vi.fn().mockReturnValue({ insert: mockInsert }) } as any;

// We test the internal handler directly by extracting the subscribe callback
describe('ReconciliationConsumer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('subscribes to reconciliation.report on start', async () => {
    const { startReconciliationConsumer } = await import('../consumer.js');
    startReconciliationConsumer(mockInbox, mockOutbox, mockDb);
    expect(mockSubscribe).toHaveBeenCalledWith('reconciliation.report', expect.any(Function));
  });

  it('rejects payloads missing the service field', async () => {
    const { startReconciliationConsumer } = await import('../consumer.js');
    startReconciliationConsumer(mockInbox, mockOutbox, mockDb);

    // Extract the registered callback
    const callback = mockSubscribe.mock.calls[0][1];
    await callback({ timestamp: new Date().toISOString(), status: 'clean', drift: [] });

    // DB insert should NOT have been called with invalid payload
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('persists a valid clean report without publishing to outbox', async () => {
    const { startReconciliationConsumer } = await import('../consumer.js');
    startReconciliationConsumer(mockInbox, mockOutbox, mockDb);

    const callback = mockSubscribe.mock.calls[0][1];
    await callback({
      service: 'sekret-bip',
      timestamp: new Date().toISOString(),
      durationMs: 42,
      status: 'clean',
      drift: [],
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    // Clean report — outbox should NOT receive a drift event
    expect(mockPublish).not.toHaveBeenCalledWith('reconciliation.drift', expect.anything());
  });

  it('publishes reconciliation.drift to outbox when drift is detected', async () => {
    const { startReconciliationConsumer } = await import('../consumer.js');
    startReconciliationConsumer(mockInbox, mockOutbox, mockDb);

    const callback = mockSubscribe.mock.calls[0][1];
    await callback({
      service: 'l99-story-engine',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      status: 'drift_detected',
      drift: [{ type: 'schema_invalid', detail: 'story.json: missing properties' }],
    });

    expect(mockPublish).toHaveBeenCalledWith('reconciliation.drift', expect.objectContaining({
      service: 'l99-story-engine',
      driftCount: 1,
    }));
  });
});
