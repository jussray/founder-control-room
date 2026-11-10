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

function mergedMainPullsForCommit(associatedPulls, commitSha) {
  if (!Array.isArray(associatedPulls)) return null;
  return associatedPulls.filter((pull) => {
    if (!pull || typeof pull !== 'object') return false;
    const mergeSha = String(pull.merge_commit_sha || '').trim().toLowerCase();
    return Boolean(pull.merged_at)
      && String(pull.base?.ref || '').trim() === 'main'
      && mergeSha === commitSha;
  });
}

export function classifyReviewedFirstParentSuccessors({
  terminalRatifiedTip,
  targetSha,
  successorCommits,
  directTargetProvenance = null,
}) {
  const terminal = String(terminalRatifiedTip || '').trim().toLowerCase();
  const target = String(targetSha || '').trim().toLowerCase();

  if (!FULL_SHA.test(terminal) || !FULL_SHA.test(target)) {
    return { ok: false, reason: 'invalid_successor_chain_sha' };
  }
  if (!Array.isArray(successorCommits)) {
    return { ok: false, reason: 'successor_pr_provenance_unavailable', terminalRatifiedTip: terminal, targetSha: target };
  }
  if (terminal === target) {
    if (successorCommits.length !== 0) {
      return { ok: false, reason: 'unexpected_successor_commits_at_terminal_tip', terminalRatifiedTip: terminal, targetSha: target };
    }
    return { ok: true, reason: 'ratified_tip_is_current_main', terminalRatifiedTip: terminal, targetSha: target, successorCount: 0, successors: [] };
  }
  if (successorCommits.length === 0) {
    return { ok: false, reason: 'successor_chain_missing', terminalRatifiedTip: terminal, targetSha: target };
  }

  const seen = new Set();
  const successors = [];
  for (const successor of successorCommits) {
    const sha = String(successor?.sha || '').trim().toLowerCase();
    if (!FULL_SHA.test(sha) || sha === terminal || seen.has(sha)) {
      return { ok: false, reason: 'invalid_successor_chain', terminalRatifiedTip: terminal, targetSha: target, successorSha: sha || null };
    }
    seen.add(sha);

    const matches = mergedMainPullsForCommit(successor?.associatedPulls, sha);
    if (matches === null) {
      return { ok: false, reason: 'successor_pr_provenance_unavailable', terminalRatifiedTip: terminal, targetSha: target, successorSha: sha };
    }
    if (matches.length === 0) {
      if (sha === target && directTargetProvenance?.ok === true) {
        successors.push({ sha, provenance: 'owner_direct_main_push', directMainActor: directTargetProvenance.directMainActor });
        continue;
      }
      if (successor?.trustedRun?.ok === true && successor.trustedRun.targetSha === sha) {
        successors.push({ sha, provenance: 'trusted_direct_main_run', workflowRunId: successor.trustedRun.workflowRunId });
        continue;
      }
      return { ok: false, reason: 'unreviewed_first_parent_successor', terminalRatifiedTip: terminal, targetSha: target, successorSha: sha };
    }
    if (matches.length !== 1) {
      return {
        ok: false,
        reason: 'ambiguous_successor_pr_provenance',
        terminalRatifiedTip: terminal,
        targetSha: target,
        successorSha: sha,
        matchingPullRequestNumbers: matches.map((pull) => pull.number),
      };
    }

    successors.push({
      sha,
      pullRequestNumber: matches[0].number,
      mergedAt: matches[0].merged_at,
    });
  }

  if (successors.at(-1)?.sha !== target) {
    return {
      ok: false,
      reason: 'successor_chain_not_bound_to_target',
      terminalRatifiedTip: terminal,
      targetSha: target,
      observedTip: successors.at(-1)?.sha ?? null,
    };
  }

  return {
    ok: true,
    reason: 'reviewed_first_parent_successor_chain',
    terminalRatifiedTip: terminal,
    targetSha: target,
    successorCount: successors.length,
    successors,
  };
}

export function classifyMainReleaseProvenance({
  targetSha,
  currentMainSha,
  associatedPulls,
  terminalRatifiedTip = null,
  successorCommits = null,
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
    let successorChain = null;
    if (terminalRatifiedTip !== null) {
      successorChain = classifyReviewedFirstParentSuccessors({
        terminalRatifiedTip,
        targetSha: target,
        successorCommits,
      });
      if (!successorChain.ok) return successorChain;
    }
    return {
      ok: true,
      reason: 'reviewed_pr_merge_provenance',
      targetSha: target,
      pullRequestNumber: pull.number,
      mergedAt: pull.merged_at,
      ...(successorChain ? { successorChain } : {}),
    };
  }

  // Terminal-ratified mode: an owner direct-push tip is admitted only when every
  // first-parent successor after the terminal tip is PR-reviewed or carries its own
  // exact-head trusted run. The ratified terminal commit is never re-admitted by push context.
  if (terminalRatifiedTip !== null) {
    const direct = ownerDirectMainProvenance(directMainContext);
    if (!direct || normalized(terminalRatifiedTip).toLowerCase() === target) {
      return { ok: false, reason: 'direct_or_unproven_main_commit', targetSha: target };
    }
    const successorChain = classifyReviewedFirstParentSuccessors({
      terminalRatifiedTip,
      targetSha: target,
      successorCommits,
      directTargetProvenance: direct,
    });
    if (!successorChain.ok) return successorChain;
    return { ...direct, targetSha: target, successorChain };
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
  const terminalRatifiedTip = process.env.TERMINAL_RATIFIED_TIP?.trim() || null;
  let associatedPulls;
  let successorCommits = null;
  try {
    associatedPulls = JSON.parse(process.env.ASSOCIATED_PULLS_JSON || 'null');
  } catch {
    associatedPulls = null;
  }
  if (terminalRatifiedTip !== null) {
    try {
      successorCommits = JSON.parse(process.env.SUCCESSOR_COMMITS_JSON || 'null');
    } catch {
      successorCommits = null;
    }
  }

  const result = classifyMainReleaseProvenance({
    targetSha,
    currentMainSha,
    associatedPulls,
    terminalRatifiedTip,
    successorCommits,
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
