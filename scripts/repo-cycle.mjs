#!/usr/bin/env node
// scripts/repo-cycle.mjs
//
// Evidence-producing repo cycle runner for jussray/founder-control-room.
// Run via: node scripts/repo-cycle.mjs <operation> [--target-branch=X] [--expected-sha=Y]
//
// Mirrors the run_founder_repo_cycle contract from the Codex/Playground design.
// This script never merges. It may emit a merge-authorized receipt only when
// the exact checked-out SHA passes the gate, the working tree remains clean,
// and the founder supplied the approval receipt directly.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const REPOSITORY = "jussray/founder-control-room";
const VALID_OPS = ["preflight", "inspect", "test", "build", "verify", "merge_gate"];
const VALID_APPROVAL_SOURCES = new Set(["founder"]);

const [, , operation, ...rest] = process.argv;
const flags = Object.fromEntries(
  rest.map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  })
);

if (!VALID_OPS.includes(operation)) {
  console.error(`Unknown operation "${operation}". Expected one of: ${VALID_OPS.join(", ")}`);
  process.exit(2);
}

async function run(command, args) {
  const label = [command, ...args].join(" ");
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 20 * 1024 * 1024,
    });
    return { command: label, exit_code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      command: label,
      exit_code: typeof error.code === "number" ? error.code : 1,
      stdout: (error.stdout ?? "").trim(),
      stderr: (error.stderr ?? error.message ?? "").trim(),
    };
  }
}

const STEPS = {
  preflight: [
    ["node", ["--version"]],
    ["npm", ["--version"]],
    ["git", ["rev-parse", "HEAD"]],
    ["git", ["branch", "--show-current"]],
    ["git", ["status", "--porcelain=v1"]],
  ],
  inspect: [
    ["git", ["log", "-10", "--oneline"]],
    ["git", ["diff", "--stat"]],
  ],
  test: [
    ["npm", ["run", "typecheck"]],
    ["npm", ["run", "lint"]],
    ["npm", ["run", "test"]],
  ],
  build: [["npm", ["run", "build"]]],
  verify: [
    ["npm", ["run", "typecheck"]],
    ["npm", ["run", "lint"]],
    ["npm", ["run", "test"]],
    ["npm", ["run", "build"]],
    ["npm", ["run", "test:e2e"]],
  ],
  merge_gate: [
    ["git", ["rev-parse", "HEAD"]],
    ["npm", ["run", "typecheck"]],
    ["npm", ["run", "lint"]],
    ["npm", ["run", "test"]],
    ["npm", ["run", "build"]],
    ["npm", ["run", "test:e2e"]],
  ],
};

const commands = [];
for (const [cmd, args] of STEPS[operation]) {
  const result = await run(cmd, args);
  commands.push(result);
  if (result.exit_code !== 0) break;
}

const localHead = (await run("git", ["rev-parse", "HEAD"])).stdout;
const branch = (await run("git", ["branch", "--show-current"])).stdout;
const status = (await run("git", ["status", "--porcelain=v1"])).stdout;
const firstFailed = commands.find((c) => c.exit_code !== 0);
const approvalSource = String(flags["approval-source"] ?? "").toLowerCase();
const approvalId = String(flags["approval-id"] ?? "").trim();
const approvalSourceValid = VALID_APPROVAL_SOURCES.has(approvalSource);

let blocker = null;
if (flags["expected-sha"] && localHead !== flags["expected-sha"]) {
  blocker = `Checked-out HEAD is ${localHead}, expected ${flags["expected-sha"]}.`;
} else if (flags["target-branch"] && branch && branch !== flags["target-branch"]) {
  blocker = `Checked-out branch is ${branch}, expected ${flags["target-branch"]}.`;
} else if (firstFailed) {
  blocker = `Command failed: ${firstFailed.command} (exit ${firstFailed.exit_code}).`;
} else if (operation === "merge_gate" && status !== "") {
  blocker = "Merge gate requires a clean working tree after verification.";
} else if (operation === "merge_gate" && !approvalSourceValid) {
  blocker = "Merge gate requires approval-source=founder.";
} else if (operation === "merge_gate" && !approvalId) {
  blocker = "Merge gate requires a non-empty founder approval receipt.";
}

const mergeAuthorized =
  operation === "merge_gate" &&
  blocker === null &&
  status === "" &&
  approvalSourceValid &&
  approvalId.length > 0;

const result = {
  ok: blocker === null,
  repository: REPOSITORY,
  operation,
  branch: branch || null,
  local_head_sha: localHead || null,
  working_tree_clean: status === "",
  commands,
  blocker,
  approval: {
    source: approvalSource || null,
    id: approvalId || null,
  },
  // Authorization is scoped to this exact checked-out SHA, a clean post-verify
  // working tree, and a founder-issued approval receipt. The runner remains
  // evidence-only; a separate executor performs the merge.
  merge_authorized: mergeAuthorized,
};

await writeFile("repo-cycle-result.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
