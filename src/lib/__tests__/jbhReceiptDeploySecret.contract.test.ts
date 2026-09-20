import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const wrangler = readFileSync(resolve(process.cwd(), 'wrangler.worker.toml'), 'utf8');
const receiver = readFileSync(resolve(process.cwd(), 'src/http/routes/hairCommerceReceipts.ts'), 'utf8');

describe('JBH commerce receipt deploy contract', () => {
  it('requires every runtime receipt secret used by the receiver', () => {
    expect(receiver).toContain('process.env.JBH_RECEIPT_INGEST_TOKEN');
    expect(wrangler).toContain('"JBH_RECEIPT_INGEST_TOKEN"');
  });

  it('keeps the token provider-held rather than a public-safe var', () => {
    const varsBlock = wrangler.split('[vars]')[1]?.split('[secrets]')[0] ?? '';
    expect(varsBlock).not.toContain('JBH_RECEIPT_INGEST_TOKEN');
  });
});
