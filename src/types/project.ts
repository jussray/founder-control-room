/**
 * Project Registry types — mirrors `projects` / `project_connections` in
 * Supabase. Bip is Project #1, not a schema-level special case: every field
 * here is meant to still make sense with 25 products connected.
 */

export type ProjectStatus = "active" | "paused" | "archived";
export type RiskLevel = "low" | "medium" | "high";

export interface Project {
  id: string;
  slug: string; // stable projectId used across the whole Control Room
  name: string;
  repoProvider: string; // matches a RepositoryProvider.name
  repoIdentifier?: string; // e.g. "jussray/Sekret-Bip"
  cloudflareAccount?: string;
  supabaseProject?: string; // the PROJECT'S OWN Supabase ref, never this one
  stack?: string;
  status: ProjectStatus;
  riskLevel: RiskLevel;
  createdAt: string;
  updatedAt: string;
}

export type ConnectorAuthorityLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export type ConnectionType =
  | "git"
  | "github"
  | "cloudflare"
  | "supabase"
  | "openai"
  | "anthropic"
  | "perplexity"
  | "shopify"
  | "expo"
  | "apple"
  | "google_play"
  | "stripe"
  | "figma"
  | "canva"
  | "playwright"
  | "gmail"
  | "calendar"
  | "context7"
  | "other";

export type ConnectionStatus = "active" | "disconnected" | "error";

export interface ProjectConnection {
  id: string;
  projectId: string;
  connectionType: ConnectionType;
  label?: string;
  config: Record<string, unknown>; // non-secret config only
  secretRef?: string; // pointer into the secret manager, never the secret itself
  status: ConnectionStatus;
  authorityLevel?: ConnectorAuthorityLevel; // highest declared capability, not automatic permission
  capabilities: string[];
  dataBoundary?: string; // what this plugin may inspect or mutate
  requiredApproval?: string; // human-readable gate language for this connection
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}
