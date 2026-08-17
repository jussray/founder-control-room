import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/control-room/content-manager.html', 'utf8');

describe('temporal founder-content truth UI', () => {
  it('shows temporal truth as a separate fail-closed state', () => {
    expect(source).toContain('data-temporal-truth-state="unknown"');
    expect(source).toContain('Temporal truth UNKNOWN until claim check');
    expect(source).toContain('Historical progress stays labeled historical');
    expect(source).toContain('Current repository claims are revalidated at execution');
    expect(source).toContain('Runtime and metric claims require fresh live verifiers');
  });

  it('separates Current You authority from objective factual authority', () => {
    expect(source).toContain('Current You authorizes publication');
    expect(source).toContain('Objective evidence decides whether a current-state claim is still true');
    expect(source).toContain('Approval never changes the objective truth state underneath a claim');
    expect(source).toContain('temporal relabeling after approval invalidate');
  });

  it('describes first-party publication capability without claiming a completed external outcome', () => {
    expect(source).toContain('FCR owns the first-party LinkedIn actuator and one-shot execution gate');
    expect(source).toContain('any specific post outcome remain UNKNOWN');
    expect(source).toContain('Capability is not publication proof');
    expect(source).toContain('data-direct-publish-state="credential-unknown"');
    expect(source).not.toContain('Cambiante review-first content workflow');
  });

  it('makes once-true versus current truth legible', () => {
    expect(source).toContain('A stale claim, provider limit, authorization error, ambiguous write, or missing readback is BLOCKED or UNKNOWN.');
    expect(source).toContain('Historical truth stays historical; current truth must be re-observed.');
    expect(source).toContain('superseded claim');
  });

  it('preserves existing fail-closed Content Manager language', () => {
    expect(source).toContain('Founder progress contract ready');
    expect(source).toContain('Evidence UNKNOWN until proposal');
    expect(source).toContain('Sauce receipt UNKNOWN until proposal');
    expect(source).toContain('Exact-copy approval required');
    expect(source).toContain('Share-now is forbidden for this lane');
    expect(source).toContain('Missing metrics stay UNKNOWN');
    expect(source).toContain('analytics can improve later drafts, never authorize them');
    expect(source).toContain('Provider state stays external.');
  });
});
