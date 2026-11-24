// A static report is evidence for review, never authorization to execute.
// Call only with reports from a separately trusted, isolated scanner process.
export function reviewStaticScan(report, exitCode) {
  const reasons = [];
  if (exitCode !== 0) reasons.push('scanner-exit');
  if (report?.execution_successful !== true) reasons.push('scanner-incomplete');
  if (report?.analysis_completeness?.status !== 'complete' || report?.analysis_completeness?.is_complete !== true) reasons.push('coverage-incomplete');
  if (report?.metadata?.llm_requested !== false || typeof report?.metadata?.skillspector_version !== 'string' || !report.metadata.skillspector_version.trim()) reasons.push('scope-unverified');
  const risk = report?.risk_assessment;
  if (risk?.recommendation !== 'SAFE' || risk?.severity !== 'LOW' || !Number.isFinite(risk?.score) || risk.score !== 0) reasons.push('risk-not-clean');
  if (!Array.isArray(report?.issues) || report.issues.length !== 0) reasons.push('findings-present-or-unknown');
  if (report?.suppressed !== undefined && (!Array.isArray(report.suppressed) || report.suppressed.length !== 0)) reasons.push('suppression-present-or-unknown');
  if (!Array.isArray(report?.components) || !report.components.some(component => /(^|\/)SKILL\.md$/i.test(component?.path ?? '')) || report?.skills !== undefined) reasons.push('single-skill-scope-unverified');
  return { staticReviewPassed: reasons.length === 0, executionAllowed: false, reasons };
}
