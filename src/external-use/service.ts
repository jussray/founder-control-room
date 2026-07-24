import { createHash, randomUUID } from "node:crypto";
import { PORTFOLIO_PROJECTS } from "../config/portfolio.js";
import { supabase } from "../lib/supabaseClient.js";
import { McpHub } from "../mcp/hub.js";
import type { McpToolDefinition } from "../mcp/types.js";
import {
  extractExternalUseCandidates,
  normalizeExternalUse,
  renderExternalUseDigest,
} from "./normalize.js";
import type {
  ExternalUseCandidate,
  ExternalUseClassification,
  ExternalUseDigestItem,
  ExternalUseDiscoverySummary,
  ExternalUseProject,
  ExternalUseSource,
} from "./types.js";

export const EXTERNAL_USE_DIGEST_RECIPIENT = "sekretbip@gmail.com";
const MAX_DIGEST_ITEMS = 200;
const DIGEST_FAILED_RETRY_MS = 10 * 60_000;
const DIGEST_STALE_RUNNING_MS = 20 * 60_000;
const RESEND_TIMEOUT_MS = 15_000;

interface PersistResult {
  inserted: number;
  refreshed: number;
}

interface ScanResult {
  candidates: ExternalUseCandidate[];
  sourceCounts: Record<string, number>;
  warnings: string[];
}

interface DigestReservation {
  id: string;
  digestHour: string;
}

interface ExistingDiscoveryRow {
  id: unknown;
  evidence_hash: unknown;
}

interface DigestDiscoveryRow {
  id: unknown;
  project_id: unknown;
  title: unknown;
  evidence_url: unknown;
  evidence_summary: unknown;
  classification: unknown;
  confidence: unknown;
  who_text: unknown;
  what_text: unknown;
  where_text: unknown;
  when_text: unknown;
  why_text: unknown;
  how_text: unknown;
  first_seen_at: unknown;
  last_seen_at: unknown;
}

interface DigestProjectRow {
  id: unknown;
  name: unknown;
  repo_identifier: unknown;
}

interface ExistingDigestRow {
  id: unknown;
  digest_hour: unknown;
  status: unknown;
  started_at: unknown;
  updated_at: unknown;
  attempt_count: unknown;
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
  const queryAssigned = setFirstSupported(
    args,
    properties,
    ["query", "q", "search_query", "searchQuery"],
    query,
  );
  if (!queryAssigned) args.query = query;

  setFirstSupported(
    args,
    properties,
    ["num_results", "numResults", "limit", "per_page", "perPage"],
    10,
  );
  setFirstSupported(args, properties, ["include_text", "includeText"], true);
  return args;
}

function forkArguments(tool: McpToolDefinition, repository: string): Record<string, unknown> {
  const [owner, repo] = repository.split("/");
  const properties = asProperties(tool);
  const args: Record<string, unknown> = {};
  if (!setFirstSupported(args, properties, ["owner"], owner)) args.owner = owner;
  if (!setFirstSupported(args, properties, ["repo", "repository"], repo)) args.repo = repo;
  setFirstSupported(args, properties, ["limit", "per_page", "perPage"], 100);
  return args;
}

function findTool(
  tools: McpToolDefinition[],
  preferredNames: readonly string[],
): McpToolDefinition | undefined {
  for (const preferred of preferredNames) {
    const exact = tools.find((tool) => tool.name === preferred);
    if (exact) return exact;
    const namespaced = tools.find(
      (tool) => tool.name.endsWith(`_${preferred}`) || tool.name.endsWith(`.${preferred}`),
    );
    if (namespaced) return namespaced;
  }
  return undefined;
}

async function invokeSearch(options: {
  hub: McpHub;
  serverId: string;
  project: ExternalUseProject;
  source: ExternalUseSource;
  tool: McpToolDefinition;
  query: string;
  args?: Record<string, unknown>;
}): Promise<ExternalUseCandidate[]> {
  const invocation = await options.hub.invoke({
    serverId: options.serverId,
    projectId: options.project.slug,
    toolName: options.tool.name,
    arguments: options.args ?? searchArguments(options.tool, options.query),
  });

  return extractExternalUseCandidates({
    result: invocation.result,
    project: options.project,
    source: options.source,
    sourceTool: options.tool.name,
    discoveryQuery: options.query,
  });
}

async function scanGitHubMcp(
  hub: McpHub,
  project: ExternalUseProject,
): Promise<ScanResult> {
  const candidates: ExternalUseCandidate[] = [];
  const warnings: string[] = [];
  const sourceCounts: Record<string, number> = {};

  try {
    const capabilities = await hub.discoverCapabilities("github", project.slug);
    const forksTool = findTool(capabilities.tools, ["list_forks", "get_forks"]);
    const codeTool = findTool(capabilities.tools, ["search_code"]);
    const repoTool = findTool(capabilities.tools, ["search_repositories", "search_repos"]);

    if (forksTool) {
      const found = await invokeSearch({
        hub,
        serverId: "github",
        project,
        source: "github_mcp",
        tool: forksTool,
        query: `forks of ${project.repository}`,
        args: forkArguments(forksTool, project.repository),
      });
      candidates.push(...found);
      sourceCounts[forksTool.name] = found.length;
    }

    const canonicalReference = `"github.com/${project.repository}" -user:jussray`;
    if (codeTool) {
      const found = await invokeSearch({
        hub,
        serverId: "github",
        project,
        source: "github_mcp",
        tool: codeTool,
        query: canonicalReference,
      });
      candidates.push(...found);
      sourceCounts[codeTool.name] = found.length;
    }

    if (repoTool) {
      const repoName = project.repository.split("/")[1] ?? project.repository;
      const found = await invokeSearch({
        hub,
        serverId: "github",
        project,
        source: "github_mcp",
        tool: repoTool,
        query: `"${repoName}" -user:jussray`,
      });
      candidates.push(...found);
      sourceCounts[repoTool.name] = found.length;
    }

    if (!forksTool && !codeTool && !repoTool) {
      warnings.push("github_mcp_no_supported_search_tool");
    }
  } catch (error) {
    warnings.push(`github_mcp_unavailable:${errorCode(error)}`);
  }

  return { candidates, sourceCounts, warnings };
}

async function scanExaMcp(
  hub: McpHub,
  project: ExternalUseProject,
): Promise<ScanResult> {
  const warnings: string[] = [];
  const sourceCounts: Record<string, number> = {};
  try {
    const capabilities = await hub.discoverCapabilities("exa", project.slug);
    const tool = findTool(capabilities.tools, [
      "deep_search_exa",
      "web_search_advanced_exa",
      "web_search_exa",
    ]);
    if (!tool) {
      return {
        candidates: [],
        sourceCounts,
        warnings: ["exa_mcp_no_supported_search_tool"],
      };
    }

    const query = [
      "Find public repositories, packages, websites, deployments, documentation, or products",
      `that explicitly reference, fork, copy, or derive from https://github.com/${project.repository}.`,
      "Exclude the canonical repository and every jussray-owned result.",
      "Return evidence URLs and concise relationship summaries. Do not infer private use without public evidence.",
    ].join(" ");
    const candidates = await invokeSearch({
      hub,
      serverId: "exa",
      project,
      source: "exa_mcp",
      tool,
      query,
    });
    sourceCounts[tool.name] = candidates.length;
    return { candidates, sourceCounts, warnings };
  } catch (error) {
    warnings.push(`exa_mcp_unavailable:${errorCode(error)}`);
    return { candidates: [], sourceCounts, warnings };
  }
}

function mergeCandidates(candidates: ExternalUseCandidate[]): ExternalUseCandidate[] {
  const merged = new Map<string, ExternalUseCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.evidenceUrl.toLowerCase()}|${candidate.externalRepository?.toLowerCase() ?? ""}`;
    const previous = merged.get(key);
    if (!previous || candidate.evidenceSummary.length > previous.evidenceSummary.length) {
      merged.set(key, candidate);
    }
  }
  return [...merged.values()].slice(0, 150);
}

async function projectUuid(slug: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`external_use_project_lookup_failed:${error.message}`);
  if (!data) throw new Error(`external_use_project_missing:${slug}`);
  return String(data.id);
}

async function persistCandidates(
  project: ExternalUseProject,
  candidates: ExternalUseCandidate[],
): Promise<PersistResult> {
  if (!candidates.length) return { inserted: 0, refreshed: 0 };
  const projectId = await projectUuid(project.slug);
  const normalized = candidates.map((candidate) => normalizeExternalUse(project, candidate));
  const hashes = normalized.map((candidate) => candidate.evidenceHash);
  const { data: existingRows, error: existingError } = await supabase
    .from("external_code_use_discoveries")
    .select("id,evidence_hash")
    .eq("project_id", projectId)
    .in("evidence_hash", hashes);
  if (existingError) {
    throw new Error(`external_use_existing_read_failed:${existingError.message}`);
  }

  const existingByHash = new Map(
    ((existingRows ?? []) as ExistingDiscoveryRow[]).map((row) => [
      String(row.evidence_hash),
      String(row.id),
    ]),
  );
  const newRows = normalized
    .filter((candidate) => !existingByHash.has(candidate.evidenceHash))
    .map((candidate) => ({
      id: randomUUID(),
      project_id: projectId,
      source: candidate.source,
      source_tool: candidate.sourceTool,
      evidence_url: candidate.evidenceUrl,
      external_owner: candidate.externalOwner ?? null,
      external_repository: candidate.externalRepository ?? null,
      title: candidate.title,
      evidence_summary: candidate.evidenceSummary,
      discovery_query: candidate.discoveryQuery,
      evidence_hash: candidate.evidenceHash,
      classification: candidate.classification,
      confidence: candidate.confidence,
      who_text: candidate.fiveWOneH.who,
      what_text: candidate.fiveWOneH.what,
      where_text: candidate.fiveWOneH.where,
      when_text: candidate.fiveWOneH.when,
      why_text: candidate.fiveWOneH.why,
      how_text: candidate.fiveWOneH.how,
      first_seen_at: candidate.observedAt,
      last_seen_at: candidate.observedAt,
    }));

  if (newRows.length) {
    const { error } = await supabase.from("external_code_use_discoveries").insert(newRows);
    if (error) throw new Error(`external_use_insert_failed:${error.message}`);
  }

  const refreshes = normalized.filter((candidate) => existingByHash.has(candidate.evidenceHash));
  const refreshResults = await Promise.all(refreshes.map(async (candidate) => {
    const id = existingByHash.get(candidate.evidenceHash);
    const { error } = await supabase
      .from("external_code_use_discoveries")
      .update({
        source: candidate.source,
        source_tool: candidate.sourceTool,
        evidence_url: candidate.evidenceUrl,
        external_owner: candidate.externalOwner ?? null,
        external_repository: candidate.externalRepository ?? null,
        title: candidate.title,
        evidence_summary: candidate.evidenceSummary,
        discovery_query: candidate.discoveryQuery,
        classification: candidate.classification,
        confidence: candidate.confidence,
        who_text: candidate.fiveWOneH.who,
        what_text: candidate.fiveWOneH.what,
        where_text: candidate.fiveWOneH.where,
        when_text: candidate.fiveWOneH.when,
        why_text: candidate.fiveWOneH.why,
        how_text: candidate.fiveWOneH.how,
        last_seen_at: candidate.observedAt,
      })
      .eq("id", id);
    return error;
  }));
  const refreshError = refreshResults.find(Boolean);
  if (refreshError) throw new Error(`external_use_refresh_failed:${refreshError.message}`);

  return { inserted: newRows.length, refreshed: refreshes.length };
}

export async function runExternalUseDiscoveryCycle(
  hub = new McpHub(),
): Promise<ExternalUseDiscoverySummary> {
  const summary: ExternalUseDiscoverySummary = {
    scannedProjects: 0,
    discoveredCandidates: 0,
    inserted: 0,
    refreshed: 0,
    sourceCounts: {},
    warnings: [],
  };

  for (const project of PORTFOLIO_PROJECTS) {
    if (project.status !== "active") continue;
    const target: ExternalUseProject = {
      slug: project.slug,
      name: project.name,
      repository: project.repository,
    };
    summary.scannedProjects += 1;

    const [github, exa] = await Promise.all([
      scanGitHubMcp(hub, target),
      scanExaMcp(hub, target),
    ]);
    const candidates = mergeCandidates([...github.candidates, ...exa.candidates]);
    const persisted = await persistCandidates(target, candidates);

    summary.discoveredCandidates += candidates.length;
    summary.inserted += persisted.inserted;
    summary.refreshed += persisted.refreshed;
    summary.warnings.push(...github.warnings, ...exa.warnings);
    for (const [source, count] of Object.entries({
      ...github.sourceCounts,
      ...exa.sourceCounts,
    })) {
      summary.sourceCounts[source] = (summary.sourceCounts[source] ?? 0) + count;
    }
  }

  summary.warnings = [...new Set(summary.warnings)].sort();
  return summary;
}

function hourStart(date: Date): string {
  return new Date(Math.floor(date.getTime() / 3_600_000) * 3_600_000).toISOString();
}

function retryDelay(status: string): number | undefined {
  if (status === "failed") return DIGEST_FAILED_RETRY_MS;
  if (status === "running") return DIGEST_STALE_RUNNING_MS;
  return undefined;
}

async function reserveDigest(date: Date): Promise<DigestReservation | undefined> {
  const id = randomUUID();
  const digestHour = hourStart(date);
  const startedAt = date.toISOString();
  const { error } = await supabase.from("external_code_use_digest_runs").insert({
    id,
    digest_hour: digestHour,
    recipient: EXTERNAL_USE_DIGEST_RECIPIENT,
    status: "running",
    started_at: startedAt,
    attempt_count: 1,
  });
  if (!error) return { id, digestHour };
  if (error.code !== "23505") {
    throw new Error(`external_use_digest_reservation_failed:${error.message}`);
  }

  const { data: existingData, error: existingError } = await supabase
    .from("external_code_use_digest_runs")
    .select("id,digest_hour,status,started_at,updated_at,attempt_count")
    .eq("digest_hour", digestHour)
    .maybeSingle();
  if (existingError) {
    throw new Error(`external_use_digest_reservation_read_failed:${existingError.message}`);
  }
  if (!existingData) return undefined;

  const existing = existingData as ExistingDigestRow;
  const status = String(existing.status);
  const delay = retryDelay(status);
  if (delay === undefined) return undefined;
  const previousStart = Date.parse(String(existing.started_at));
  if (!Number.isFinite(previousStart) || date.getTime() - previousStart < delay) {
    return undefined;
  }

  const nextAttempt = Math.max(1, Number(existing.attempt_count) || 1) + 1;
  const { data: reclaimed, error: reclaimError } = await supabase
    .from("external_code_use_digest_runs")
    .update({
      status: "running",
      recipient: EXTERNAL_USE_DIGEST_RECIPIENT,
      started_at: startedAt,
      completed_at: null,
      attempt_count: nextAttempt,
      item_count: 0,
      new_item_count: 0,
      source_counts: {},
      warnings: [],
      resend_email_id: null,
    })
    .eq("id", String(existing.id))
    .eq("updated_at", String(existing.updated_at))
    .select("id,digest_hour")
    .maybeSingle();
  if (reclaimError) {
    throw new Error(`external_use_digest_reclaim_failed:${reclaimError.message}`);
  }
  if (!reclaimed) return undefined;
  return {
    id: String(reclaimed.id),
    digestHour: String(reclaimed.digest_hour),
  };
}

async function digestItems(): Promise<ExternalUseDigestItem[]> {
  const { data: rows, error } = await supabase
    .from("external_code_use_discoveries")
    .select("id,project_id,title,evidence_url,evidence_summary,classification,confidence,who_text,what_text,where_text,when_text,why_text,how_text,first_seen_at,last_seen_at")
    .neq("classification", "dismissed")
    .order("last_seen_at", { ascending: false })
    .limit(MAX_DIGEST_ITEMS);
  if (error) throw new Error(`external_use_digest_read_failed:${error.message}`);

  const digestRows = (rows ?? []) as DigestDiscoveryRow[];
  const projectIds = [...new Set(digestRows.map((row) => String(row.project_id)))];
  const projectById = new Map<string, { name: string; repository: string }>();
  if (projectIds.length) {
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id,name,repo_identifier")
      .in("id", projectIds);
    if (projectsError) {
      throw new Error(`external_use_digest_project_read_failed:${projectsError.message}`);
    }
    for (const project of (projects ?? []) as DigestProjectRow[]) {
      projectById.set(String(project.id), {
        name: String(project.name),
        repository: String(project.repo_identifier ?? ""),
      });
    }
  }

  return digestRows.map((row) => {
    const project = projectById.get(String(row.project_id)) ?? {
      name: "Unknown project",
      repository: "unknown",
    };
    return {
      id: String(row.id),
      projectName: project.name,
      projectRepository: project.repository,
      title: String(row.title),
      evidenceUrl: String(row.evidence_url),
      evidenceSummary: String(row.evidence_summary),
      classification: String(row.classification) as ExternalUseClassification,
      confidence: Number(row.confidence),
      firstSeenAt: String(row.first_seen_at),
      lastSeenAt: String(row.last_seen_at),
      fiveWOneH: {
        who: String(row.who_text),
        what: String(row.what_text),
        where: String(row.where_text),
        when: String(row.when_text),
        why: String(row.why_text),
        how: String(row.how_text),
      },
    };
  });
}

async function sendWithResend(options: {
  digestHour: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EXTERNAL_USE_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("external_use_resend_not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `external-code-use-${options.digestHour}`,
      },
      body: JSON.stringify({
        from,
        to: [EXTERNAL_USE_DIGEST_RECIPIENT],
        subject: options.subject,
        html: options.html,
        text: options.text,
        tags: [
          { name: "system", value: "founder-control-room" },
          { name: "report", value: "external-code-use" },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({})) as { id?: unknown };
    if (!response.ok) {
      throw new Error(`external_use_resend_send_failed:${response.status}`);
    }
    if (typeof payload.id !== "string" || !payload.id) {
      throw new Error("external_use_resend_missing_email_id");
    }
    return payload.id;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("external_use_resend_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runExternalUseHourlyCycle(
  now = new Date(),
): Promise<{ status: "sent" | "skipped" | "failed"; itemCount?: number; newItemCount?: number }> {
  const reservation = await reserveDigest(now);
  if (!reservation) return { status: "skipped" };

  try {
    const discovery = await runExternalUseDiscoveryCycle();
    const items = await digestItems();
    const newItemCount = items.filter(
      (item) => item.firstSeenAt >= reservation.digestHour,
    ).length;
    const warnings = [...discovery.warnings];
    if (items.length === MAX_DIGEST_ITEMS) {
      warnings.push(`digest_capped_at_${MAX_DIGEST_ITEMS}`);
    }
    const rendered = renderExternalUseDigest({
      generatedAt: now.toISOString(),
      items,
      newItemCount,
      warnings,
    });
    const resendEmailId = await sendWithResend({
      digestHour: reservation.digestHour,
      ...rendered,
    });

    if (items.length) {
      const { error: digestMarkError } = await supabase
        .from("external_code_use_discoveries")
        .update({ last_digest_at: now.toISOString() })
        .in("id", items.map((item) => item.id));
      if (digestMarkError) {
        throw new Error(`external_use_digest_mark_failed:${digestMarkError.message}`);
      }
    }

    const { data: finalized, error } = await supabase
      .from("external_code_use_digest_runs")
      .update({
        status: "sent",
        item_count: items.length,
        new_item_count: newItemCount,
        source_counts: discovery.sourceCounts,
        warnings,
        resend_email_id: resendEmailId,
        completed_at: new Date().toISOString(),
      })
      .eq("id", reservation.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`external_use_digest_finalize_failed:${error.message}`);
    if (!finalized) throw new Error("external_use_digest_finalize_missing_reservation");

    return { status: "sent", itemCount: items.length, newItemCount };
  } catch (error) {
    await supabase
      .from("external_code_use_digest_runs")
      .update({
        status: "failed",
        error_code: errorCode(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", reservation.id);
    return { status: "failed" };
  }
}
