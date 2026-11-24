import { pathToFileURL } from 'node:url';
import { runStaticScan } from './external-skill-runner.mjs';
import { reviewStaticScan } from './external-skill-scan-gate.mjs';

// Local operator entry point. A review receipt is not an authorization or signature.
const SCANNER_VERSION = '2.13.7';
const blocked = reasons => ({ status: 'blocked', executionAllowed: false, reasons });
export function runSkillReview(input, scan = runStaticScan) {
  if (!input || !/^[a-f0-9]{64}$/.test(input.artifactSha256 ?? '') || !/^skillspector@sha256:[a-f0-9]{64}$/.test(input.image ?? '')) return blocked(['invalid-scope']);
  try {
    const result = scan(input);
    if (result?.status !== 'report-received') return blocked(['scanner-unavailable-or-failed']);
    if (result.artifactSha256 !== input.artifactSha256 || result.image !== input.image || !/^[a-f0-9]{64}$/.test(result.reportSha256 ?? '')) return blocked(['evidence-mismatch']);
    if (result.report?.metadata?.skillspector_version !== SCANNER_VERSION) return blocked(['scanner-version-mismatch']);
    const decision = reviewStaticScan(result.report, 0);
    return {
      status: decision.staticReviewPassed ? 'static-review-passed' : 'blocked',
      executionAllowed: false,
      artifactSha256: result.artifactSha256,
      scannerImage: result.image,
      scannerVersion: SCANNER_VERSION,
      reportSha256: result.reportSha256,
      reasons: decision.reasons,
    };
  } catch { return blocked(['review-failed']); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [archive, artifactSha256, image, ...extra] = process.argv.slice(2);
  const result = extra.length || !archive ? blocked(['invalid-arguments']) : runSkillReview({ archive, artifactSha256, image });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.status === 'static-review-passed' ? 0 : 1;
}
