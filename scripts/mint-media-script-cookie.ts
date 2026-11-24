import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMediaProofCookie,
  mediaContinuityDigest,
  type MediaContinuityInput,
} from '../src/lib/mediaContinuity.js';
import { evaluateMediaMissionContinuity } from '../src/lib/mediaMissionContinuity.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'media/truthmode-live-action-founder-video.json');
const outputPath = resolve(root, '.proof/media-script-cookie.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, any>;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

const headSha = text(process.env.GITHUB_SHA || process.argv[2]).toLowerCase();
requireValue(/^[0-9a-f]{40}$/.test(headSha), 'exact 40-character GITHUB_SHA (or argv[2]) is required');
requireValue(manifest.schemaVersion === 1, 'media script manifest schemaVersion must be 1');
requireValue(manifest.contract === 'founder-control-room/media-script-manifest@v1', 'unsupported media script manifest contract');
requireValue(text(manifest.projectId), 'projectId is required');
requireValue(text(manifest.missionId), 'missionId is required');
requireValue(text(manifest.founderIntentId), 'founderIntentId is required');
requireValue(manifest.direction?.liveActionOnly === true, 'live-action-only direction is required');
requireValue(manifest.direction?.avatarImpersonation === false, 'avatar impersonation must remain false');
requireValue(manifest.direction?.noAnimatedExplainer === true, 'animated explainer cannot replace the live-action direction');
requireValue(manifest.authority?.draft === true, 'draft authority must be explicit');
requireValue(manifest.authority?.render === false, 'script stage cannot grant render authority');
requireValue(manifest.authority?.publish === false, 'script stage cannot grant publish authority');
requireValue(manifest.authority?.sendExternal === false, 'script stage cannot grant external-send authority');
requireValue(manifest.authority?.billingChange === false, 'script stage cannot grant billing authority');
requireValue(manifest.renderStack?.renderAuthorized === false, 'render stack must remain unauthorized at script stage');
requireValue(manifest.runtime?.renderExecuted === false, 'script stage cannot claim a render occurred');
requireValue(manifest.truthReview?.status === 'reviewed', 'TruthMode review must be completed before script_verified');
requireValue(manifest.truthReview?.reviewer === 'truthmode', 'TruthMode must remain the script reviewer');
requireValue(manifest.script?.truthDisclosure?.caption === 'NOT FULLY LAUNCHED YET.', 'script must disclose that FCR is not fully launched');

const claims = Array.isArray(manifest.truthReview?.publicClaims) ? manifest.truthReview.publicClaims : [];
requireValue(claims.length > 0, 'at least one public claim classification is required');
for (const claim of claims) {
  requireValue(['VERIFIED', 'INFERRED', 'UNKNOWN', 'BLOCKED'].includes(claim?.classification), 'every public claim needs a TruthMode classification');
  if (claim.classification === 'VERIFIED') {
    requireValue(strings(claim.evidenceRefs).length > 0, `VERIFIED claim lacks evidenceRefs: ${text(claim.claim)}`);
  }
}

const futureCapability = claims.find((claim: any) => text(claim.claim).includes('Once fully launched'));
requireValue(futureCapability?.classification === 'INFERRED', 'future capability must remain INFERRED at script stage');
const renderClaim = claims.find((claim: any) => text(claim.claim).includes('rendered, published'));
requireValue(renderClaim?.classification === 'UNKNOWN', 'render/publication/customer-outcome claim must remain UNKNOWN before outcome evidence');

const observedAt = new Date().toISOString();
const expiresAt = new Date(Date.parse(observedAt) + 30 * 60 * 1000).toISOString();
const evidenceRefs = [
  ...strings(manifest.evidenceRefs),
  `github:commit:${headSha}`,
  `supabase:founder-intent:${text(manifest.founderIntentId)}`,
  `supabase:mission:${text(manifest.missionId)}`,
];

const current: MediaContinuityInput = {
  source: 'chatgpt',
  projectSlug: text(manifest.projectSlug),
  repositoryFullName: text(manifest.repositoryFullName),
  targetBranch: text(manifest.targetBranch),
  targetSha: headSha,
  missionId: text(manifest.missionId),
  intentFingerprint: mediaContinuityDigest(manifest.intent),
  subjectFingerprint: mediaContinuityDigest(manifest.subject),
  scriptFingerprint: mediaContinuityDigest(manifest.script),
  promptFingerprint: mediaContinuityDigest(manifest.direction),
  sourceAssetFingerprints: [],
  intelligenceFingerprint: mediaContinuityDigest(manifest.intelligence),
  renderStackFingerprint: mediaContinuityDigest(manifest.renderStack),
  runtimeFingerprint: mediaContinuityDigest(manifest.runtime),
  outputFingerprint: null,
  reviewFingerprint: mediaContinuityDigest(manifest.truthReview),
  authorityFingerprint: mediaContinuityDigest(manifest.authority),
  evidenceState: 'script_verified',
  evidenceRefs,
  observedAt,
  expiresAt,
  predecessorFingerprint: null,
};

const cookie = createMediaProofCookie(current);
const gate = evaluateMediaMissionContinuity({
  projectId: text(manifest.projectId),
  missionId: text(manifest.missionId),
  expectedHeadSha: headSha,
  cookie,
  current,
  now: observedAt,
});

requireValue(gate.status === 'pass', `script cookie mission gate blocked: ${gate.reasons.join(', ')}`);
requireValue(gate.continuityVerified === true, 'script continuity must be verified');
requireValue(gate.outcomeVerified === false, 'script continuity must not become outcome verification');
requireValue(gate.publishAuthorized === false, 'script continuity must not become publish authority');
requireValue(gate.evidence?.kind === 'media_continuity', 'script gate must emit media_continuity evidence');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  contract: 'founder-control-room/media-script-cookie-receipt@v1',
  generatedAt: observedAt,
  expiresAt,
  projectId: text(manifest.projectId),
  founderIntentId: text(manifest.founderIntentId),
  missionId: text(manifest.missionId),
  exactHeadSha: headSha,
  manifestPath: 'media/truthmode-live-action-founder-video.json',
  cookie,
  gate,
}, null, 2)}\n`, 'utf8');

console.log(`media mission: ${text(manifest.missionId)}`);
console.log(`exact head: ${headSha}`);
console.log(`cookie: ${cookie.cookieId}`);
console.log(`label: ${gate.cookieLabel}`);
console.log(`continuity: ${gate.continuityState}`);
console.log(`next stage: ${gate.nextStage ?? 'none'}`);
console.log('outcome verified: false');
console.log('publish authorized: false');
