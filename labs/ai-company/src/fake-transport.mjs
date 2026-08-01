export function createFakeTransport() {
  const calls = [];

  return {
    calls,
    dispatch({ platform, mode, content, eventId, now }) {
      const sequence = calls.length + 1;
      const receipt = {
        id: `lab-receipt-${sequence}`,
        provider: 'fake-buffer',
        platform,
        requestedMode: mode,
        status:
          mode === 'draft'
            ? 'simulated_draft'
            : mode === 'queue'
              ? 'simulated_queue'
              : 'simulated_publish',
        eventId,
        content,
        simulation: true,
        publicUrl: null,
        createdAt: now,
      };

      calls.push(receipt);
      return receipt;
    },
  };
}
