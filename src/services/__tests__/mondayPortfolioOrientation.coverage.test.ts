import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient.js', () => ({ makeSupabaseClient: vi.fn() }));
vi.mock('../../providers/providerFactory.js', () => ({ providerForProject: vi.fn() }));
import { loadMondayPortfolioEvidence } from '../mondayPortfolioOrientation.js';

describe('Monday orientation portfolio coverage', () => {
  it('selects the quiet project even when another has over 500 newer receipts and findings', async () => {
    const now = new Date('2026-10-05T12:00:00Z');
    type Row = Record<string, unknown>;
    const rows: Record<string, Row[]> = {
      projects: ['noisy', 'quiet'].map(id => ({ id, slug: id, repo_identifier: 'jussray/' + id, status: 'active' })),
      repository_verification_runs: [
        ...Array.from({ length: 501 }, (_, i) => ({
          id: String(i), project_id: 'noisy', scanned_at: new Date(+now - (i + 1) * 1000).toISOString(),
          received_at: '2026-10-05T11:59:59Z', overall_status: 'warning',
        })),
        { id: 'quiet-run', project_id: 'quiet', scanned_at: '2026-10-01T00:00:00Z',
          received_at: '2026-10-01T00:01:00Z', overall_status: 'warning' },
      ],
      repository_findings: [
        ...Array.from({ length: 501 }, (_, i) => ({
          id: 'n' + i, project_id: 'noisy', status: 'open', severity: 'low', last_seen_at: '2026-10-05T11:30:00Z',
        })),
        { id: 'q', project_id: 'quiet', status: 'open', severity: 'critical', last_seen_at: '2026-09-01T00:00:00Z' },
      ],
    };
    const scopes: string[] = [];
    const client = { from(table: string) {
      let data = [...rows[table]];
      const orders: Array<[string, boolean]> = [];
      let start = 0, end = Infinity;
      const q = {
        select() { return q; },
        eq(k: string, v: unknown) {
          data = data.filter(row => row[k] === v);
          if (k === 'project_id') scopes.push(table + ':' + v);
          return q;
        },
        in(k: string, v: unknown[]) { data = data.filter(row => v.includes(row[k])); return q; },
        order(k: string, opts: { ascending: boolean }) { orders.push([k, opts.ascending]); return q; },
        range(a: number, b: number) { start = a; end = b + 1; return q; },
        limit(n: number) { end = start + n; return q; },
        then(resolve: (result: { data: Row[]; error: null }) => unknown) {
          data.sort((a, b) => {
            for (const [k, asc] of orders) {
              const c = String(a[k]).localeCompare(String(b[k]));
              if (c) return asc ? c : -c;
            }
            return 0;
          });
          return Promise.resolve({ data: data.slice(start, end), error: null }).then(resolve);
        },
      };
      return q;
    } };
    const result = await loadMondayPortfolioEvidence(client as never, now);
    expect(result.verificationRuns.map(x => x.project_id).sort()).toEqual(['noisy', 'quiet']);
    expect(result.findings.find(x => x.project_id === 'quiet')?.severity).toBe('critical');
    expect(scopes).toContain('repository_verification_runs:quiet');
    expect(scopes).toContain('repository_findings:quiet');
    expect(result.currentHeads.size).toBe(0);
  });
});
