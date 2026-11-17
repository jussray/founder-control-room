import { posix } from 'node:path';

// Same-origin script/stylesheet references in a packaged HTML page, resolved to
// output-root-relative paths. Relative URLs resolve against the page's own
// directory; query strings and fragments are stripped before the file check.
// External, protocol-relative, data:, and fragment-only references are skipped.
// A reference that resolves above the output root is reported as escaping.
export function localAssetReferences(markup, pagePath) {
  const pageDir = posix.dirname(pagePath.replace(/^\/+/, ''));
  const results = [];
  for (const match of markup.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
    const pathOnly = raw.replace(/[?#].*$/, '');
    if (!pathOnly) continue;
    // Normalize without a leading slash so '..' above the root stays visible instead of clamping.
    const joined = pathOnly.startsWith('/') ? pathOnly.replace(/^\/+/, '') : posix.join(pageDir, pathOnly);
    const normalized = posix.normalize(joined || '.');
    const escapes = normalized === '..' || normalized.startsWith('../');
    results.push({ reference: raw, path: normalized === '.' ? '' : normalized, escapes });
  }
  return results;
}
