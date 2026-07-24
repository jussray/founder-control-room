import { Router, type Request, type Response } from "express";
import { supabase } from "../../lib/supabaseClient.js";
import { requireFounder } from "../middleware/requireFounder.js";

export const externalUseRouter = Router();

const CLASSIFICATIONS = new Set(["confirmed", "probable", "possible", "dismissed"]);

function boundedLimit(value: unknown, fallback = 100): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 200);
}

async function projectIdForSlug(slug: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`external_use_project_lookup_failed:${error.message}`);
  return data ? String(data.id) : undefined;
}

externalUseRouter.get("/discoveries", requireFounder, async (req: Request, res: Response) => {
  try {
    const projectSlug = typeof req.query.project === "string" ? req.query.project.trim() : "";
    const classification = typeof req.query.classification === "string"
      ? req.query.classification.trim()
      : "";
    if (classification && !CLASSIFICATIONS.has(classification)) {
      return res.status(400).json({ error: "Unknown external-use classification" });
    }

    let projectId: string | undefined;
    if (projectSlug) {
      projectId = await projectIdForSlug(projectSlug);
      if (!projectId) return res.status(404).json({ error: "Project is not registered" });
    }

    let query = supabase
      .from("external_code_use_discoveries")
      .select("id,project_id,source,source_tool,evidence_url,external_owner,external_repository,title,evidence_summary,classification,confidence,who_text,what_text,where_text,when_text,why_text,how_text,first_seen_at,last_seen_at,last_digest_at")
      .order("last_seen_at", { ascending: false })
      .limit(boundedLimit(req.query.limit));
    if (projectId) query = query.eq("project_id", projectId);
    if (classification) query = query.eq("classification", classification);

    const { data, error } = await query;
    if (error) throw new Error(`external_use_list_failed:${error.message}`);
    return res.json({ discoveries: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

externalUseRouter.get("/summary", requireFounder, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("external_code_use_discoveries")
      .select("source,classification,first_seen_at,last_seen_at")
      .limit(5_000);
    if (error) throw new Error(`external_use_summary_failed:${error.message}`);

    const byClassification: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let newestSeenAt: string | null = null;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const classification = String(row.classification);
      const source = String(row.source);
      byClassification[classification] = (byClassification[classification] ?? 0) + 1;
      bySource[source] = (bySource[source] ?? 0) + 1;
      const lastSeenAt = String(row.last_seen_at ?? "");
      if (lastSeenAt && (!newestSeenAt || lastSeenAt > newestSeenAt)) newestSeenAt = lastSeenAt;
    }

    return res.json({
      total: data?.length ?? 0,
      byClassification,
      bySource,
      newestSeenAt,
      digestRecipient: "sekretbip@gmail.com",
      cadence: "hourly",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

externalUseRouter.get("/digests", requireFounder, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("external_code_use_digest_runs")
      .select("id,digest_hour,recipient,status,item_count,new_item_count,source_counts,warnings,resend_email_id,error_code,started_at,completed_at")
      .order("digest_hour", { ascending: false })
      .limit(boundedLimit(req.query.limit, 48));
    if (error) throw new Error(`external_use_digest_list_failed:${error.message}`);
    return res.json({ digests: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});
