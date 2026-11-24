// src/http/routes/portableConsole.ts
//
// Portable Founder Console: provider-agnostic approval + repo-cycle surface.
// Mount in src/http/server.ts with:  app.use('/v1', portableConsoleRouter)
//
// This is NOT a new Worker. api.foundercontrolroom.org already runs this same
// app; a separate gateway Worker + service binding would duplicate it and
// reintroduce the relay pattern wrangler.toml's own comments say was excluded.
//
// Reuses whatever founder-gating auth middleware server.ts already applies
// upstream of this mount point — this file implements no auth of its own.

import { Router } from "express";
import { Octokit } from "@octokit/rest";
import {
  parseDecisionPackage,
  type ApprovalRecord,
  type ReceiptRecord,
} from "./portableConsole.types.js";

const REPO_OWNER = "jussray";
const REPO_NAME = "founder-control-room";
const WORKFLOW_FILE = "repo-cycle.yml";
const REPO_CYCLE_OPS = ["preflight", "inspect", "test", "build", "verify", "merge_gate"] as const;

// TODO(prod): move to Supabase — @supabase/supabase-js is already a dependency
// and supabase/ already holds this repo's schema. This in-memory store is a
// placeholder only: it does not survive a Worker restart or multiple isolates.
const approvals = new Map<string, ApprovalRecord>();
const receipts = new Map<string, ReceiptRecord>();

interface GhEnv {
  GITHUB_TOKEN?: string;
  GITHUB_APP_ID?: string;
  GITHUB_PRIVATE_KEY?: string;
}

function octokit(env: GhEnv): Octokit {
  // wrangler.toml documents GITHUB_APP_ID + GITHUB_PRIVATE_KEY as the preferred
  // production path and GITHUB_TOKEN as local/dev fallback. Only the fallback
  // is wired here — add App-auth (createAppAuth) before relying on this in prod.
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN not configured — App-auth path not wired in this file yet.");
  }
  return new Octokit({ auth: env.GITHUB_TOKEN });
}

export const portableConsoleRouter = Router();

// ---------------------------------------------------------------------------
// repo_* tools — trigger and poll the real repo-cycle.yml workflow. This is
// the live execution engine; nothing here fabricates evidence.
// ---------------------------------------------------------------------------

portableConsoleRouter.post("/repo/:operation", async (req, res) => {
  const { operation } = req.params;
  if (!(REPO_CYCLE_OPS as readonly string[]).includes(operation)) {
    return res.status(400).json({ error: `Unknown operation "${operation}".` });
  }
  const { target_branch, expected_head_sha } = req.body ?? {};
  const requestedBranch = String(target_branch || "main");
  const requestedHeadSha = typeof expected_head_sha === "string" ? expected_head_sha.trim() : "";

  try {
    const gh = octokit(req.app.locals.env);
    const branch = await gh.repos.getBranch({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      branch: requestedBranch,
    });
    const liveHeadSha = branch.data.commit.sha;

    if (operation === "merge_gate") {
      if (!requestedHeadSha) {
        return res.status(400).json({
          error: "merge_gate requires expected_head_sha bound to the founder approval.",
          current: liveHeadSha,
        });
      }
      if (requestedHeadSha !== liveHeadSha) {
        return res.status(409).json({
          error: "Approved head is stale — re-approve against the current branch head.",
          expected: requestedHeadSha,
          current: liveHeadSha,
          target_branch: requestedBranch,
        });
      }
    }

    // Evidence-only operations always bind to the current branch tip. A stale
    // caller-provided SHA is treated as predecessor evidence, never current proof.
    // merge_gate is different: its exact founder-approved SHA must remain unchanged.
    const resolvedHeadSha = operation === "merge_gate" ? requestedHeadSha : liveHeadSha;
    const rolledForward = Boolean(
      operation !== "merge_gate" && requestedHeadSha && requestedHeadSha !== resolvedHeadSha,
    );

    await gh.actions.createWorkflowDispatch({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      workflow_id: WORKFLOW_FILE,
      ref: requestedBranch,
      inputs: {
        operation,
        target_branch: requestedBranch,
        expected_head_sha: resolvedHeadSha,
      },
    });
    res.status(202).json({
      dispatched: true,
      operation,
      repository: `${REPO_OWNER}/${REPO_NAME}`,
      workflow: WORKFLOW_FILE,
      target_branch: requestedBranch,
      expected_head_sha: resolvedHeadSha,
      requested_head_sha: requestedHeadSha || null,
      rolled_forward: rolledForward,
      poll: `/v1/repo/status?branch=${encodeURIComponent(requestedBranch)}`,
    });
  } catch (err) {
    res.status(502).json({ error: "GitHub Actions dispatch failed.", detail: String(err) });
  }
});

portableConsoleRouter.get("/repo/status", async (req, res) => {
  const branch = String(req.query.branch ?? "main");
  try {
    const gh = octokit(req.app.locals.env);
    const runs = await gh.actions.listWorkflowRuns({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      workflow_id: WORKFLOW_FILE,
      branch,
      per_page: 1,
    });
    const run = runs.data.workflow_runs[0];
    if (!run) return res.status(404).json({ error: "No runs found for that branch yet." });

    res.json({
      run_id: run.id,
      status: run.status, // queued | in_progress | completed
      conclusion: run.conclusion, // success | failure | null
      html_url: run.html_url,
      head_sha: run.head_sha,
      // Full evidence JSON is uploaded as the "repo-cycle-result" artifact.
      // Fetching + unzipping it via gh.actions.downloadArtifact is the next
      // increment — deliberately not added yet so this ships correct and small.
    });
  } catch (err) {
    res.status(502).json({ error: "GitHub Actions status check failed.", detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Decision / approval / receipt contract with exact-commit binding
// ---------------------------------------------------------------------------

portableConsoleRouter.post("/decisions", (req, res) => {
  const parsed = parseDecisionPackage(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  // Recording the decision is the request itself — never an authorization.
  res.status(201).json({ decisionId: parsed.value.decisionId, status: "SUBMITTED" });
});

portableConsoleRouter.post("/approvals", (req, res) => {
  const { decisionId, repository, baseBranch, headBranch, approvedHeadSha, expectedBaseSha, expiresAt } =
    req.body ?? {};
  if (!decisionId || !approvedHeadSha || !expectedBaseSha || !expiresAt) {
    return res.status(400).json({
      error: "decisionId, approvedHeadSha, expectedBaseSha, expiresAt are required.",
    });
  }
  if (approvals.has(decisionId)) {
    return res.status(409).json({ error: "Approval already exists for this decisionId — one-time use." });
  }
  const record: ApprovalRecord = {
    decisionId,
    repository: repository ?? `${REPO_OWNER}/${REPO_NAME}`,
    baseBranch: baseBranch ?? "main",
    headBranch: headBranch ?? "",
    approvedHeadSha,
    expectedBaseSha,
    expiresAt,
    consumed: false,
    createdAt: new Date().toISOString(),
  };
  approvals.set(decisionId, record);
  res.status(201).json({ status: "APPROVED", decisionId });
});

// Revalidates SHA + expiry + one-time-use, then deliberately stops short of
// merging. Wiring a real gh.pulls.merge call here before main is protected and
// required checks are pinned would defeat the point of this endpoint.
portableConsoleRouter.post("/executions/:decisionId", async (req, res) => {
  const { decisionId } = req.params;
  const approval = approvals.get(decisionId);
  if (!approval) return res.status(404).json({ error: "No approval on file for this decisionId." });
  if (approval.consumed) return res.status(409).json({ error: "Approval already consumed." });
  if (new Date(approval.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: "Approval expired." });
  }

  try {
    const gh = octokit(req.app.locals.env);
    const branch = await gh.repos.getBranch({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      branch: approval.baseBranch || "main",
    });
    if (branch.data.commit.sha !== approval.expectedBaseSha) {
      return res.status(409).json({
        error: "Base branch moved since approval — re-approve against current main.",
        expected: approval.expectedBaseSha,
        current: branch.data.commit.sha,
      });
    }
  } catch (err) {
    return res.status(502).json({ error: "Could not revalidate base branch.", detail: String(err) });
  }

  return res.status(501).json({
    error:
      "Execution gated: apply branch-protection ruleset to main and confirm real required-check " +
      "names from a completed repo-cycle run before this endpoint is allowed to merge anything.",
  });
});

portableConsoleRouter.get("/receipts/:decisionId", (req, res) => {
  const receipt = receipts.get(req.params.decisionId);
  if (!receipt) return res.status(404).json({ error: "No receipt yet." });
  res.json(receipt);
});
