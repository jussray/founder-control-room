import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const origin = (process.env.PUBLIC_ORIGIN || "https://foundercontrolroom.org").replace(/\/$/, "");
const probeName = process.env.PROBE_NAME || "production";
const outputDir = path.resolve(process.env.PROOF_DIR || `artifacts/production-origin/${probeName}`);
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS || 45_000);

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
});
page.on("pageerror", (error) => pageErrors.push(String(error.message || error).slice(0, 500)));
page.on("requestfailed", (request) => {
  requestFailures.push({
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url().slice(0, 500),
    failure: request.failure()?.errorText?.slice(0, 300) || "unknown",
  });
});

const startedAt = new Date().toISOString();
let response = null;
let navigationError = null;

try {
  response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForTimeout(3000);
} catch (error) {
  navigationError = String(error instanceof Error ? error.message : error).slice(0, 1000);
}

let title = "";
let bodyText = "";
let html = "";

try { title = await page.title(); } catch {}
try { bodyText = (await page.locator("body").innerText({ timeout: 5000 })).trim(); } catch {}
try { html = await page.content(); } catch {}

await fs.writeFile(path.join(outputDir, "page.html"), html || "<!-- no document captured -->\n", "utf8");
try {
  await page.screenshot({ path: path.join(outputDir, "screenshot.png"), fullPage: true });
} catch {}

const status = response?.status() ?? null;
const finalUrl = page.url();
const cloudflareErrorPattern = /cloudflare|error\s*(?:5\d\d|1\d{3})|web server is down|host error|connection timed out|bad gateway/i;
const blank = bodyText.length < 20;
const providerErrorVisible = cloudflareErrorPattern.test(`${title}\n${bodyText.slice(0, 4000)}`);

const summary = {
  probeName,
  origin,
  startedAt,
  finishedAt: new Date().toISOString(),
  status,
  finalUrl,
  title,
  bodyTextLength: bodyText.length,
  bodyTextPreview: bodyText.slice(0, 1000),
  blank,
  providerErrorVisible,
  navigationError,
  consoleErrors,
  pageErrors,
  requestFailures: requestFailures.slice(0, 25),
};

await fs.writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));

await browser.close();

const unhealthyStatus = status === null || status >= 400;
if (navigationError || unhealthyStatus || blank || providerErrorVisible) {
  process.exitCode = 1;
}
