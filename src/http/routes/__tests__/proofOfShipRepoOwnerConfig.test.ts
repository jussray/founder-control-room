import { afterEach, describe, expect, it } from 'vitest';
import { ProofOfShipReceiptError } from '../../../proofOfShip/receipt.js';
import { normalizeSourceRepo } from '../proofOfShipReceipts.js';

describe('proof-of-ship founder repository owner configuration', () => {
  const originalOwners = process.env.FOUNDER_GITHUB_OWNERS;

  afterEach(() => {
    if (originalOwners === undefined) delete process.env.FOUNDER_GITHUB_OWNERS;
    else process.env.FOUNDER_GITHUB_OWNERS = originalOwners;
  });

  it('defaults to the current personal owner and rejects an unconfigured owner', () => {
    delete process.env.FOUNDER_GITHUB_OWNERS;

    expect(normalizeSourceRepo('jussray', 'founder-control-room')).toBe(
      'jussray/founder-control-room',
    );
    expect(() => normalizeSourceRepo('future-org', 'founder-control-room')).toThrowError(
      new ProofOfShipReceiptError('invalid_source_repo'),
    );
  });

  it('supports an explicit overlap window for personal-to-organization migration', () => {
    process.env.FOUNDER_GITHUB_OWNERS = 'jussray, future-org';

    expect(normalizeSourceRepo('jussray', 'founder-control-room')).toBe(
      'jussray/founder-control-room',
    );
    expect(normalizeSourceRepo('future-org', 'founder-control-room')).toBe(
      'future-org/founder-control-room',
    );
  });

  it('fails closed on malformed configured owner values', () => {
    process.env.FOUNDER_GITHUB_OWNERS = 'jussray, not valid';

    expect(() => normalizeSourceRepo('jussray', 'founder-control-room')).toThrowError(
      new ProofOfShipReceiptError('invalid_source_repo'),
    );
  });
});
