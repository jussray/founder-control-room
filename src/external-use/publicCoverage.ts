import { createHash } from "node:crypto";
import type { ExternalUseCandidate } from "./types.js";

export type PublicCoverageAudience =
  | "investor"
  | "founder_operator"
  | "user"
  | "partner"
  | "technical"
  | "other";

export type PublicCoverageMateriality = "MATERIAL" | "WATCH" | "NOISE" | "UNKNOWN";

export interface PublicCoverageMention {
  evidenceHash: string;
  evidenceUrl: string;
  title: string;
  evidenceSummary: string;
  audience: PublicCoverageAudience;
  materiality: PublicCoverageMateriality;
  confidence: number;
  whyMatters: string;
  followUp: string;
  observedAt: string;
  sourceTool: string;
}

const EXACT_IDENTITY_PATTERNS = [
  /\bjuss\s*&\s*co\.?\b/i,
  /\bjuss&co\.?\b/i,
  /\braylene\s+mcgill\b/i,
  /\bjuss\s+ray\b/i,
] as const;

const STRONG_PRODUCT_IDENTITY_PATTERNS = [
  /\bse['’]?kret\s+bip\b/i,
  /\bsekret\s+bip\b/i,
  /\bjuss\s+beautiful\s+hair\b/i,
  /\bjussray\/(?:founder-control-room|chief-ai-machine|promptos|storyengine|jussbeautifulhair(?:-site)?)\b/i,
] as const;

const WEAK_PRODUCT_IDENTITY_PATTERNS = [
  /\bfounder\s+control\s+room\b/i,
  /\bchief\s+ai\s+machine\b/i,
  /\bpromptos\b/i,
  /\bstoryengine\b/i,
] as const;

const AUDIENCE_SIGNALS: Readonly<Record<Exclude<PublicCoverageAudience, "other">, readonly RegExp[]>> = {
  investor: [
    /\binvest(?:or|ment|ing|able|ment-grade)\b/i,
    /\bventure(?:\s+capital)?\b/i,
    /\bvc\b/i,
    /\bfund(?:ing|raise|raising|ed)?\b/i,
    /\bcapital\b/i,
    /\bportfolio\s+company\b/i,
    /\bdue\s+diligence\b/i,
  ],
  founder_operator: [
    /\bfounder\b/i,
    /\boperator\b/i,
    /\bbootstrapp(?:ed|ing|er)\b/i,
    /\bbuilding\b/i,
    /\bstartup\b/i,
    /\bexecution\b/i,
    /\bgo[-\s]?to[-\s]?market\b/i,
  ],
  user: [
    /\buser\b/i,
    /\bcustomer\b/i,
    /\busing\b/i,
    /\bused\b/i,
    /\bexperience\b/i,
    /\bfeedback\b/i,
    /\breview\b/i,
    /\bhelpful\b/i,
  ],
  partner: [
    /\bpartner(?:ship|ed|ing)?\b/i,
    /\bcollaborat(?:e|ion|ing)\b/i,
    /\bintegrat(?:e|ion|ing)\b/i,
    /\balliance\b/i,
    /\bvendor\b/i,
    /\becosystem\b/i,
  ],
  technical: [
    /\barchitecture\b/i,
    /\bagent(?:ic|\s+system|\s+runtime)?\b/i,
    /\bmcp\b/i,
    /\bapi\b/i,
    /\bcloudflare\b/i,
    /\bsupabase\b/i,
    /\bverification\b/i,
    /\bgovernance\b/i,
    /\bprovenance\b/i,
    /\bevidence\b/i,
    /\bruntime\b/i,
    /\brepository\b/i,
    /\bgithub\b/i,
    /\bdeployment\b/i,
  ],
};

const OWNED_HOSTS = new Set([
  "foundercontrolroom.org",
  "www.foundercontrolroom.org",
  "sekretbip.net",
  "www.sekretbip.net",
  "welcome.sekretbip.net",
  "app.sekretbip.net",
  "api.sekretbip.net",
  "jussbeautifulhair.com",
  "www.jussbeautifulhair.com",
]);

const DIRECTORY_TEXT = /\b(?:people|profile|employee|member|company)\s+director(?:y|ies)\b|\b\d{2,}\+?\s+profiles\b/i;
const SUBSTANTIVE_TEXT = /\b(?:said|says|argues|notes|explains|review|analysis|commentary|interview|discussion|thread|article|post|feedback|experience|technical|architecture|invest|partner|customer|user|founder|operator)\b/i;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|ref|source|tracking|trk|campaign)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return value.trim();
  }
}

function evidenceHash(url: string): string {
  return createHash("sha256").update(canonicalUrl(url).toLowerCase()).digest("hex");
}

function haystack(candidate: ExternalUseCandidate): string {
  return cleanText(`${candidate.title} ${candidate.evidenceSummary} ${candidate.evidenceUrl}`);
}

function identityStrength(text: string): 0 | 1 | 2 {
  if (EXACT_IDENTITY_PATTERNS.some((pattern) => pattern.test(text))) return 2;
  if (STRONG_PRODUCT_IDENTITY_PATTERNS.some((pattern) => pattern.test(text))) return 2;
  if (WEAK_PRODUCT_IDENTITY_PATTERNS.some((pattern) => pattern.test(text))) return 1;
  return 0;
}

function isOwned(candidate: ExternalUseCandidate): boolean {
  try {
    const url = new URL(candidate.evidenceUrl);
    const host = url.hostname.toLowerCase();
    if (OWNED_HOSTS.has(host)) return true;
    if (host === "github.com" && /^\/jussray(?:\/|$)/i.test(url.pathname)) return true;
  } catch {
    // Invalid URLs are retained for later UNKNOWN classification.
  }
  return candidate.externalOwner?.toLowerCase() === "jussray";
}

function isDirectoryNoise(candidate: ExternalUseCandidate): boolean {
  const text = haystack(candidate);
  if (DIRECTORY_TEXT.test(text)) return true;
  try {
    const url = new URL(candidate.evidenceUrl);
    if (url.hostname.toLowerCase().endsWith("linkedin.com")) {
      return /^\/(?:pub\/dir|in\/|company\/)/i.test(url.pathname);
    }
  } catch {
    // Let malformed URLs fall through to normal materiality logic.
  }
  return false;
}

function audienceFor(text: string): PublicCoverageAudience {
  const scored = (Object.entries(AUDIENCE_SIGNALS) as Array<
    [Exclude<PublicCoverageAudience, "other">, readonly RegExp[]]
  >)
    .map(([audience, patterns]) => ({
      audience,
      score: patterns.reduce((total, pattern) => total + Number(pattern.test(text)), 0),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].audience : "other";
}

function whyMattersFor(audience: PublicCoverageAudience, materiality: PublicCoverageMateriality): string {
  if (materiality === "UNKNOWN") {
    return "The mention may be relevant, but the available public evidence is too thin to support a stronger interpretation.";
  }
  switch (audience) {
    case "investor":
      return "Investor-facing commentary can affect fundraising conversations, diligence, introductions, and how Juss & Co is framed to capital.";
    case "partner":
      return "Partner commentary can create or change a collaboration, distribution, integration, or credibility path.";
    case "technical":
      return "Technical commentary can validate, challenge, or expose assumptions about Juss & Co systems, architecture, verification, or implementation.";
    case "user":
      return "User commentary is direct product evidence and can surface adoption, friction, trust, or demand signals worth reviewing.";
    case "founder_operator":
      return "Founder/operator commentary can shape reputation, peer learning, distribution, and practical execution opportunities.";
    default:
      return "This is an externally observed public mention of Juss & Co that may change a founder decision.";
  }
}

function followUpFor(audience: PublicCoverageAudience, materiality: PublicCoverageMateriality): string {
  if (materiality === "UNKNOWN") return "Review the source before acting; do not infer endorsement, criticism, traction, or intent from a thin mention.";
  switch (audience) {
    case "investor":
      return "Review the source identity and context, then decide whether it creates a real investor follow-up, introduction, or diligence question.";
    case "partner":
      return "Review whether the named organization or person has an actionable collaboration path before any outreach.";
    case "technical":
      return "Check the technical claim against current repository/runtime evidence before reusing it publicly or changing the product.";
    case "user":
      return "Review the underlying user experience and determine whether it maps to a product fix, proof point, or follow-up conversation.";
    case "founder_operator":
      return "Review whether the commentary creates a useful peer conversation, distribution path, or operating lesson.";
    default:
      return "Review the original source and decide whether any founder action is justified.";
  }
}

export function classifyPublicCoverage(candidate: ExternalUseCandidate): PublicCoverageMention {
  const text = haystack(candidate);
  const identity = identityStrength(text);
  const audience = audienceFor(text);
  const summaryLength = cleanText(candidate.evidenceSummary).length;
  const substantive = summaryLength >= 90 || SUBSTANTIVE_TEXT.test(candidate.evidenceSummary);

  let materiality: PublicCoverageMateriality;
  let confidence: number;

  if (isOwned(candidate) || isDirectoryNoise(candidate) || identity === 0) {
    materiality = "NOISE";
    confidence = identity === 0 ? 0.16 : 0.92;
  } else if (identity < 2 || !substantive || audience === "other") {
    materiality = "UNKNOWN";
    confidence = identity === 2 ? 0.64 : 0.46;
  } else {
    const preferred = audience !== "other";
    const highValueAudience = audience === "investor" || audience === "partner" || audience === "technical";
    confidence = Math.min(0.98, 0.52 + identity * 0.16 + (preferred ? 0.12 : 0) + (highValueAudience ? 0.08 : 0));
    materiality = identity === 2 && highValueAudience && confidence >= 0.8 ? "MATERIAL" : "WATCH";
  }

  return {
    evidenceHash: evidenceHash(candidate.evidenceUrl),
    evidenceUrl: canonicalUrl(candidate.evidenceUrl),
    title: cleanText(candidate.title).slice(0, 300),
    evidenceSummary: cleanText(candidate.evidenceSummary).slice(0, 1_500),
    audience,
    materiality,
    confidence,
    whyMatters: whyMattersFor(audience, materiality),
    followUp: followUpFor(audience, materiality),
    observedAt: candidate.observedAt,
    sourceTool: candidate.sourceTool,
  };
}

export function isMeaningfulPublicCoverage(mention: PublicCoverageMention): boolean {
  return mention.materiality === "MATERIAL" || mention.materiality === "WATCH";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderPublicCoverageAlert(
  mentions: readonly PublicCoverageMention[],
): { subject: string; text: string; html: string } {
  const ordered = [...mentions].sort((a, b) => {
    const materialityRank = { MATERIAL: 0, WATCH: 1, UNKNOWN: 2, NOISE: 3 } as const;
    return materialityRank[a.materiality] - materialityRank[b.materiality]
      || b.confidence - a.confidence;
  });

  const subject = ordered.length === 1
    ? `Juss & Co public coverage: ${ordered[0].materiality} ${ordered[0].audience}`
    : `Juss & Co public coverage: ${ordered.length} meaningful mentions`;

  const text = ordered.map((mention, index) => [
    `${index + 1}. ${mention.title}`,
    `Where: ${mention.evidenceUrl}`,
    `Category: ${mention.audience} | ${mention.materiality} | confidence ${Math.round(mention.confidence * 100)}%`,
    `What was said: ${mention.evidenceSummary}`,
    `Why it matters: ${mention.whyMatters}`,
    `Follow-up worth reviewing: ${mention.followUp}`,
  ].join("\n")).join("\n\n");

  const html = ordered.map((mention) => `
    <article>
      <h2>${escapeHtml(mention.title)}</h2>
      <p><strong>Where:</strong> <a href="${escapeHtml(mention.evidenceUrl)}">${escapeHtml(mention.evidenceUrl)}</a></p>
      <p><strong>Category:</strong> ${escapeHtml(mention.audience)} | ${escapeHtml(mention.materiality)} | confidence ${Math.round(mention.confidence * 100)}%</p>
      <p><strong>What was said:</strong> ${escapeHtml(mention.evidenceSummary)}</p>
      <p><strong>Why it matters:</strong> ${escapeHtml(mention.whyMatters)}</p>
      <p><strong>Follow-up worth reviewing:</strong> ${escapeHtml(mention.followUp)}</p>
    </article>
  `).join("\n");

  return { subject, text, html };
}
