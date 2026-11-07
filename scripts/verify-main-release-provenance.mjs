import { mkdirSync, writeFileSync } from 'node:fs';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const MAIN_REF = 'refs/heads/main';

function normalized(value) {
  return String(value || '').trim();
}

function ownerDirectMainProvenance(directMainContext) {
  if (!directMainContext || typeof directMainContext !== 'object') return null;

  const eventName = normalized(directMainContext.eventName);
  const ref = normalized(directMainContext.ref);
  const actor = normalized(directMainContext.actor);
  const repositoryOwner = normalized(directMainContext.repositoryOwner);

  if (
    eventName !== 'push'
    || ref !== MAIN_REF
    || !actor
    || !repositoryOwner
    || actor.toLowerCase() !== repositoryOwner.toLowerCase()
  ) {
    return null;
  }

  return {
    ok: true,
    reason: 'founder_owner_direct_main_provenance',
    directMainActor: actor,
  };
}

export function classifyMainReleaseProvenance({
  targetSha,
  currentMainSha,
  associatedPulls,
  directMainContext = null,
}) {
  const target = normalized(targetSha).toLowerCase();
  const current = normalized(currentMainSha).toLowerCase();

  if (!FULL_SHA.test(target) || !FULL_SHA.test(current)) {
    return { ok: false, reason: 'invalid_sha' };
  }
  if (target !== current) {
    return { ok: false, reason: 'stale_target', targetSha: target, currentMainSha: current };
  }
  if (!Array.isArray(associatedPulls)) {
    return { ok: false, reason: 'associated_pulls_unavailable', targetSha: target };
  }

  const matches = associatedPulls.filter((pull) => {
    if (!pull || typeof pull !== 'object') return false;
    const baseRef = String(pull.base?.ref || '').trim();
    const mergeSha = String(pull.merge_commit_sha || '').trim().toLowerCase();
    return Boolean(pull.merged_at)
      && baseRef === 'main'
      && FULL_SHA.test(mergeSha)
      && mergeSha === target;
  });

  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous_pr_provenance',
      targetSha: target,
      matchingPullRequestNumbers: matches.map((pull) => pull.number),
    };
  }

  if (matches.length === 1) {
    const [pull] = matches;
    return {
      ok: true,
      reason: 'reviewed_pr_merge_provenance',
      targetSha: target,
      pullRequestNumber: pull.number,
      mergedAt: pull.merged_at,
    };
  }

  const direct = ownerDirectMainProvenance(directMainContext);
  if (direct) {
    return {
      ...direct,
      targetSha: target,
    };
  }

  return { ok: false, reason: 'direct_or_unproven_main_commit', targetSha: target };
}

function cli() {
  const targetSha = process.env.TARGET_SHA;
  const currentMainSha = process.env.CURRENT_MAIN_SHA;
  let associatedPulls;
  try {
    associatedPulls = JSON.parse(process.env.ASSOCIATED_PULLS_JSON || 'null');
  } catch {
    associatedPulls = null;
  }

  const result = classifyMainReleaseProvenance({
    targetSha,
    currentMainSha,
    associatedPulls,
    directMainContext: {
      eventName: process.env.MAIN_RELEASE_EVENT_NAME,
      ref: process.env.MAIN_RELEASE_REF,
      actor: process.env.MAIN_RELEASE_ACTOR,
      repositoryOwner: process.env.MAIN_RELEASE_REPOSITORY_OWNER,
    },
  });
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/main-release-provenance.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) cli();
