type JsonRecord = Record<string, unknown>;

export const ANTHROPIC_MCP_BETA = 'mcp-client-2025-11-20' as const;
export const ANTHROPIC_PLAYWRIGHT_MCP_SERVER = 'playwright' as const;

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

export type AnthropicPlaywrightBridgeReadiness =
  | { state: 'not_configured'; runtimeReachable: false; reason: 'missing_remote_mcp_url' }
  | { state: 'configured_unverified'; runtimeReachable: false; url: string; reason: 'awaiting_browser_tabs_receipt' }
  | { state: 'runtime_verified'; runtimeReachable: true; url: string; receiptRef: string };

export interface AnthropicMcpAttachment {
  headers: Record<string, string>;
  body: {
    mcp_servers: JsonRecord[];
    tools: JsonRecord[];
  };
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

function configuredPlaywrightMcpUrl(env: NodeJS.ProcessEnv): string | null {
  const configuredUrl = env.FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL?.trim();
  if (!configuredUrl) return null;

  const url = canonicalHttpsUrl(configuredUrl);
  if (!url) {
    throw new Error('FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL must be a canonical https URL without embedded credentials or a fragment');
  }
  return url;
}

export function anthropicPlaywrightBridgeReadiness(
  env: NodeJS.ProcessEnv = process.env,
  browserTabsReceiptRef?: string | null,
): AnthropicPlaywrightBridgeReadiness {
  const url = configuredPlaywrightMcpUrl(env);
  if (!url) {
    return { state: 'not_configured', runtimeReachable: false, reason: 'missing_remote_mcp_url' };
  }

  const receiptRef = browserTabsReceiptRef?.trim();
  if (!receiptRef) {
    return { state: 'configured_unverified', runtimeReachable: false, url, reason: 'awaiting_browser_tabs_receipt' };
  }

  return { state: 'runtime_verified', runtimeReachable: true, url, receiptRef };
}

export function anthropicPlaywrightMcpAttachment(
  env: NodeJS.ProcessEnv = process.env,
): AnthropicMcpAttachment | null {
  const url = configuredPlaywrightMcpUrl(env);
  if (!url) return null;

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
