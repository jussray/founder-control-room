import { createHash } from "node:crypto";
import { supabase } from "../lib/supabaseClient.js";
import { McpHub } from "../mcp/hub.js";
import type { McpToolDefinition } from "../mcp/types.js";
import { extractExternalUseCandidates } from "./normalize.js";
import {
  classifyPublicCoverage,
  isMeaningfulPublicCoverage,
  renderPublicCoverageAlert,
  type PublicCoverageMention,
} from "./publicCoverage.js";
import type { ExternalUseCandidate, ExternalUseProject } from "./types.js";

const WATCH_PROJECT: ExternalUseProject = {
  slug: "founder-control-room",
  name: "Juss & Co",
  repository: "jussray/founder-control-room",
};

const COVERAGE_SOURCE = "exa_public_coverage";
const COVERAGE_EVENT_TYPE = "public_coverage_mention";
const COVERAGE_PAYLOAD_KIND = "juss-and-co-public-coverage-v1";
const COVERAGE_RECIPIENT = "sekretbip@gmail.com";
const COVERAGE_INTERVAL_HOURS = 6;
const COVERAGE_EVENT_LOOKBACK = 500;
const RESEND_TIMEOUT_MS = 15_000;

interface StoredCoverageRow {
  id: unknown;
  payload: unknown;
  observed_at: unknown;
}

interface StoredCoveragePayload {
  kind?: unknown;
  evidence_hash?: unknown;
  alerted?: unknown;
  mention?: unknown;
}

interface CoverageCycleSummary {
  status: "sent" | "quiet" | "skipped" | "failed";
  discovered?: number;
  persisted?: number;
  alerted?: number;
  warnings?: string[];
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return createHash("sha256").update(message).digest("hex").slice(0, 16);
}

function asProperties(tool: McpToolDefinition): Record<string, unknown> {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== "object") return {};
  const properties = schema.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties)
    ? properties as Record<string, unknown>
    : {};
}

function setFirstSupported(
  args: Record<string, unknown>,
  properties: Record<string, unknown>,
  names: readonly string[],
  value: unknown,
): boolean {
  const key = names.find((name) => Object.hasOwn(properties, name));
  if (!key) return false;
  args[key] = value;
  return true;
}

function searchArguments(tool: McpToolDefinition, query: string): Record<string, unknown> {
  const properties = asProperties(tool);
  const args: Record<string, unknown> = {};
  if (!setFirstSupported(args, properties, ["query", "q", "search_query", "searchQuery"], query)) {
    args.query = query;
  }
  setFirstSupported(args, properties, ["num_results", "numResults", "limit", "per_page", "perPage"], 15);
  setFirstSupported(args, properties, ["include_text", "includeText"], true);
  return args;
}

function findSearchTool(tools: readonly McpToolDefinition[]): McpToolDefinition | undefined {
  const preferred = ["deep_search_exa", "web_search_advanced_exa", "web_search_exa"] as const;
  for (const name of preferred) {
    const exact = tools.find((tool) => tool.name === name);
    if (exact) return exact;
    const namespaced = tools.find((tool) => tool.name.endsWith(`_${name}`) || tool.name.endsWith(`.${name}`));
    if (namespaced) return namespaced;
  }
  return undefined;
}

function coverageQueries(): string[] {
  return [
    [
      "Find recent public coverage or substantive commentary that explicitly mentions",
      "\"Juss & Co\", \"Juss&Co\", \"Raylene McGill\", or \"Juss Ray\".",
      "Prioritize investor, founder/operator, user/customer, partner, and technical commentary.",
      "Exclude Juss-owned websites, jussray-owned GitHub pages, people directories, company directories, profile directories, and mere name listings.",
      "Return the source URL, title, and enough quoted-or-paraphrased context to judge what was actually said.",
      "Do not infer endorsement, criticism, investment interest, partnership, usage, or traction without explicit public evidence.",
    ].join(" "),
    [
      "Find outside-world commentary connecting Juss & Co or Raylene McGill to",
      "Se'kret Bip, Founder Control Room, Chief AI Machine, PromptOS, StoryEngine, or Juss Beautiful Hair.",
      "Focus on investor analysis, founder/operator discussion, user experience, partner commentary, or technical architecture/verification/governance discussion.",
      "Exclude Juss-owned properties, jussray-owned GitHub pages, directory listings, and copied bios with no substantive commentary.",
      "Return source URLs, titles, and concise evidence summaries only.",
    ].join(" "),
  ];
}

async function discoverCoverage(hub = new McpHub()): Promise<{
  mentions: PublicCoverageMention[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  try {
    const capabilities = await hub.discoverCapabilities("exa", WATCH_PROJECT.slug);
    const tool = findSearchTool(capabilities.tools);
    if (!tool) return { mentions: [], warnings: ["public_coverage_exa_no_search_tool"] };

    const batches = await Promise.all(
      coverageQueries().map(async (query) => {
        const invocation = await hub.invoke({
          serverId: "exa",
          projectId: WATCH_PROJECT.slug,
          toolName: tool.name,
          arguments: searchArguments(tool, query),
        });
        return extractExternalUseCandidates({
          result: invocation.result,
          project: WATCH_PROJECT,
          source: "exa_mcp",
          sourceTool: tool.name,
          discoveryQuery: query,
        });
      }),
    );

    const merged = new Map<string, ExternalUseCandidate>();
    for (const candidate of batches.flat()) {
      const key = candidate.evidenceUrl.toLowerCase();
      const previous = merged.get(key);
      if (!previous || candidate.evidenceSummary.length > previous.evidenceSummary.length) {
        merged.set(key, candidate);
      }
    }

    const mentions = [...merged.values()]
      .map(classifyPublicCoverage)
      .filter(isMeaningfulPublicCoverage);

    return { mentions, warnings };
  } catch (error) {
    throw new Error(`public_coverage_exa_unavailable:${errorCode(error)}`);
  }
}

function isStoredCoveragePayload(value: unknown): value is StoredCoveragePayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPublicCoverageMention(value: unknown): value is PublicCoverageMention {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const mention = value as Partial<PublicCoverageMention>;
  return typeof mention.evidenceHash === "string"
    && typeof mention.evidenceUrl === "string"
    && typeof mention.title === "string"
    && typeof mention.evidenceSummary === "string"
    && typeof mention.audience === "string"
    && typeof mention.materiality === "string"
    && typeof mention.confidence === "number"
    && typeof mention.whyMatters === "string"
    && typeof mention.followUp === "string"
    && typeof mention.observedAt === "string"
    && typeof mention.sourceTool === "string";
}

async function loadStoredCoverageEvents(): Promise<Array<{
  id: string;
  payload: StoredCoveragePayload;
  mention?: PublicCoverageMention;
}>> {
  const { data, error } = await supabase
    .from("events")
    .select("id,payload,observed_at")
    .eq("source", COVERAGE_SOURCE)
    .eq("event_type", COVERAGE_EVENT_TYPE)
    .order("observed_at", { ascending: false })
    .limit(COVERAGE_EVENT_LOOKBACK);
  if (error) throw new Error(`public_coverage_event_read_failed:${error.message}`);

  return ((data ?? []) as StoredCoverageRow[])
    .map((row) => {
      const payload = isStoredCoveragePayload(row.payload) ? row.payload : {};
      const mention = isPublicCoverageMention(payload.mention) ? payload.mention : undefined;
      return { id: String(row.id), payload, mention };
    });
}

async function persistNewMentions(
  mentions: readonly PublicCoverageMention[],
  existing: readonly { payload: StoredCoveragePayload }[],
): Promise<number> {
  const known = new Set(
    existing
      .filter((row) => row.payload.kind === COVERAGE_PAYLOAD_KIND)
      .map((row) => String(row.payload.evidence_hash ?? ""))
      .filter(Boolean),
  );
  const rows = mentions
    .filter((mention) => !known.has(mention.evidenceHash))
    .map((mention) => ({
      source: COVERAGE_SOURCE,
      lane_id: "founder-os",
      event_type: COVERAGE_EVENT_TYPE,
      observed_at: mention.observedAt,
      payload: {
        kind: COVERAGE_PAYLOAD_KIND,
        evidence_hash: mention.evidenceHash,
        alerted: false,
        mention,
      },
    }));

  if (!rows.length) return 0;
  const { error } = await supabase.from("events").insert(rows);
  if (error) throw new Error(`public_coverage_event_insert_failed:${error.message}`);
  return rows.length;
}

function pendingMeaningfulEvents(
  rows: readonly { id: string; payload: StoredCoveragePayload; mention?: PublicCoverageMention }[],
): Array<{ id: string; payload: StoredCoveragePayload; mention: PublicCoverageMention }> {
  return rows.filter(
    (row): row is { id: string; payload: StoredCoveragePayload; mention: PublicCoverageMention } =>
      row.payload.kind === COVERAGE_PAYLOAD_KIND
      && row.payload.alerted !== true
      && Boolean(row.mention)
      && isMeaningfulPublicCoverage(row.mention as PublicCoverageMention),
  );
}

async function sendCoverageAlert(
  mentions: readonly PublicCoverageMention[],
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EXTERNAL_USE_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("public_coverage_resend_not_configured");

  const rendered = renderPublicCoverageAlert(mentions);
  const idempotency = createHash("sha256")
    .update([...mentions].map((mention) => mention.evidenceHash).sort().join("|"))
    .digest("hex")
    .slice(0, 32);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `juss-public-coverage-${idempotency}`,
      },
      body: JSON.stringify({
        from,
        to: [COVERAGE_RECIPIENT],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [
          { name: "system", value: "founder-control-room" },
          { name: "report", value: "public-coverage" },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({})) as { id?: unknown };
    if (!response.ok) throw new Error(`public_coverage_resend_send_failed:${response.status}`);
    if (typeof payload.id !== "string" || !payload.id) {
      throw new Error("public_coverage_resend_missing_email_id");
    }
    return payload.id;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("public_coverage_resend_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function markAlerted(
  events: readonly { id: string; payload: StoredCoveragePayload }[],
  resendEmailId: string,
  now: Date,
): Promise<void> {
  const updates = await Promise.all(events.map(async (event) => {
    const { error } = await supabase
      .from("events")
      .update({
        payload: {
          ...event.payload,
          alerted: true,
          alerted_at: now.toISOString(),
          resend_email_id: resendEmailId,
        },
        processed: true,
      })
      .eq("id", event.id);
    return error;
  }));
  const firstError = updates.find(Boolean);
  if (firstError) throw new Error(`public_coverage_event_update_failed:${firstError.message}`);
}

export async function runPublicCoverageWatchCycle(
  now = new Date(),
  hub = new McpHub(),
): Promise<CoverageCycleSummary> {
  if (now.getUTCMinutes() !== 0 || now.getUTCHours() % COVERAGE_INTERVAL_HOURS !== 0) {
    return { status: "skipped" };
  }

  try {
    const before = await loadStoredCoverageEvents();
    const discovery = await discoverCoverage(hub);
    const persisted = await persistNewMentions(discovery.mentions, before);
    const after = persisted ? await loadStoredCoverageEvents() : before;
    const pending = pendingMeaningfulEvents(after);

    if (!pending.length) {
      return {
        status: "quiet",
        discovered: discovery.mentions.length,
        persisted,
        alerted: 0,
        warnings: discovery.warnings,
      };
    }

    const resendEmailId = await sendCoverageAlert(pending.map((event) => event.mention));
    await markAlerted(pending, resendEmailId, now);

    return {
      status: "sent",
      discovered: discovery.mentions.length,
      persisted,
      alerted: pending.length,
      warnings: discovery.warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      warnings: [`public_coverage_cycle_failed:${errorCode(error)}`],
    };
  }
}
