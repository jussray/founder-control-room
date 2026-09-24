type JsonRecord = Record<string, unknown>;

export const ANTHROPIC_MCP_BETA = 'mcp-client-2025-11-20' as const;
export const ANTHROPIC_PLAYWRIGHT_MCP_SERVER = 'playwright' as const;
export const ANTHROPIC_RELAY_RUNTIME = 'anthropic-messages-api' as const;
export const ANTHROPIC_PLAYWRIGHT_CONFIG_EVIDENCE_REF =
  'runtime:anthropic-messages-api:mcp:playwright:configured-readonly-v1' as const;

export const ANTHROPIC_PLAYWRIGHT_READ_TOOL_ALLOWLIST = [
  'browser_navigate',
  'browser_navigate_back',
  'browser_snapshot',
  'browser_find',
  'browser_take_screenshot',
  'browser_console_messages',
  'browser_network_requests',
  'browser_tabs',
  'browser_wait_for',
] as const;

export interface AnthropicMcpAttachment {
  headers: Record<string, string>;
  body: {
    mcp_servers: JsonRecord[];
    tools: JsonRecord[];
  };
}

const SAFE_MCP_TOOL_USE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const PLAYWRIGHT_READ_TOOLS = new Set<string>(ANTHROPIC_PLAYWRIGHT_READ_TOOL_ALLOWLIST);

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function canonicalHttpsUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  return url.toString();
}

export function anthropicPlaywrightMcpAttachment(
  env: NodeJS.ProcessEnv = process.env,
): AnthropicMcpAttachment | null {
  const configuredUrl = env.FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL?.trim();
  if (!configuredUrl) return null;

  const url = canonicalHttpsUrl(configuredUrl);
  if (!url) {
    throw new Error('FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL must be a canonical https URL without embedded credentials or a fragment');
  }

  const authorizationToken = env.FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_TOKEN?.trim();
  const configs = Object.fromEntries(
    ANTHROPIC_PLAYWRIGHT_READ_TOOL_ALLOWLIST.map((name) => [name, { enabled: true }]),
  );

  return {
    headers: { 'anthropic-beta': ANTHROPIC_MCP_BETA },
    body: {
      mcp_servers: [{
        type: 'url',
        url,
        name: ANTHROPIC_PLAYWRIGHT_MCP_SERVER,
        ...(authorizationToken ? { authorization_token: authorizationToken } : {}),
      }],
      tools: [{
        type: 'mcp_toolset',
        mcp_server_name: ANTHROPIC_PLAYWRIGHT_MCP_SERVER,
        default_config: { enabled: false },
        configs,
      }],
    },
  };
}

/**
 * Extract immutable evidence that Anthropic actually invoked the configured
 * Playwright MCP server. Configuration alone is deliberately not treated as
 * tool-use proof.
 */
export function anthropicPlaywrightMcpToolEvidenceRefs(body: unknown): string[] {
  const message = record(body);
  const content = Array.isArray(message?.content) ? message.content : [];
  const toolUses = new Map<string, string>();
  const refs: string[] = [];

  for (const entry of content) {
    const block = record(entry);
    if (block?.type !== 'mcp_tool_use') continue;
    if (block.server_name !== ANTHROPIC_PLAYWRIGHT_MCP_SERVER) continue;

    const id = typeof block.id === 'string' ? block.id.trim() : '';
    const name = typeof block.name === 'string' ? block.name.trim() : '';
    if (!SAFE_MCP_TOOL_USE_ID.test(id) || !PLAYWRIGHT_READ_TOOLS.has(name)) continue;

    toolUses.set(id, name);
    refs.push(`mcp-tool-use:${ANTHROPIC_PLAYWRIGHT_MCP_SERVER}:${name}:${id}`);
  }

  for (const entry of content) {
    const block = record(entry);
    if (block?.type !== 'mcp_tool_result') continue;

    const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id.trim() : '';
    const name = toolUses.get(toolUseId);
    if (!name) continue;

    refs.push(
      `mcp-tool-result:${ANTHROPIC_PLAYWRIGHT_MCP_SERVER}:${name}:${toolUseId}:${block.is_error === true ? 'error' : 'success'}`,
    );
  }

  return refs;
}
