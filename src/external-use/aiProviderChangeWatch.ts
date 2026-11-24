import { createHash } from "node:crypto";
import type { ExternalUseCandidate } from "./types.js";

export type AiProvider = "openai" | "anthropic" | "perplexity";
export type AiProviderChangeCategory =
  | "coding"
  | "computer_use"
  | "integrations"
  | "authorized_actions"
  | "pricing"
  | "plans"
  | "limits";

const OFFICIAL_HOSTS: Readonly<Record<AiProvider, readonly string[]>> = {
  openai: ["openai.com"],
  anthropic: ["anthropic.com"],
  perplexity: ["perplexity.ai"],
};

const CATEGORY_PATTERNS: ReadonlyArray<readonly [AiProviderChangeCategory, RegExp]> = [
  ["pricing", /\b(pricing|price|cost|billing|charged|subscription fee)\b/i],
  ["plans", /\b(plan|tier|pro|plus|team|enterprise|subscriber|availability)\b/i],
  ["limits", /\b(limit|quota|rate limit|context window|usage cap|credits)\b/i],
  ["computer_use", /\b(computer use|computer-use|browser use|browser control|desktop|screen control)\b/i],
  ["authorized_actions", /\b(permissions?|approval|authorized action|allowlist|write access|execute action)\b/i],
  ["integrations", /\b(integration|connector|connect to|mcp|app directory|third-party app)\b/i],
  ["coding", /\b(coding|code|developer|agent|terminal|cli|repository|github)\b/i],
];

export interface AiProviderChangeReceipt {
  schema: "juss.ai-provider-change@v1";
  event_fingerprint: string;
  provider: AiProvider;
  category: AiProviderChangeCategory;
  headline: string;
  change_summary: string;
  previous_state: "UNKNOWN";
  new_state: string;
  availability: "UNKNOWN";
  source_url: string;
  evidence_urls: string[];
  published_at: null;
  effective_at: null;
  observed_at: string;
  source_coverage: "COMPLETE" | "PARTIAL" | "FAILED";
  project_impacts: Record<"fcr" | "chief" | "solcontinuity" | "promptos", string>;
  safe_test: string;
}

export function providerForOfficialUrl(value: string): AiProvider | undefined {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (Object.entries(OFFICIAL_HOSTS) as Array<[AiProvider, readonly string[]]>)
      .find(([, hosts]) => hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)))?.[0];
  } catch {
    return undefined;
  }
}

export function classifyAiProviderChange(text: string): AiProviderChangeCategory | undefined {
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0];
}

function canonicalSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|ref|source|trk|campaign)$/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

function fingerprint(receipt: Omit<AiProviderChangeReceipt, "event_fingerprint">): string {
  const canonical = JSON.stringify({
    provider: receipt.provider,
    category: receipt.category,
    source_url: canonicalSourceUrl(receipt.source_url),
    published_at: receipt.published_at,
    headline: receipt.headline.replace(/\s+/g, " ").trim().toLowerCase(),
    availability: receipt.availability,
    change_summary: receipt.change_summary.replace(/\s+/g, " ").trim().toLowerCase(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function createAiProviderChangeReceipt(
  candidate: ExternalUseCandidate,
  sourceCoverage: AiProviderChangeReceipt["source_coverage"],
): AiProviderChangeReceipt | undefined {
  const provider = providerForOfficialUrl(candidate.evidenceUrl);
  if (!provider) return undefined;

  const category = classifyAiProviderChange(`${candidate.title} ${candidate.evidenceSummary}`);
  if (!category) return undefined;

  const summary = candidate.evidenceSummary.replace(/\s+/g, " ").trim().slice(0, 1_000);
  const base: Omit<AiProviderChangeReceipt, "event_fingerprint"> = {
    schema: "juss.ai-provider-change@v1",
    provider,
    category,
    headline: candidate.title.replace(/\s+/g, " ").trim().slice(0, 300),
    change_summary: summary,
    previous_state: "UNKNOWN",
    new_state: summary,
    availability: "UNKNOWN",
    source_url: canonicalSourceUrl(candidate.evidenceUrl),
    evidence_urls: [canonicalSourceUrl(candidate.evidenceUrl)],
    published_at: null,
    effective_at: null,
    observed_at: candidate.observedAt,
    source_coverage: sourceCoverage,
    project_impacts: {
      fcr: "UNKNOWN",
      chief: "UNKNOWN",
      solcontinuity: "UNKNOWN",
      promptos: "UNKNOWN",
    },
    safe_test: "Read the official release and confirm whether the described capability is available in the intended account; do not change settings.",
  };

  return { ...base, event_fingerprint: fingerprint(base) };
}

export function deterministicEventId(fingerprintValue: string): string {
  const bytes = createHash("sha256").update(fingerprintValue).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function renderAiProviderChangeAlert(
  receipts: readonly AiProviderChangeReceipt[],
  coverageFailures: readonly { provider: AiProvider; error_code: string }[] = [],
): { subject: string; text: string } {
  const lines = [
    "FCR AI Provider Watch",
    "Official-domain search candidates and coverage failures are listed for review; this is not proof of account entitlement.",
    "Search-based source coverage is PARTIAL.",
    "",
  ];
  for (const receipt of receipts) {
    lines.push(
      `${receipt.provider} — ${receipt.category}: ${receipt.headline}`,
      `Source: ${receipt.source_url}`,
      `Evidence: ${receipt.change_summary}`,
      "Availability: UNKNOWN; review the provider source before relying on this change.",
      `Read-only test: ${receipt.safe_test}`,
      "",
    );
  }
  for (const failure of coverageFailures) {
    lines.push(`${failure.provider} source search failed (reference ${failure.error_code}); no-change was not inferred.`);
  }
  return {
    subject: `FCR AI provider watch: ${receipts.length} candidate(s), ${coverageFailures.length} coverage failure(s)`,
    text: lines.join("\n").slice(0, 18_000),
  };
}

export function isNewCoverageFailure(
  previous: "COMPLETE" | "PARTIAL" | "FAILED" | undefined,
): boolean {
  return previous !== "FAILED";
}
