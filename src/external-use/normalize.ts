import { createHash } from "node:crypto";
import type {
  ExternalUseCandidate,
  ExternalUseDigestItem,
  ExternalUseFiveWOneH,
  ExternalUseProject,
  ExternalUseSource,
  NormalizedExternalUse,
} from "./types.js";

const MAX_OBJECTS = 500;
const MAX_SUMMARY_CHARS = 1_000;

function cleanText(value: unknown, maxLength = MAX_SUMMARY_CHARS): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength);
}

function firstText(
  object: Record<string, unknown>,
  keys: readonly string[],
  maxLength = MAX_SUMMARY_CHARS,
): string | undefined {
  for (const key of keys) {
    const value = cleanText(object[key], maxLength);
    if (value) return value;
  }
  return undefined;
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<object>();

  while (queue.length && objects.length < MAX_OBJECTS) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === "string") {
      const text = current.trim();
      if (!text) continue;
      if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
        try {
          queue.push(JSON.parse(text));
        } catch {
          // Keep processing the text as unstructured public evidence.
        }
      }
      const urls = text.match(/https?:\/\/[^\s<>\"']+/gi) ?? [];
      for (const url of urls.slice(0, 25)) {
        objects.push({ url, text: text.slice(0, 5_000) });
        if (objects.length >= MAX_OBJECTS) break;
      }
      continue;
    }

    if (typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const object = current as Record<string, unknown>;
    objects.push(object);
    queue.push(...Object.values(object));
  }

  return objects;
}

function parseGitHubRepository(url: string): { owner: string; repository: string } | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== "github.com") return undefined;
    const [owner, repository] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repository) return undefined;
    return { owner, repository: `${owner}/${repository.replace(/\.git$/i, "")}` };
  } catch {
    return undefined;
  }
}

function normalizeHttpUrl(value: string): string | undefined {
  const cleaned = value.replace(/[),.;\]}>]+$/g, "");
  if (!/^https?:\/\//i.test(cleaned)) return undefined;
  try {
    return new URL(cleaned).toString();
  } catch {
    return undefined;
  }
}

function objectUrl(object: Record<string, unknown>): string | undefined {
  const direct = firstText(object, [
    "html_url",
    "evidence_url",
    "source_url",
    "repository_url",
    "web_url",
    "url",
    "link",
  ], 2_000);
  const normalized = direct ? normalizeHttpUrl(direct) : undefined;
  if (normalized) return normalized;

  const fullName = firstText(object, ["full_name", "repository_full_name", "repo"], 300);
  if (fullName && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
    return `https://github.com/${fullName}`;
  }
  return undefined;
}

function objectRepository(object: Record<string, unknown>, url: string) {
  const fullName = firstText(object, ["full_name", "repository_full_name", "repo"], 300);
  if (fullName && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
    const [owner] = fullName.split("/");
    return { owner, repository: fullName };
  }
  return parseGitHubRepository(url);
}

export function extractExternalUseCandidates(options: {
  result: unknown;
  project: ExternalUseProject;
  source: ExternalUseSource;
  sourceTool: string;
  discoveryQuery: string;
  observedAt?: string;
}): ExternalUseCandidate[] {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const canonical = options.project.repository.toLowerCase();
  const candidates = new Map<string, ExternalUseCandidate>();

  for (const object of collectObjects(options.result)) {
    const evidenceUrl = objectUrl(object);
    if (!evidenceUrl) continue;

    const repo = objectRepository(object, evidenceUrl);
    const externalRepository = repo?.repository;
    const externalOwner = repo?.owner;
    if (externalRepository?.toLowerCase() === canonical) continue;
    if (externalOwner?.toLowerCase() === "jussray") continue;

    const title = firstText(object, ["title", "name", "full_name", "repository_name"], 300)
      ?? externalRepository
      ?? new URL(evidenceUrl).hostname;
    const evidenceSummary = firstText(object, [
      "summary",
      "snippet",
      "description",
      "text",
      "content",
      "body",
    ]) ?? "Public evidence was discovered, but its purpose was not described.";

    const key = `${evidenceUrl.toLowerCase()}|${externalRepository?.toLowerCase() ?? ""}`;
    const candidate: ExternalUseCandidate = {
      source: options.source,
      sourceTool: options.sourceTool,
      evidenceUrl,
      externalOwner,
      externalRepository,
      title,
      evidenceSummary,
      discoveryQuery: options.discoveryQuery.slice(0, 1_000),
      observedAt,
    };
    const previous = candidates.get(key);
    if (!previous || candidate.evidenceSummary.length > previous.evidenceSummary.length) {
      candidates.set(key, candidate);
    }
  }

  return [...candidates.values()].slice(0, 100);
}

function hashEvidence(project: ExternalUseProject, candidate: ExternalUseCandidate): string {
  return createHash("sha256")
    .update([
      project.slug,
      candidate.source,
      candidate.evidenceUrl.toLowerCase(),
      candidate.externalRepository?.toLowerCase() ?? "",
    ].join("|"))
    .digest("hex");
}

function classify(
  project: ExternalUseProject,
  candidate: ExternalUseCandidate,
): Pick<NormalizedExternalUse, "classification" | "confidence"> {
  const haystack = `${candidate.title} ${candidate.evidenceSummary} ${candidate.evidenceUrl}`.toLowerCase();
  const repository = project.repository.toLowerCase();
  const repositoryName = repository.split("/")[1] ?? repository;

  if (/fork/i.test(candidate.sourceTool) && candidate.externalRepository) {
    return { classification: "confirmed", confidence: 0.98 };
  }
  if (haystack.includes(repository) || haystack.includes(`github.com/${repository}`)) {
    return { classification: "probable", confidence: 0.82 };
  }
  if (haystack.includes(repositoryName.toLowerCase())) {
    return { classification: "possible", confidence: 0.58 };
  }
  return { classification: "possible", confidence: 0.4 };
}

function fiveWOneH(
  project: ExternalUseProject,
  candidate: ExternalUseCandidate,
): ExternalUseFiveWOneH {
  const who = candidate.externalOwner
    ? `${candidate.externalOwner}${candidate.externalRepository ? ` (${candidate.externalRepository})` : ""}`
    : candidate.title;

  return {
    who,
    what: `A public repository or page may reference, fork, copy, deploy, or derive from ${project.name} code.`,
    where: candidate.evidenceUrl,
    when: candidate.observedAt,
    why: candidate.evidenceSummary === "Public evidence was discovered, but its purpose was not described."
      ? "The outside party's purpose is not verified from the available public evidence."
      : candidate.evidenceSummary,
    how: `Detected through ${candidate.sourceTool} using public repository names and URLs only; private source code was not sent to the search provider.`,
  };
}

export function normalizeExternalUse(
  project: ExternalUseProject,
  candidate: ExternalUseCandidate,
): NormalizedExternalUse {
  const classification = classify(project, candidate);
  return {
    ...candidate,
    evidenceHash: hashEvidence(project, candidate),
    ...classification,
    fiveWOneH: fiveWOneH(project, candidate),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderExternalUseDigest(options: {
  generatedAt: string;
  items: ExternalUseDigestItem[];
  newItemCount: number;
  warnings?: string[];
}): { subject: string; html: string; text: string } {
  const subject = `[Founder Control Room] External code-use ledger: ${options.newItemCount} new / ${options.items.length} tracked`;
  const warningText = options.warnings?.length
    ? `\nCoverage warnings: ${options.warnings.join(", ")}`
    : "";
  const textItems = options.items.length
    ? options.items.map((item, index) => [
      `${index + 1}. ${item.projectName}: ${item.title}`,
      `Classification: ${item.classification} (${Math.round(item.confidence * 100)}%)`,
      `Who: ${item.fiveWOneH.who}`,
      `What: ${item.fiveWOneH.what}`,
      `Where: ${item.fiveWOneH.where}`,
      `When: ${item.fiveWOneH.when}`,
      `Why: ${item.fiveWOneH.why}`,
      `How: ${item.fiveWOneH.how}`,
    ].join("\n")).join("\n\n")
    : "No public external-use evidence is currently tracked.";

  const htmlItems = options.items.length
    ? options.items.map((item) => `
      <article style="border:1px solid #d8d8e8;border-radius:12px;padding:16px;margin:0 0 14px">
        <h2 style="font-size:17px;margin:0 0 8px">${escapeHtml(item.projectName)}: ${escapeHtml(item.title)}</h2>
        <p style="margin:0 0 10px"><strong>${escapeHtml(item.classification)}</strong> · ${Math.round(item.confidence * 100)}% confidence</p>
        <p><strong>Who:</strong> ${escapeHtml(item.fiveWOneH.who)}</p>
        <p><strong>What:</strong> ${escapeHtml(item.fiveWOneH.what)}</p>
        <p><strong>Where:</strong> <a href="${escapeHtml(item.evidenceUrl)}">${escapeHtml(item.evidenceUrl)}</a></p>
        <p><strong>When:</strong> ${escapeHtml(item.fiveWOneH.when)}</p>
        <p><strong>Why:</strong> ${escapeHtml(item.fiveWOneH.why)}</p>
        <p><strong>How:</strong> ${escapeHtml(item.fiveWOneH.how)}</p>
      </article>`).join("")
    : "<p>No public external-use evidence is currently tracked.</p>";

  const warnings = options.warnings?.length
    ? `<p style="padding:10px;background:#fff7dd;border-radius:8px"><strong>Coverage warnings:</strong> ${escapeHtml(options.warnings.join(", "))}</p>`
    : "";

  return {
    subject,
    text: `Founder Control Room external code-use ledger\nGenerated: ${options.generatedAt}\nNew: ${options.newItemCount}\nTracked: ${options.items.length}${warningText}\n\n${textItems}`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.45;color:#202033;max-width:760px;margin:auto;padding:20px">
      <h1 style="font-size:22px">External code-use ledger</h1>
      <p>Generated ${escapeHtml(options.generatedAt)} · ${options.newItemCount} new · ${options.items.length} tracked</p>
      ${warnings}
      ${htmlItems}
    </body></html>`,
  };
}
