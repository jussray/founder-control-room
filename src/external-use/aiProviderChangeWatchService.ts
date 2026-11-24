import { createHash } from "node:crypto";
import { McpHub } from "../mcp/hub.js";
import { makeSupabaseClient, type SupabaseEnv } from "../lib/supabaseClient.js";
import { sendFounderControlRoomEmail, type ProjectEmailBinding } from "../worker/projectEmail.js";
import { extractExternalUseCandidates } from "./normalize.js";
import type { ExternalUseProject } from "./types.js";
import {
  createAiProviderChangeReceipt,
  deterministicEventId,
  isNewCoverageFailure,
  renderAiProviderChangeAlert,
  type AiProvider,
  type AiProviderChangeReceipt,
} from "./aiProviderChangeWatch.js";
import type { McpToolDefinition } from "../mcp/types.js";

const PROJECT: ExternalUseProject = {
  slug: "founder-control-room",
  name: "Founder Control Room",
  repository: "jussray/founder-control-room",
};
const SOURCE = "ai_provider_change_watch";
const EVENT_TYPE = "ai_provider_change_candidate";
const COVERAGE_EVENT_TYPE = "ai_provider_change_coverage";
const PROVIDER_QUERIES: ReadonlyArray<{ provider: AiProvider; query: string }> = [
  {
    provider: "openai",
    query: "site:openai.com/news/product-releases OR site:help.openai.com/en/articles/6825453-chatgpt-release-notes recent ChatGPT coding computer use integrations permissions pricing plans limits",
  },
  {
    provider: "anthropic",
    query: "site:anthropic.com/news OR site:anthropic.com/pricing recent Claude coding computer use integrations permissions pricing plans limits",
  },
  {
    provider: "perplexity",
    query: "site:perplexity.ai/changelog OR site:perplexity.ai/pro recent Perplexity coding computer use integrations permissions pricing plans limits",
  },
];

interface ChangeWatchEnv extends SupabaseEnv {
  SUPABASE_PROJECT_REF: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  FCR_EMAIL: ProjectEmailBinding;
}

function searchTool(tools: readonly McpToolDefinition[]): McpToolDefinition | undefined {
  const preferred = ["deep_search_exa", "web_search_advanced_exa", "web_search_exa"];
  return preferred.flatMap((name) => [
    tools.find((tool) => tool.name === name),
    tools.find((tool) => tool.name.endsWith(`_${name}`) || tool.name.endsWith(`.${name}`)),
  ]).find((tool): tool is McpToolDefinition => Boolean(tool));
}

function queryArgs(tool: McpToolDefinition, query: string): Record<string, unknown> {
  const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  const properties = schema?.properties ?? {};
  const args: Record<string, unknown> = {};
  const queryKey = ["query", "q", "search_query", "searchQuery"].find((key) => key in properties) ?? "query";
  args[queryKey] = query;
  const limitKey = ["num_results", "numResults", "limit", "per_page", "perPage"]
    .find((key) => key in properties);
  if (limitKey) args[limitKey] = 15;
  const includeTextKey = ["include_text", "includeText"].find((key) => key in properties);
  if (includeTextKey) args[includeTextKey] = true;
  return args;
}

function shortErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return createHash("sha256").update(message).digest("hex").slice(0, 16);
}

function isReceipt(value: unknown): value is AiProviderChangeReceipt {
  return Boolean(value && typeof value === "object"
    && (value as { schema?: unknown }).schema === "juss.ai-provider-change@v1"
    && typeof (value as { event_fingerprint?: unknown }).event_fingerprint === "string");
}

export interface AiProviderChangeWatchSummary {
  status: "skipped" | "partial" | "failed";
  providers_scanned: number;
  candidates: number;
  inserted: number;
  coverage: Record<AiProvider, "COMPLETE" | "PARTIAL" | "FAILED">;
  warnings: string[];
}

/** Scan once at the top of each UTC hour; the Worker cron itself runs every minute. */
export async function runAiProviderChangeWatchCycle(
  env: ChangeWatchEnv,
  now = new Date(),
  hub = new McpHub(),
): Promise<AiProviderChangeWatchSummary> {
  if (now.getUTCMinutes() !== 0) {
    return {
      status: "skipped",
      providers_scanned: 0,
      candidates: 0,
      inserted: 0,
      coverage: { openai: "PARTIAL", anthropic: "PARTIAL", perplexity: "PARTIAL" },
      warnings: [],
    };
  }

  const supabase = makeSupabaseClient(env);
  const coverage: AiProviderChangeWatchSummary["coverage"] = {
    openai: "FAILED",
    anthropic: "FAILED",
    perplexity: "FAILED",
  };
  const warnings: string[] = [];
  let capabilities: Awaited<ReturnType<McpHub["discoverCapabilities"]>>;
  try {
    capabilities = await hub.discoverCapabilities("exa", PROJECT.slug);
  } catch (error) {
    const code = shortErrorCode(error);
    await persistCoverage(supabase, now, coverage, code);
    await deliverPendingAlerts(supabase, env, now);
    return {
      status: "failed",
      providers_scanned: 0,
      candidates: 0,
      inserted: 0,
      coverage,
      warnings: ["exa_capability_discovery_failed"],
    };
  }

  const tool = searchTool(capabilities.tools);
  if (!tool) {
    await persistCoverage(supabase, now, coverage, "exa_search_tool_unavailable");
    await deliverPendingAlerts(supabase, env, now);
    return {
      status: "failed",
      providers_scanned: 0,
      candidates: 0,
      inserted: 0,
      coverage,
      warnings: ["exa_search_tool_unavailable"],
    };
  }

  const candidates = [];
  const publishedSince = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  for (const entry of PROVIDER_QUERIES) {
    try {
      const query = `${entry.query} only include provider items published or updated since ${publishedSince}`;
      const invocation = await hub.invoke({
        serverId: "exa",
        projectId: PROJECT.slug,
        toolName: tool.name,
        arguments: queryArgs(tool, query),
      });
      const found = extractExternalUseCandidates({
        result: invocation.result,
        project: PROJECT,
        source: "exa_mcp",
        sourceTool: tool.name,
        discoveryQuery: query,
        observedAt: now.toISOString(),
      });
      candidates.push(...found.filter((candidate) => {
        const receipt = createAiProviderChangeReceipt(candidate, "PARTIAL");
        return receipt?.provider === entry.provider;
      }));
      coverage[entry.provider] = "PARTIAL";
    } catch (error) {
      coverage[entry.provider] = "FAILED";
      warnings.push(`${entry.provider}_search_failed:${shortErrorCode(error)}`);
    }
  }

  const coverageCount = Object.values(coverage).filter((value) => value !== "FAILED").length;
  const overallCoverage = coverageCount > 0 ? "PARTIAL" : "FAILED";
  const receipts = candidates
    .map((candidate) => createAiProviderChangeReceipt(candidate, overallCoverage))
    .filter((receipt) => Boolean(receipt));

  let inserted = 0;
  for (const receipt of receipts) {
    if (!receipt) continue;
    const row = {
      id: deterministicEventId(receipt.event_fingerprint),
      source: SOURCE,
      lane_id: "founder-os",
      event_type: EVENT_TYPE,
      observed_at: receipt.observed_at,
      payload: {
        kind: receipt.schema,
        event_fingerprint: receipt.event_fingerprint,
        review_required: true,
        receipt,
      },
    };
    const { data, error } = await supabase
      .from("events")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`ai_provider_change_event_write_failed:${error.code ?? "unknown"}`);
    if (data?.length) inserted += data.length;
  }

  await persistCoverage(supabase, now, coverage, undefined, receipts.length, warnings);
  await deliverPendingAlerts(supabase, env, now);

  const status = coverageCount === 0 ? "failed" : "partial";
  return {
    status,
    providers_scanned: coverageCount,
    candidates: receipts.length,
    inserted,
    coverage,
    warnings,
  };
}

async function deliverPendingAlerts(
  supabase: ReturnType<typeof makeSupabaseClient>,
  env: ChangeWatchEnv,
  now: Date,
): Promise<void> {
  const { data: pendingRows, error: pendingError } = await supabase
    .from("events")
    .select("id,payload,event_type")
    .eq("source", SOURCE)
    .eq("processed", false)
    .in("event_type", [EVENT_TYPE, COVERAGE_EVENT_TYPE])
    .order("observed_at", { ascending: true })
    .limit(20);
  if (pendingError) throw new Error(`ai_provider_change_event_read_failed:${pendingError.code ?? "unknown"}`);

  const pending = pendingRows ?? [];
  const pendingReceipts = pending
    .map((row) => (row.payload as { receipt?: unknown } | null)?.receipt)
    .filter(isReceipt);
  const pendingFailures = pending
    .filter((row) => row.event_type === COVERAGE_EVENT_TYPE)
    .map((row) => row.payload as { provider?: unknown; error_code?: unknown })
    .filter((row): row is { provider: AiProvider; error_code: string } =>
      (row.provider === "openai" || row.provider === "anthropic" || row.provider === "perplexity")
      && typeof row.error_code === "string");
  if (pending.length) {
    const alert = renderAiProviderChangeAlert(pendingReceipts, pendingFailures);
    const messageId = await sendFounderControlRoomEmail(env.FCR_EMAIL, {
      to: "sekretbip@gmail.com",
      subject: alert.subject,
      text: alert.text,
    });
    const updates = await Promise.all(pending.map((row) =>
      supabase.from("events").update({
        processed: true,
        payload: {
          ...(row.payload as Record<string, unknown>),
          notified_at: now.toISOString(),
          notification_message_id: messageId,
        },
      }).eq("id", row.id)));
    const failedUpdate = updates.find((result) => result.error);
    if (failedUpdate?.error) {
      throw new Error(`ai_provider_change_event_ack_failed:${failedUpdate.error.code ?? "unknown"}`);
    }
  }
}

async function persistCoverage(
  supabase: ReturnType<typeof makeSupabaseClient>,
  now: Date,
  coverage: Record<AiProvider, "COMPLETE" | "PARTIAL" | "FAILED">,
  sharedErrorCode?: string,
  candidateCount = 0,
  warnings: readonly string[] = [],
): Promise<void> {
  const observedAt = now.toISOString();
  const bucket = observedAt.slice(0, 13);
  const latestStatuses = await Promise.all((Object.keys(coverage) as AiProvider[]).map(async (provider) => {
    const { data, error } = await supabase
      .from("events")
      .select("payload")
      .eq("source", SOURCE)
      .eq("event_type", COVERAGE_EVENT_TYPE)
      .filter("payload->>provider", "eq", provider)
      .order("observed_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`ai_provider_change_coverage_read_failed:${error.code ?? "unknown"}`);
    const status = (data?.[0]?.payload as { source_coverage?: unknown } | undefined)?.source_coverage;
    return [provider, status === "COMPLETE" || status === "PARTIAL" || status === "FAILED" ? status : undefined] as const;
  }));
  const latestByProvider = new Map(latestStatuses);
  const rows = (Object.entries(coverage) as Array<[AiProvider, "COMPLETE" | "PARTIAL" | "FAILED"]>)
    .map(([provider, sourceCoverage]) => {
      const providerFailure = warnings.find((warning) => warning.startsWith(`${provider}_search_failed:`));
      const errorCode = sourceCoverage === "FAILED"
        ? providerFailure?.split(":")[1] ?? sharedErrorCode ?? "source_unavailable"
        : undefined;
      const fingerprint = createHash("sha256")
        .update(`${provider}|${bucket}|${sourceCoverage}|${errorCode ?? "searched"}`)
        .digest("hex");
      return {
        id: deterministicEventId(fingerprint),
        source: SOURCE,
        lane_id: "founder-os",
        event_type: COVERAGE_EVENT_TYPE,
        observed_at: observedAt,
        processed: sourceCoverage !== "FAILED"
          || !isNewCoverageFailure(latestByProvider.get(provider)),
        payload: {
          kind: "juss.ai-provider-change.coverage@v1",
          provider,
          source_coverage: sourceCoverage,
          observed_at: observedAt,
          candidate_count: sourceCoverage === "FAILED" ? 0 : candidateCount,
          ...(errorCode ? { error_code: errorCode } : {}),
        },
      };
    });
  const { error } = await supabase.from("events").upsert(rows, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`ai_provider_change_coverage_write_failed:${error.code ?? "unknown"}`);
}
