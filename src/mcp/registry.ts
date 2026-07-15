import { DEFAULT_MCP_SERVERS } from "./defaultRegistry.js";
import type { McpServerDefinition } from "./types.js";

export class McpRegistry {
  private readonly definitions: Map<string, McpServerDefinition>;

  constructor(definitions: readonly McpServerDefinition[] = DEFAULT_MCP_SERVERS) {
    this.definitions = new Map();
    for (const definition of definitions) {
      if (this.definitions.has(definition.id)) {
        throw new Error(`Duplicate MCP server id: ${definition.id}`);
      }
      this.definitions.set(definition.id, { ...definition });
    }
  }

  list(): McpServerDefinition[] {
    return [...this.definitions.values()].map((definition) => ({ ...definition }));
  }

  get(serverId: string): McpServerDefinition {
    const definition = this.definitions.get(serverId);
    if (!definition) throw new Error(`Unknown MCP server: ${serverId}`);
    return { ...definition };
  }

  isConfigured(serverId: string, env: NodeJS.ProcessEnv = process.env): boolean {
    const definition = this.get(serverId);
    return Boolean(env[definition.endpointEnv]?.trim());
  }

  publicView(env: NodeJS.ProcessEnv = process.env) {
    return this.list().map((definition) => ({
      id: definition.id,
      label: definition.label,
      role: definition.role,
      configured: Boolean(env[definition.endpointEnv]?.trim()),
      developmentOnly: Boolean(definition.developmentOnly),
      enabledProjects: [...definition.enabledProjects],
      monthlyBudgetUsd: definition.monthlyBudgetUsd,
    }));
  }
}
