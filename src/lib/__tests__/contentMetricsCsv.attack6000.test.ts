import { describe, expect, it } from 'vitest';
import { parseContentMetricsCsv } from '../contentMetricsCsv.js';

const header = [
  'observation_id',
  'content_fingerprint',
  'provider',
  'account_id',
  'page_id',
  'audience_segment',
  'metric_name',
  'metric_value',
  'unit',
  'window_start',
  'window_end',
  'observed_at',
  'source',
  'source_ref',
].join(',');

const baseline = [
  'obs-attack',
  'fp-post-attack',
  'linkedin',
  'acct-fcr',
  'page-founder',
  'founders',
  'impressions',
  '42',
  'count',
  '2026-09-10T00:00:00Z',
  '2026-09-16T00:00:00Z',
  '2026-09-16T08:30:00Z',
  'linkedin_native_export',
  'export:attack',
];

type Mutation = (fields: string[], sequence: number) => string;

const mutations: readonly Mutation[] = [
  (f) => { f[0] = ''; return f.join(','); },
  (f) => { f[1] = ''; return f.join(','); },
  (f) => { f[2] = ''; return f.join(','); },
  (f) => { f[3] = ''; return f.join(','); },
  (f) => { f[4] = ''; return f.join(','); },
  (f) => { f[5] = ''; return f.join(','); },
  (f, n) => { f[6] = `unknown_metric_${n}`; return f.join(','); },
  (f) => { f[7] = '-1'; return f.join(','); },
  (f) => { f[7] = '1.5'; return f.join(','); },
  (f) => { f[7] = '9007199254740992'; return f.join(','); },
  (f) => { f[8] = 'percent'; return f.join(','); },
  (f) => { f[9] = '2026-09-10T00:00:00'; return f.join(','); },
  (f) => { f[10] = '2026-02-31T00:00:00Z'; return f.join(','); },
  (f) => { f[11] = '2026-09-16T25:30:00Z'; return f.join(','); },
  (f) => { f[11] = '2026-09-16T08:30:00+14:30'; return f.join(','); },
  (f) => { f[9] = '2026-09-17T00:00:00Z'; return f.join(','); },
  (f) => { f[11] = '2026-09-15T23:59:59Z'; return f.join(','); },
  (f) => { f[12] = ''; return f.join(','); },
  (f) => { f[13] = ''; return f.join(','); },
  (f) => { f.splice(5, 1); return f.join(','); },
  (f) => { f.push('unexpected'); return f.join(','); },
  (f) => { f[5] = '"founders"x'; return f.join(','); },
  (f) => { f[5] = '"unterminated'; return f.join(','); },
  (f) => { f[3] = '"acct\nforged"'; return f.join(','); },
  (f) => { f[9] = '2026-13-01T00:00:00Z'; return f.join(','); },
  (f) => { f[10] = '2026-09-16T00:60:00Z'; return f.join(','); },
  (f) => { f[11] = '2026-09-16T08:30:60Z'; return f.join(','); },
  (f) => { f[11] = '2026-09-16T08:30:00+15:00'; return f.join(','); },
  (f, n) => { f[0] = `obs-${n}`; f[7] = '+' + n; return f.join(','); },
  (f, n) => { f[0] = `obs-${n}`; f[8] = n % 2 === 0 ? 'COUNT' : 'Count'; return f.join(','); },
];

describe('content metrics CSV Attack-6000', () => {
  it('rejects exactly 6,000 deterministic malformed identity, value, timestamp, schema, and CSV-shape cases', () => {
    const accepted: Array<{ index: number; family: number; row: string }> = [];
    let generated = 0;

    for (let sequence = 0; sequence < 200; sequence += 1) {
      for (let family = 0; family < mutations.length; family += 1) {
        const fields = [...baseline];
        fields[0] = `obs-${sequence}-${family}`;
        const row = mutations[family]!(fields, sequence);
        generated += 1;
        try {
          parseContentMetricsCsv(`${header}\n${row}`);
          accepted.push({ index: generated - 1, family, row });
        } catch {
          // Expected: every attack case must fail closed.
        }
      }
    }

    expect(generated).toBe(6000);
    expect(accepted).toEqual([]);
  });
});
