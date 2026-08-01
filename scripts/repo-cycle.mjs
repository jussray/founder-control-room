#!/usr/bin/env node
// scripts/repo-cycle.mjs
//
// Evidence-producing repo cycle runner for jussray/founder-control-room.
// Run via: node scripts/repo-cycle.mjs <operation> [--target-branch=X] [--expected-sha=Y]
//
// Mirrors the run_founder_repo_cycle contract from the Codex/Playground design.
// This script NEVER merges and NEVER sets merge_authorized true — evidence only.
// Intended to run inside GitHub Actions, where a real checkout + shell exist.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const REPOSITORY = "jussray/founder-control-room";
const VALID_OPS = ["preflight", "inspect", "test", "build", "verify", "merge_gate"];

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

// Mapped to the real scripts in package.json — not generic guesses.
// The 13 existing verify:* contract scripts (rls-contract, futureyou-v8,
// goalfix, etc.) are deliberately left out of "verify" below since several
// likely need their own secrets/env (e.g. Supabase) to run clean in CI.
// Add them individually once each one's preconditions are confirmed.
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

let blocker = null;
if (flags["expected-sha"] && localHead !== flags["expected-sha"]) {
  blocker = `Checked-out HEAD is ${localHead}, expected ${flags["expected-sha"]}.`;
} else if (flags["target-branch"] && branch && branch !== flags["target-branch"]) {
  blocker = `Checked-out branch is ${branch}, expected ${flags["target-branch"]}.`;
} else if (firstFailed) {
  blocker = `Command failed: ${firstFailed.command} (exit ${firstFailed.exit_code}).`;
}

const result = {
  ok: blocker === null,
  repository: REPOSITORY,
  operation,
  branch: branch || null,
  local_head_sha: localHead || null,
  working_tree_clean: status === "",
  commands,
  blocker,
  // Deliberate: this script only ever reports evidence. Real merge
  // authorization is a separate, explicitly human-confirmed step —
  // never derived automatically from a green run here.
  merge_authorized: false,
};

await writeFile("repo-cycle-result.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
