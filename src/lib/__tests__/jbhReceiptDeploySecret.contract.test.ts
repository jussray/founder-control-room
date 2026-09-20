import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const receiver = readFileSync(resolve(process.cwd(), 'src/http/routes/hairCommerceReceipts.ts'), 'utf8');

describe('JBH commerce receipt receiver boundary', () => {
  it('fails closed when the server-held receipt token is not configured', () => {
    expect(receiver).toContain('process.env.JBH_RECEIPT_INGEST_TOKEN');
    expect(receiver).toContain("return res.status(503).json({ error: 'Receipt ingest is not configured' });");
  });

  it('keeps the bearer server-side and compares the dedicated receipt header before receipt handling', () => {
    expect(receiver).toContain("req.get('x-jbh-receipt-token')");
    expect(receiver).toContain('tokenMatches(provided, expectedToken)');
    expect(receiver).toContain('timingSafeEqual');
    expect(receiver).not.toContain('NEXT_PUBLIC_JBH_RECEIPT_INGEST_TOKEN');
  });
});
