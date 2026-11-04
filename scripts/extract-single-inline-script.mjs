/**
 * Parse the one source-owned, attribute-free inline <script> element in
 * public/control-room/github-workspace.html for syntax verification.
 *
 * This is a strict source-contract extractor, NOT an HTML sanitizer or parser
 * for arbitrary/untrusted markup. Ambiguity fails closed; HTML must be served
 * with its existing CSP, browser protections, and founder authentication.
 *
 * Use case-insensitive ASCII tag comparison instead of filtering HTML using a
 * regexp, which is unsafe for mixed-case tags.
 */
export function extractSingleInlineScript(html) {
  if (typeof html !== 'string') return null;
  const lower = html.toLowerCase();
  const openToken = '<script>';
  const closeToken = '</script>';
  const open = lower.indexOf('<script');
  if (open < 0 || lower.slice(open, open + openToken.length) !== openToken) return null;

  const bodyStart = open + openToken.length;
  const close = lower.indexOf('</script', bodyStart);
  if (close < 0 || lower.slice(close, close + closeToken.length) !== closeToken) return null;

  // A second opener or closer creates ambiguous script ownership.
  // Reject, don't silently syntax-check only one of multiple scripts.
  if (lower.indexOf('<script', bodyStart) !== -1) return null;
  if (lower.indexOf('</script', close + closeToken.length) !== -1) return null;

  return html.slice(bodyStart, close);
}
