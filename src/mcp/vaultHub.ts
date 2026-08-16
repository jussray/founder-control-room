import { parseVaultEnvironment, type VaultEnvironment } from "../connectionVault/tokens.js";
import { supabase } from "../lib/supabaseClient.js";
import { McpHub } from "./hub.js";
import { McpRegistry } from "./registry.js";
import type { McpServerDefinition } from "./types.js";

export interface McpRuntimeResolution {
  env: NodeJS.ProcessEnv;
  source: "environment" | "connection-vault";
  vaultEnvironment?: VaultEnvironment;
  bindingId?: string;
  connectionId?: string;
}

export function vaultEnvironmentForRuntime(
  env: NodeJS.ProcessEnv,
): VaultEnvironment {
  const explicit = env.MCP_VAULT_ENVIRONMENT?.trim();
  if (explicit) return parseVaultEnvironment(explicit);
  return env.NODE_ENV === "production" ? "production" : "development";
}

function validatedEndpoint(
  raw: unknown,
  server: McpServerDefinition,
  environment: VaultEnvironment,
): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(`Connection Vault binding ${server.endpointEnv} has no endpoint value`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Connection Vault binding ${server.endpointEnv} is not a valid URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Connection Vault endpoint for ${server.id} must use http or https`);
  }
  if (environment === "production" && url.protocol !== "https:") {
    throw new Error(`Connection Vault endpoint for ${server.id} must use https in production`);
  }
  return url.toString();
}

export async function resolveMcpRuntimeEnv(
  server: McpServerDefinition,
  projectId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<McpRuntimeResolution> {
  if ((server.endpointAuthority ?? "environment") !== "connection-vault") {
    return { env, source: "environment" };
  }

  const vaultEnvironment = vaultEnvironmentForRuntime(env);
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Connection Vault project lookup failed: ${projectError.message}`);
  }
  if (!project?.id) {
    throw new Error(`Connection Vault project is not registered: ${projectId}`);
  }

  const { data: binding, error: bindingError } = await supabase
    .from("connection_vault_bindings")
    .select("id,connection_id,kind,variable_value,status")
    .eq("project_id", project.id)
    .eq("environment", vaultEnvironment)
    .eq("name", server.endpointEnv)
    .eq("kind", "variable")
    .eq("status", "active")
    .maybeSingle();

  if (bindingError) {
    throw new Error(`Connection Vault endpoint lookup failed: ${bindingError.message}`);
  }
  if (!binding?.id || !binding.connection_id) {
    throw new Error(
      `MCP endpoint ${server.endpointEnv} is not configured in Connection Vault for ${projectId}/${vaultEnvironment}`,
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("project_connections")
    .select("id,project_id,status")
    .eq("id", binding.connection_id)
    .eq("project_id", project.id)
    .eq("status", "active")
    .maybeSingle();

  if (connectionError) {
    throw new Error(`Connection Vault connection lookup failed: ${connectionError.message}`);
  }
  if (!connection?.id) {
    throw new Error(
      `Connection Vault binding ${binding.id} does not reference an active connection for ${projectId}`,
    );
  }

  const endpoint = validatedEndpoint(binding.variable_value, server, vaultEnvironment);
  return {
    env: { ...env, [server.endpointEnv]: endpoint },
    source: "connection-vault",
    vaultEnvironment,
    bindingId: binding.id,
    connectionId: connection.id,
  };
}

export async function hubForMcpProject(
  serverId: string,
  projectId: string,
  options: {
    registry?: McpRegistry;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<McpHub> {
  const registry = options.registry ?? new McpRegistry();
  const server = registry.get(serverId);
  const runtime = await resolveMcpRuntimeEnv(
    server,
    projectId,
    options.env ?? process.env,
  );
  return new McpHub(registry, runtime.env);
}
