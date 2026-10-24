import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, 'config/mom8-public-challenge-v1.json'), 'utf8')) as {
  status: string;
  challenge: { days: number; steps: string[]; receiptRule: string };
  authorityBoundary: { mode: string; allowed: string[]; prohibited: string[] };
  continuity: { proofCookie: string; markersAreAuthority: boolean };
  publication: { repositoryPath: string; deploymentAuthorityGrantedByThisContract: boolean; socialPublishingAuthorityGrantedByThisContract: boolean };
};
const html = readFileSync(resolve(root, 'public/mom8/index.html'), 'utf8');

describe('MOM8 public challenge contract', () => {
  it('stays an eight-step non-financial proof challenge', () => {
    expect(contract.status).toBe('approved_nonfinancial_public_demo');
    expect(contract.challenge.days).toBe(8);
    expect(contract.challenge.receiptRule).toBe('one proof, one receipt');
    expect(contract.challenge.steps).toEqual(['build', 'fix', 'prove', 'ask', 'learn', 'earn', 'teach', 'compound']);
    expect(contract.authorityBoundary.mode).toBe('public_nonfinancial_only');
  });

  it('cannot silently acquire wallet, trading, deployment, or publishing authority', () => {
    expect(contract.authorityBoundary.prohibited).toEqual(expect.arrayContaining([
      'connect_wallet',
      'request_seed_phrase_or_private_key',
      'create_or_buy_token',
      'sell_or_trade_token',
      'move_funds',
      'promise_price_returns_ownership_or_revenue_share',
    ]));
    expect(contract.publication.deploymentAuthorityGrantedByThisContract).toBe(false);
    expect(contract.publication.socialPublishingAuthorityGrantedByThisContract).toBe(false);
    expect(contract.continuity.markersAreAuthority).toBe(false);
  });

  it('renders every proof step and the public safety boundary', () => {
    for (const step of contract.challenge.steps) expect(html).toContain(`data-proof-step="${step}"`);
    expect(html).toContain('PUBLIC DEMO • ZERO MONEY');
    expect(html).toContain('No wallet connection, buying, trading, token creation');
    expect(html).toContain('Do not use children’s names, faces, or private details.');
    expect(html).not.toMatch(/href=["']https?:\/\/(?:www\.)?pump\.fun/i);
  });
});
