import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CONTRACT = 'fcr/chief-proofmode-governance-witness@v1';
export const CHIEF_REPOSITORY = 'jussray/chief-ai-machine';
export const CHIEF_BASE_REF = 'main';
export const CHIEF_OWNER = 'jussray';
export const EXPECTED_CHIEF_BASE_SHA = '2fd4fda0cab12e52ab5096e723884d98bcfe7d10';
export const PROOFMODE_WORKFLOW_PATH = '.github/workflows/proofmode-mcp-playwright.yml';
export const PROOFMODE_WORKFLOW_BLOB_SHA = '9ed95711df7611ff45f0bda68884a2624b06682d';
export const PROOFMODE_RUNTIME_JOB = 'Verify candidate ProofMode runtime with Playwright';
export const GOVERNANCE_BOUNDARY_RULESET_ID = 21261587;
export const EXACT_HEAD_RULESET_ID = 20818149;
export const TRUSTED_WITNESS_CONTEXT = 'FCR Governance Witness / Chief ProofMode candidate';
export const LEGACY_PREMERGE_CONTEXTS = Object.freeze([
  'Verify live ProofMode MCP with Playwright',
  'Verify production ProofMode MCP with Playwright',
  'Verify candidate ProofMode runtime with Playwright',
]);

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const RECEIPT_PATH = 'artifacts/chief-proofmode-governance-witness.json';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value) {
  return text(value).toLowerCase();
}

function numericId(value) {
  const raw = value == null ? '' : String(value).trim();
  return POSITIVE_INTEGER.test(raw) ? raw : null;
}

function workflowPath(value) {
  return text(value).split('@', 1)[0];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableFingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function branchTargetsMain(ruleset) {
  if (ruleset?.target !== 'branch' || ruleset?.enforcement !== 'active') return false;
  const include = ruleset?.conditions?.ref_name?.include;
  if (!Array.isArray(include)) return false;
  return include.includes('~DEFAULT_BRANCH') || include.includes('refs/heads/main');
}

function requiredChecks(ruleset) {
  const rule = Array.isArray(ruleset?.rules)
    ? ruleset.rules.find((entry) => entry?.type === 'required_status_checks')
    : null;
  const checks = rule?.parameters?.required_status_checks;
  if (!Array.isArray(checks)) return [];
  return checks
    .map((entry) => ({
      context: text(entry?.context),
      integrationId: numericId(entry?.integration_id),
    }))
    .filter((entry) => entry.context);
}

function rulesetSnapshot(ruleset) {
  return {
    id: ruleset?.id == null ? null : Number(ruleset.id),
    name: text(ruleset?.name) || null,
    enforcement: text(ruleset?.enforcement) || null,
    target: text(ruleset?.target) || null,
    targetsMain: branchTargetsMain(ruleset),
    bypassObservationComplete: Array.isArray(ruleset?.bypass_actors),
    bypassActors: Array.isArray(ruleset?.bypass_actors)
      ? ruleset.bypass_actors.map((actor) => ({
          actorType: text(actor?.actor_type) || null,
          actorId: actor?.actor_id == null ? null : String(actor.actor_id),
          bypassMode: text(actor?.bypass_mode) || null,
        }))
      : null,
    requiredChecks: requiredChecks(ruleset),
  };
}

function pushViolation(violations, classification, detail = {}) {
  violations.push({ classification, ...detail });
}

export function evaluateChiefProofModeGovernanceEvidence({
  appId,
  pullRequestNumber,
  pullRequest,
  workflowFile,
  workflowRun,
  jobs,
  rulesets,
}) {
  const violations = [];
  const trustedAppId = numericId(appId);
  const prNumber = Number(pullRequestNumber);
  const prHeadSha = lower(pullRequest?.head?.sha);
  const prHeadRef = text(pullRequest?.head?.ref);
  const prBaseSha = lower(pullRequest?.base?.sha);

  if (!trustedAppId) {
    pushViolation(violations, 'trusted-app-id-invalid');
  }
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0 || pullRequest?.number !== prNumber) {
    pushViolation(violations, 'pull-request-number-mismatch', {
      requested: Number.isSafeInteger(prNumber) ? prNumber : null,
      observed: pullRequest?.number ?? null,
    });
  }
  if (pullRequest?.state !== 'open' || pullRequest?.merged === true) {
    pushViolation(violations, 'pull-request-not-open-unmerged');
  }
  if (pullRequest?.base?.ref !== CHIEF_BASE_REF || prBaseSha !== EXPECTED_CHIEF_BASE_SHA) {
    pushViolation(violations, 'trusted-base-moved', {
      expectedRef: CHIEF_BASE_REF,
      expectedSha: EXPECTED_CHIEF_BASE_SHA,
      observedRef: pullRequest?.base?.ref ?? null,
      observedSha: prBaseSha || null,
    });
  }
  if (lower(pullRequest?.base?.repo?.full_name) !== CHIEF_REPOSITORY) {
    pushViolation(violations, 'base-repository-mismatch');
  }
  if (lower(pullRequest?.head?.repo?.full_name) !== CHIEF_REPOSITORY) {
    pushViolation(violations, 'head-repository-mismatch');
  }
  if (!FULL_SHA.test(prHeadSha)) {
    pushViolation(violations, 'pull-request-head-invalid');
  }

  if (lower(workflowFile?.sha) !== PROOFMODE_WORKFLOW_BLOB_SHA) {
    pushViolation(violations, 'proofmode-workflow-blob-mismatch', {
      expected: PROOFMODE_WORKFLOW_BLOB_SHA,
      observed: lower(workflowFile?.sha) || null,
    });
  }

  if (lower(workflowRun?.repository?.full_name) !== CHIEF_REPOSITORY) {
    pushViolation(violations, 'workflow-run-repository-mismatch');
  }
  if (workflowRun?.event !== 'workflow_dispatch') {
    pushViolation(violations, 'workflow-run-event-not-founder-dispatch', {
      observed: workflowRun?.event ?? null,
    });
  }
  if (workflowRun?.status !== 'completed' || workflowRun?.conclusion !== 'success') {
    pushViolation(violations, 'workflow-run-not-successful', {
      status: workflowRun?.status ?? null,
      conclusion: workflowRun?.conclusion ?? null,
    });
  }
  if (lower(workflowRun?.head_sha) !== prHeadSha) {
    pushViolation(violations, 'workflow-run-head-mismatch', {
      expected: prHeadSha || null,
      observed: lower(workflowRun?.head_sha) || null,
    });
  }
  if (text(workflowRun?.head_branch) !== prHeadRef) {
    pushViolation(violations, 'workflow-run-branch-mismatch', {
      expected: prHeadRef || null,
      observed: text(workflowRun?.head_branch) || null,
    });
  }
  if (workflowPath(workflowRun?.path) !== PROOFMODE_WORKFLOW_PATH) {
    pushViolation(violations, 'workflow-run-path-mismatch', {
      expected: PROOFMODE_WORKFLOW_PATH,
      observed: workflowPath(workflowRun?.path) || null,
    });
  }
  if (lower(workflowRun?.actor?.login) !== CHIEF_OWNER) {
    pushViolation(violations, 'workflow-run-actor-not-founder', {
      expected: CHIEF_OWNER,
      observed: lower(workflowRun?.actor?.login) || null,
    });
  }

  const jobList = Array.isArray(jobs) ? jobs : [];
  const runtimeJobs = jobList.filter((job) => job?.name === PROOFMODE_RUNTIME_JOB);
  if (runtimeJobs.length !== 1) {
    pushViolation(violations, 'candidate-runtime-job-cardinality', {
      observed: runtimeJobs.length,
    });
  } else if (runtimeJobs[0]?.status !== 'completed' || runtimeJobs[0]?.conclusion !== 'success') {
    pushViolation(violations, 'candidate-runtime-job-not-successful', {
      status: runtimeJobs[0]?.status ?? null,
      conclusion: runtimeJobs[0]?.conclusion ?? null,
    });
  }

  const activeMainRulesets = (Array.isArray(rulesets) ? rulesets : [])
    .filter(branchTargetsMain)
    .map(rulesetSnapshot);
  const governanceBoundary = activeMainRulesets.find((ruleset) => ruleset.id === GOVERNANCE_BOUNDARY_RULESET_ID) ?? null;
  const exactHeadGate = activeMainRulesets.find((ruleset) => ruleset.id === EXACT_HEAD_RULESET_ID) ?? null;

  if (!governanceBoundary) {
    pushViolation(violations, 'governance-boundary-not-observed', {
      expectedRulesetId: GOVERNANCE_BOUNDARY_RULESET_ID,
    });
  }
  if (!exactHeadGate) {
    pushViolation(violations, 'exact-head-ruleset-not-observed', {
      expectedRulesetId: EXACT_HEAD_RULESET_ID,
    });
  }

  for (const legacyContext of LEGACY_PREMERGE_CONTEXTS) {
    const carriers = activeMainRulesets
      .filter((ruleset) => ruleset.requiredChecks.some((check) => check.context === legacyContext))
      .map((ruleset) => ({ id: ruleset.id, name: ruleset.name }));
    if (carriers.length > 0) {
      pushViolation(violations, 'legacy-or-spoofable-proofmode-context-still-required', {
        context: legacyContext,
        rulesets: carriers,
      });
    }
  }

  if (exactHeadGate) {
    if (!exactHeadGate.bypassObservationComplete) {
      pushViolation(violations, 'exact-head-bypass-observation-incomplete');
    } else if (exactHeadGate.bypassActors.length !== 0) {
      pushViolation(violations, 'exact-head-ruleset-bypassable', {
        bypassActors: exactHeadGate.bypassActors,
      });
    }

    const witnessChecks = exactHeadGate.requiredChecks.filter(
      (check) => check.context === TRUSTED_WITNESS_CONTEXT,
    );
    if (witnessChecks.length !== 1) {
      pushViolation(violations, 'trusted-witness-context-cardinality', {
        observed: witnessChecks.length,
      });
    } else if (trustedAppId && witnessChecks[0].integrationId !== trustedAppId) {
      pushViolation(violations, 'trusted-witness-integration-mismatch', {
        expected: trustedAppId,
        observed: witnessChecks[0].integrationId,
      });
    }
  }

  const wrongWitnessCarriers = activeMainRulesets
    .filter((ruleset) => ruleset.id !== EXACT_HEAD_RULESET_ID)
    .filter((ruleset) => ruleset.requiredChecks.some((check) => check.context === TRUSTED_WITNESS_CONTEXT))
    .map((ruleset) => ({ id: ruleset.id, name: ruleset.name }));
  if (wrongWitnessCarriers.length > 0) {
    pushViolation(violations, 'trusted-witness-required-by-wrong-ruleset', {
      rulesets: wrongWitnessCarriers,
    });
  }

  const evidence = {
    contract: CONTRACT,
    repository: CHIEF_REPOSITORY,
    pullRequestNumber: Number.isSafeInteger(prNumber) ? prNumber : null,
    baseSha: prBaseSha || null,
    headSha: prHeadSha || null,
    headRef: prHeadRef || null,
    workflowPath: PROOFMODE_WORKFLOW_PATH,
    workflowBlobSha: lower(workflowFile?.sha) || null,
    workflowRunId: workflowRun?.id == null ? null : String(workflowRun.id),
    workflowRunAttempt: workflowRun?.run_attempt == null ? null : Number(workflowRun.run_attempt),
    workflowRunActor: lower(workflowRun?.actor?.login) || null,
    runtimeJobId: runtimeJobs[0]?.id == null ? null : String(runtimeJobs[0].id),
    runtimeJobConclusion: runtimeJobs[0]?.conclusion ?? null,
    trustedAppId,
    governanceBoundary,
    exactHeadGate,
  };
  const fingerprint = stableFingerprint(evidence);

  return {
    contract: CONTRACT,
    ok: violations.length === 0,
    classification: violations.length === 0 ? 'VERIFIED' : 'BLOCKED',
    providerMutationPerformed: false,
    headSha: prHeadSha || null,
    trustedWitnessContext: TRUSTED_WITNESS_CONTEXT,
    trustedAppId,
    evidenceFingerprint: fingerprint,
    evidence,
    violations,
  };
}

async function githubJson(path, token, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'founder-control-room-chief-proofmode-governance-witness',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = text(body?.message) || `HTTP ${response.status}`;
    throw new Error(`GitHub App read/write failed for ${path}: HTTP ${response.status}: ${message}`);
  }
  return body;
}

function writeReceipt(report) {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function collectDetailedRulesets(token) {
  const summaries = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/rulesets?includes_parents=true&per_page=100`,
    token,
  );
  if (!Array.isArray(summaries)) throw new Error('GitHub ruleset summary read did not return an array');
  return Promise.all(summaries.map((ruleset) => {
    const id = numericId(ruleset?.id);
    if (!id) throw new Error('GitHub ruleset summary returned an invalid ruleset id');
    return githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine/rulesets/${id}`, token);
  }));
}

async function publishAndReadBackWitness(token, appId, decision) {
  const existing = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/commits/${decision.headSha}/check-runs?per_page=100&filter=latest`,
    token,
  );
  const existingRuns = Array.isArray(existing?.check_runs) ? existing.check_runs : [];
  const matching = existingRuns.find((run) =>
    run?.name === TRUSTED_WITNESS_CONTEXT
    && run?.status === 'completed'
    && run?.conclusion === 'success'
    && lower(run?.head_sha) === decision.headSha
    && lower(run?.external_id) === decision.evidenceFingerprint
    && String(run?.app?.id ?? '') === String(appId),
  );
  if (matching) return matching;

  await githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine/check-runs`, token, {
    method: 'POST',
    body: JSON.stringify({
      name: TRUSTED_WITNESS_CONTEXT,
      head_sha: decision.headSha,
      status: 'completed',
      conclusion: 'success',
      external_id: decision.evidenceFingerprint,
      output: {
        title: 'FCR trusted Chief ProofMode governance witness',
        summary: [
          `Contract: ${CONTRACT}`,
          `Chief PR: #${decision.evidence.pullRequestNumber}`,
          `Exact head: ${decision.headSha}`,
          `Founder workflow_dispatch: ${decision.evidence.workflowRunId}`,
          `Pinned workflow blob: ${decision.evidence.workflowBlobSha}`,
          `Ruleset carrier: ${EXACT_HEAD_RULESET_ID}`,
          `Evidence fingerprint: ${decision.evidenceFingerprint}`,
          'Authority ceiling: verification receipt only; no merge, deploy, provider mutation, or publication authority granted.',
        ].join('\n'),
      },
    }),
  });

  const after = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/commits/${decision.headSha}/check-runs?per_page=100&filter=latest`,
    token,
  );
  const runs = Array.isArray(after?.check_runs) ? after.check_runs : [];
  const verified = runs.find((run) =>
    run?.name === TRUSTED_WITNESS_CONTEXT
    && run?.status === 'completed'
    && run?.conclusion === 'success'
    && lower(run?.head_sha) === decision.headSha
    && lower(run?.external_id) === decision.evidenceFingerprint
    && String(run?.app?.id ?? '') === String(appId),
  );
  if (!verified) {
    throw new Error('FCR App Check Run publication succeeded without exact trusted readback');
  }
  return verified;
}

export async function runChiefProofModeGovernanceWitness(env = process.env) {
  const appId = text(env.GITHUB_APP_ID);
  const privateKey = text(env.GITHUB_PRIVATE_KEY);
  const prNumber = Number(env.CHIEF_PR_NUMBER ?? '143');
  const runId = text(env.CHIEF_PROOFMODE_RUN_ID);

  if (!numericId(appId)) throw new Error('GITHUB_APP_ID must be the numeric FCR-owned GitHub App id');
  if (!privateKey) throw new Error('GITHUB_PRIVATE_KEY is required for the FCR-owned GitHub App');
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) throw new Error('CHIEF_PR_NUMBER must be a positive integer');
  if (!numericId(runId)) throw new Error('CHIEF_PROOFMODE_RUN_ID must be a positive workflow run id');

  const { getGitHubInstallationToken } = await import('../dist/providers/githubAppAuth.js');
  const token = await getGitHubInstallationToken(appId, privateKey, CHIEF_REPOSITORY);

  const pullRequest = await githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine/pulls/${prNumber}`, token);
  const headSha = lower(pullRequest?.head?.sha);
  if (!FULL_SHA.test(headSha)) throw new Error('Chief pull request did not expose an exact current head SHA');

  const workflowFile = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/contents/${PROOFMODE_WORKFLOW_PATH}?ref=${headSha}`,
    token,
  );
  const workflowRun = await githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine/actions/runs/${runId}`, token);
  const jobPayload = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/actions/runs/${runId}/jobs?per_page=100`,
    token,
  );
  const rulesets = await collectDetailedRulesets(token);

  const decision = evaluateChiefProofModeGovernanceEvidence({
    appId,
    pullRequestNumber: prNumber,
    pullRequest,
    workflowFile,
    workflowRun,
    jobs: Array.isArray(jobPayload?.jobs) ? jobPayload.jobs : [],
    rulesets,
  });
  writeReceipt(decision);

  if (!decision.ok) {
    console.error(JSON.stringify(decision, null, 2));
    throw new Error(`Chief ProofMode governance witness blocked: ${decision.violations.map((item) => item.classification).join(', ')}`);
  }

  const checkRun = await publishAndReadBackWitness(token, appId, decision);
  const verified = {
    ...decision,
    providerMutationPerformed: true,
    checkRun: {
      id: checkRun?.id == null ? null : String(checkRun.id),
      name: checkRun?.name ?? null,
      status: checkRun?.status ?? null,
      conclusion: checkRun?.conclusion ?? null,
      headSha: lower(checkRun?.head_sha) || null,
      externalId: lower(checkRun?.external_id) || null,
      issuerAppId: checkRun?.app?.id == null ? null : String(checkRun.app.id),
      issuerAppSlug: checkRun?.app?.slug ?? null,
      detailsUrl: checkRun?.details_url ?? null,
    },
  };
  writeReceipt(verified);
  console.log(JSON.stringify(verified, null, 2));
  return verified;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runChiefProofModeGovernanceWitness().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
