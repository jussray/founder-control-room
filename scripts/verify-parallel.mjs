#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const receiptPath = "test-results/parallel-verify-result.json";
const startedAt = new Date().toISOString();

const waveOne = [
  { id: "typecheck", command: npmCommand, args: ["run", "typecheck"] },
  { id: "lint", command: npmCommand, args: ["run", "lint"] },
  { id: "unit", command: npmCommand, args: ["run", "test"] },
  { id: "build", command: npmCommand, args: ["run", "build"] },
  { id: "pages-build", command: npmCommand, args: ["run", "build:pages"] },
  { id: "cloudflare-dry-run", command: npmCommand, args: ["run", "cf:dry-run"] },
];

const waveTwo = [
  { id: "playwright-e2e", command: process.execPath, args: ["e2e/run.mjs"] },
];

function redactFailureExcerpt(value) {
  return String(value ?? "")
    .slice(-4000)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|password|private[_ -]?key|api[_ -]?key)(\s*[:=]\s*)\S+/gi, "$1$2[REDACTED]")
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[A-Fa-f0-9]{64,}\b/g, "[REDACTED_HEX]");
}

async function runTask(task) {
  const taskStartedAt = new Date().toISOString();
  const started = Date.now();
  console.log(`\n▶ ${task.id}`);

  try {
    const { stdout, stderr } = await execFileAsync(task.command, task.args, {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 30 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });

    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
    console.log(`✓ ${task.id}`);

    return {
      id: task.id,
      ok: true,
      exitCode: 0,
      startedAt: taskStartedAt,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const stdout = String(error.stdout ?? "").trim();
    const stderr = String(error.stderr ?? error.message ?? "").trim();
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.error(`✗ ${task.id}`);

    return {
      id: task.id,
      ok: false,
      exitCode: typeof error.code === "number" ? error.code : 1,
      startedAt: taskStartedAt,
      durationMs: Date.now() - started,
      failureExcerpt: redactFailureExcerpt([stdout, stderr].filter(Boolean).join("\n")),
    };
  }
}

async function runWave(tasks) {
  return Promise.all(tasks.map(runTask));
}

const results = [];
const firstWaveResults = await runWave(waveOne);
results.push(...firstWaveResults);

const firstWavePassed = firstWaveResults.every((result) => result.ok);
if (firstWavePassed) {
  results.push(...(await runWave(waveTwo)));
} else {
  results.push({
    id: "playwright-e2e",
    ok: false,
    skipped: true,
    reason: "Skipped because a prerequisite typecheck, lint, unit, build, Pages build, or Cloudflare dry-run task failed.",
  });
}

const failed = results.filter((result) => !result.ok && !result.skipped);
const receipt = {
  ok: failed.length === 0,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  startedAt,
  finishedAt: new Date().toISOString(),
  executionModel: {
    waveOne: waveOne.map((task) => task.id),
    waveTwo: waveTwo.map((task) => task.id),
  },
  results,
};

await mkdir("test-results", { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`\nReceipt: ${receiptPath}`);

if (!receipt.ok) {
  console.error(`Parallel verification failed: ${failed.map((result) => result.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Parallel verification passed.");
}
