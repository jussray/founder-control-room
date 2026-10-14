import { access, readFile } from 'node:fs/promises';

const staticAssets = [
  'public/control-room/capabilities.html',
  'public/control-room/capabilities.css',
  'public/control-room/capabilities.js',
];

await Promise.all(staticAssets.map((file) => access(new URL(`../${file}`, import.meta.url))));

try {
  await access(new URL('../public/control-room/capability-registry.js', import.meta.url));
  throw new Error('Capability registry must not be shipped as a public static asset');
} catch (error) {
  if (error instanceof Error && error.message === 'Capability registry must not be shipped as a public static asset') throw error;
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
}

const app = await readFile(new URL('../public/control-room/capabilities.js', import.meta.url), 'utf8');
for (const boundary of [
  "fetch('/capabilities'",
  'Copy only. No action runs from this screen.',
  'replaceAll',
]) {
  if (!app.includes(boundary)) throw new Error(`Missing workbench boundary: ${boundary}`);
}
if (app.includes('capability-registry')) {
  throw new Error('Static workbench must not import a public capability registry');
}

const route = await readFile(new URL('../src/http/routes/capabilities.ts', import.meta.url), 'utf8');
for (const boundary of ['requireFounder', "res.set('Cache-Control', 'no-store')"]) {
  if (!route.includes(boundary)) throw new Error(`Missing server authority boundary: ${boundary}`);
}

// Regression for the mobile CSS newline-escape defect: a literal backslash-n
// before @media causes the browser to drop the expected responsive rules.
const css = await readFile(new URL('../public/control-room/capabilities.css', import.meta.url), 'utf8');
if (/\\n(?:\/\*|@media)/.test(css)) {
  throw new Error('CSS_ESCAPE_SEQUENCE_IN_STYLESHEET: use actual newlines before responsive rules');
}
for (const boundary of [
  '@media(max-width:900px){.workspace{grid-template-columns:minmax(0,1fr)}',
  '.detail code{overflow-wrap:anywhere}',
  '@media(max-width:560px){.contract>div{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}',
]) {
  if (!css.includes(boundary)) throw new Error(`Missing responsive workbench boundary: ${boundary}`);
}

console.log('Capability workbench static boundary verified');
