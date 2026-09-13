import { mkdirSync, writeFileSync } from 'node:fs';

const FULL_SHA = /^[0-9a-f]{40}$/i;

function mergedMainPullsForCommit(associatedPulls) {
  if (!Array.isArray(associatedPulls)) return null;
  return associatedPulls.filter((pull) => {
    if (!pull || typeof pull !== 'object') return false;
    return Boolean(pull.merged_at) && String(pull.base?.ref || '').trim() === 'main';
  });
}

export function classifyReviewedFirstParentSuccessors({
  terminalRatifiedTip,
  targetSha,
  successorCommits,
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

    const matches = mergedMainPullsForCommit(successor?.associatedPulls);
    if (matches === null) {
      return { ok: false, reason: 'successor_pr_provenance_unavailable', terminalRatifiedTip: terminal, targetSha: target, successorSha: sha };
    }
    if (matches.length === 0) {
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
}) {
  const target = String(targetSha || '').trim().toLowerCase();
  const current = String(currentMainSha || '').trim().toLowerCase();

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

  if (matches.length === 0) {
    return { ok: false, reason: 'direct_or_unproven_main_commit', targetSha: target };
  }
  if (matches.length !== 1) {
    return {
      ok: false,
      reason: 'ambiguous_pr_provenance',
      targetSha: target,
      matchingPullRequestNumbers: matches.map((pull) => pull.number),
    };
  }

  let successorChain = null;
  if (terminalRatifiedTip !== null) {
    successorChain = classifyReviewedFirstParentSuccessors({
      terminalRatifiedTip,
      targetSha: target,
      successorCommits,
    });
    if (!successorChain.ok) return successorChain;
  }

  const [pull] = matches;
  return {
    ok: true,
    reason: 'reviewed_pr_merge_provenance',
    targetSha: target,
    pullRequestNumber: pull.number,
    mergedAt: pull.merged_at,
    ...(successorChain ? { successorChain } : {}),
  };
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
  });
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/main-release-provenance.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) cli();
