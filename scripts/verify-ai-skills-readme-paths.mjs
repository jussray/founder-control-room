import {readFileSync, realpathSync, statSync} from 'node:fs';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), '..');

// README paths are .ai-skills/-relative except explicitly root-relative prefixes.
function resolveReadmePath(value, root) {
  const clean = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  const fromRoot = /^(?:\.ai-skills\/|src\/)/.test(clean);
  const absolute = resolve(root, fromRoot ? clean : '.ai-skills/' + clean);
  const withinRoot = absolute === root || (!relative(root, absolute).startsWith('..' + sep) && relative(root, absolute) !== '..' && !isAbsolute(relative(root, absolute)));
  if (!withinRoot) return false;
  try {
    if (!statSync(absolute).isFile() && !statSync(absolute).isDirectory()) return false;
    const realRoot = realpathSync(root);
    const realTarget = realpathSync(absolute);
    return realTarget === realRoot || realTarget.startsWith(realRoot + sep);
  } catch {
    return false;
  }
}

export function findMissingLocalPaths(markdown, repoRoot = defaultRoot) {
  const root = resolve(repoRoot);
  const text = markdown.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*(?:\n|$)/gm, '\n');
  const references = [];

  // Local Markdown links: skip fragments, URLs and email addresses.
  for (const match of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const destination = match[1];
    if (!/^(?:https?:|mailto:|#|data:)/i.test(destination)) references.push({index: match.index, value: destination});
  }

  // Inline-code references: exclude command labels, opaque package IDs and prose.
  for (const match of text.matchAll(/(?<!`)`([^`\r\n]+)`(?!`)/g)) {
    const value = match[1].trim();
    const explicitPath = /^(?:\.ai-skills\/|src\/|skills\/|gpts\/|\.\.?\/)/.test(value);
    const hasFileExtension = /\.(?:md|mjs|cjs|js|ts|tsx|json|ya?ml|html|css|png|svg)$/.test(value);
    const directoryPath = value.endsWith('/') && !value.startsWith('/');
    if (!value.includes(' ') && !value.includes('@') && (explicitPath || hasFileExtension || directoryPath)) {
      references.push({index: match.index, value});
    }
  }

  const seen = new Set();
  const missing = [];
  for (const {value} of references.sort((a,b) => a.index-b.index)) {
    if (seen.has(value)) continue;
    seen.add(value);
    if (!resolveReadmePath(value, root)) missing.push(value);
  }
  return missing;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const readme = readFileSync(resolve(defaultRoot, '.ai-skills/README.md'), 'utf8');
  const missing = findMissingLocalPaths(readme, defaultRoot);
  if (missing.length) {
    console.error('AI Skills README: nonexistent or out-of-repository local paths:');
    for (const value of missing) console.error(' - ' + value);
    process.exitCode = 1;
  } else {
    console.log('AI Skills README local paths: PASS (all referenced local files and directories exist).');
  }
}
