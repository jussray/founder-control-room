import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const fail = (message) => {
  console.error(`ASSET CONTINUITY FAIL: ${message}`);
  process.exitCode = 1;
};
const requireString = (value, label) => {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
};
const requireStringArray = (value, label) => {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    fail(`${label} must be a non-empty string array`);
  }
};

const registryPath = 'config/asset-continuity.portfolio.json';
const inheritancePath = 'config/founder-intelligence.inheritance.json';
const contractPath = 'docs/ASSET_CONTINUITY_GLOBAL_V1.md';
const skillPath = 'skills/asset-continuity/SKILL.md';
const templatePath = 'config/asset-continuity.manifest.template.json';

for (const requiredPath of [registryPath, inheritancePath, contractPath, skillPath, templatePath]) {
  if (!fs.existsSync(path.join(root, requiredPath))) fail(`missing required file ${requiredPath}`);
}

const registry = readJson(registryPath);
const inheritance = readJson(inheritancePath);
const template = readJson(templatePath);

if (registry.schemaVersion !== 1) fail('portfolio registry schemaVersion must equal 1');
if (template.schemaVersion !== 1) fail('manifest template schemaVersion must equal 1');
requireString(registry.authorityRepository, 'registry.authorityRepository');
requireString(registry.canonicalContract, 'registry.canonicalContract');
requireString(registry.canonicalSkill, 'registry.canonicalSkill');
requireString(registry.defaultManifestPath, 'registry.defaultManifestPath');
requireString(registry.truthBoundary, 'registry.truthBoundary');

const allowedStatuses = new Set(['required', 'conditional', 'external-reference', 'blocked']);
const allRegistryEntries = [...(registry.projects || []), ...(registry.externalCoverage || [])];
const byRepository = new Map();
for (const entry of allRegistryEntries) {
  requireString(entry.repository, 'asset registry repository');
  requireString(entry.slug, `${entry.repository}.slug`);
  requireString(entry.status, `${entry.repository}.status`);
  requireString(entry.manifestPath, `${entry.repository}.manifestPath`);
  if (!allowedStatuses.has(entry.status)) fail(`${entry.repository} has unsupported status ${entry.status}`);
  if (byRepository.has(entry.repository)) fail(`duplicate asset continuity entry for ${entry.repository}`);
  byRepository.set(entry.repository, entry);
}

const governed = inheritance.projects || [];
for (const project of governed) {
  if (!byRepository.has(project.repository)) {
    fail(`governed repository ${project.repository} is missing asset continuity classification`);
  }
}

const externalCoverage = inheritance.externalChallengeStackCoverage || [];
for (const project of externalCoverage) {
  if (!byRepository.has(project.repository)) {
    fail(`external continuity repository ${project.repository} is missing asset continuity classification`);
  }
}

for (const entry of registry.projects || []) {
  if (entry.visualSurface === true && entry.status !== 'required' && entry.status !== 'external-reference' && entry.status !== 'blocked') {
    fail(`${entry.repository} declares visualSurface=true but status=${entry.status}; visual projects must be required/external-reference/blocked`);
  }
  if (entry.status === 'required' && typeof entry.nextGate !== 'string') {
    fail(`${entry.repository} requires asset continuity but has no nextGate`);
  }
}

const templateAsset = template.assets?.[0];
if (!templateAsset) fail('manifest template must include at least one example asset');
else {
  requireString(templateAsset.id, 'template asset id');
  requireString(templateAsset.kind, 'template asset kind');
  requireString(templateAsset.role, 'template asset role');
  requireString(templateAsset.continuityClass, 'template asset continuityClass');
  requireString(templateAsset.replacementPolicy, 'template asset replacementPolicy');
  requireStringArray(templateAsset.allowedTransformations, 'template asset allowedTransformations');
  requireStringArray(templateAsset.prohibitedSubstitutions, 'template asset prohibitedSubstitutions');
  requireStringArray(templateAsset.runtimeRefs, 'template asset runtimeRefs');
  requireStringArray(templateAsset.invalidationConditions, 'template asset invalidationConditions');
}

const contract = fs.readFileSync(path.join(root, contractPath), 'utf8');
const skill = fs.readFileSync(path.join(root, skillPath), 'utf8');
const requiredContractPhrases = [
  'The project identity must survive at the asset layer.',
  'GRAPHIC_CONTINUITY_REGRESSION',
  'CROSS_PROJECT_COLLAPSE',
  'A written description cannot silently override a stronger approved visual artifact.'
];
for (const phrase of requiredContractPhrases) {
  if (!contract.includes(phrase)) fail(`global contract missing invariant phrase: ${phrase}`);
}
for (const phrase of ['Source authority:', 'Manifest:', 'Graphic continuity result:', 'Rollback:', 'Next gate:']) {
  if (!skill.includes(phrase)) fail(`asset continuity skill missing output field: ${phrase}`);
}

if (process.argv.includes('--manifest')) {
  const manifestArgIndex = process.argv.indexOf('--manifest') + 1;
  const manifestRelative = process.argv[manifestArgIndex];
  if (!manifestRelative) fail('--manifest requires a path');
  else {
    const manifestFullPath = path.join(root, manifestRelative);
    if (!fs.existsSync(manifestFullPath)) fail(`manifest not found: ${manifestRelative}`);
    else {
      const manifest = readJson(manifestRelative);
      if (manifest.schemaVersion !== 1) fail(`${manifestRelative} schemaVersion must equal 1`);
      requireString(manifest.project, `${manifestRelative}.project`);
      requireString(manifest.surface, `${manifestRelative}.surface`);
      if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) fail(`${manifestRelative} must contain assets`);
      const ids = new Set();
      for (const asset of manifest.assets || []) {
        requireString(asset.id, `${manifestRelative} asset id`);
        if (ids.has(asset.id)) fail(`${manifestRelative} duplicate asset id ${asset.id}`);
        ids.add(asset.id);
        requireString(asset.kind, `${asset.id}.kind`);
        requireString(asset.role, `${asset.id}.role`);
        if (!['canonical', 'supporting', 'derived'].includes(asset.continuityClass)) fail(`${asset.id}.continuityClass invalid`);
        requireString(asset.replacementPolicy, `${asset.id}.replacementPolicy`);
        requireStringArray(asset.prohibitedSubstitutions, `${asset.id}.prohibitedSubstitutions`);
        requireStringArray(asset.runtimeRefs, `${asset.id}.runtimeRefs`);
        requireStringArray(asset.invalidationConditions, `${asset.id}.invalidationConditions`);

        if (asset.location?.type === 'local') {
          requireString(asset.location.path, `${asset.id}.location.path`);
          const localFullPath = path.join(root, asset.location.path);
          if (!fs.existsSync(localFullPath)) fail(`${asset.id} local asset missing: ${asset.location.path}`);
          const expectedHash = asset.location.sha256;
          if (typeof expectedHash === 'string' && /^[a-f0-9]{64}$/i.test(expectedHash)) {
            const actualHash = crypto.createHash('sha256').update(fs.readFileSync(localFullPath)).digest('hex');
            if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) fail(`${asset.id} sha256 drift: ${asset.location.path}`);
          }
        }
      }
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`ASSET CONTINUITY PASS: ${governed.length} governed repositories + ${externalCoverage.length} external continuity repositories classified; manifest template and global invariants valid`);
