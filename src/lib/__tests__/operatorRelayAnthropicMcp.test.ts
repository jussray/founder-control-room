import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import {
  ANTHROPIC_MCP_BETA,
  ANTHROPIC_PLAYWRIGHT_CONFIG_EVIDENCE_REF,
  ANTHROPIC_PLAYWRIGHT_READ_TOOL_ALLOWLIST,
  ANTHROPIC_RELAY_RUNTIME,
  anthropicPlaywrightMcpAttachment,
  anthropicPlaywrightMcpToolEvidenceRefs,
} from '../operatorRelayAnthropicMcp.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

const FIXTURE = 'fixture-value';

function relay(): OperatorRelayRequestV1 {
  const summary = 'Inspect the deployed app with read-only browser evidence and report findings.';
  const sourceRef = 'chat:browser-proof';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-anthropic-mcp-test',
    fromOperator: 'codex',
    toOperator: 'claude-code',
    capability: 'implement',
    goal: 'Inspect the live runtime without mutating it',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity: 'internal',
    createdAt: '2026-09-24T19:30:00.000Z',
    expiresAt: '2099-09-24T19:40:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('anthropicPlaywrightMcpAttachment', () => {
  it('keeps the claude-code operator identity separate from its current runtime truth', () => {
    expect(ANTHROPIC_RELAY_RUNTIME).toBe('anthropic-messages-api');
  });

  it('is opt-in and leaves the existing Claude relay unchanged when not configured', () => {
    expect(anthropicPlaywrightMcpAttachment({})).toBeNull();
  });

  it.each([
    'http://browser.example.com/mcp',
    'https://user:pass@browser.example.com/mcp',
    'https://browser.example.com/mcp#secret',
    'not-a-url',
  ])('fails closed for an unsafe MCP URL: %s', (url) => {
    expect(() => anthropicPlaywrightMcpAttachment({
      FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL: url,
    })).toThrow('must be a canonical https URL');
  });

  it('uses the current Anthropic MCP beta and a default-deny read-only Playwright allowlist', () => {
    const attachment = anthropicPlaywrightMcpAttachment({
      FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL: 'https://browser.example.com/mcp',
      FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_TOKEN: FIXTURE,
    });

    expect(attachment?.headers).toEqual({ 'anthropic-beta': ANTHROPIC_MCP_BETA });
    expect(attachment?.body.mcp_servers).toEqual([{
      type: 'url',
      url: 'https://browser.example.com/mcp',
      name: 'playwright',
      authorization_token: FIXTURE,
    }]);

    const toolset = attachment?.body.tools[0] as {
      default_config: { enabled: boolean };
      configs: Record<string, { enabled: boolean }>;
    };
    expect(toolset.default_config.enabled).toBe(false);
    expect(Object.keys(toolset.configs).sort()).toEqual([...ANTHROPIC_PLAYWRIGHT_READ_TOOL_ALLOWLIST].sort());
    expect(Object.values(toolset.configs).every((config) => config.enabled)).toBe(true);
    expect(toolset.configs).not.toHaveProperty('browser_click');
    expect(toolset.configs).not.toHaveProperty('browser_type');
    expect(toolset.configs).not.toHaveProperty('browser_fill_form');
    expect(toolset.configs).not.toHaveProperty('browser_file_upload');
    expect(toolset.configs).not.toHaveProperty('browser_run_code_unsafe');
  });

  it('does not mistake configuration for actual MCP tool use', () => {
    expect(anthropicPlaywrightMcpToolEvidenceRefs({
      content: [{ type: 'text', text: 'No browser tool was needed.' }],
    })).toEqual([]);
  });

  it('emits correlated receipts only for allowlisted Playwright MCP tool use', () => {
    const refs = anthropicPlaywrightMcpToolEvidenceRefs({
      content: [
        {
          type: 'mcp_tool_use',
          id: 'mcptoolu_safe_1',
          name: 'browser_snapshot',
          server_name: 'playwright',
          input: {},
        },
        {
          type: 'mcp_tool_result',
          tool_use_id: 'mcptoolu_safe_1',
          is_error: false,
          content: [{ type: 'text', text: 'snapshot' }],
        },
        {
          type: 'mcp_tool_use',
          id: 'mcptoolu_write_1',
          name: 'browser_click',
          server_name: 'playwright',
          input: {},
        },
        {
          type: 'mcp_tool_use',
          id: 'mcptoolu_other_1',
          name: 'browser_snapshot',
          server_name: 'other-server',
          input: {},
        },
      ],
    });

    expect(refs).toEqual([
      'mcp-tool-use:playwright:browser_snapshot:mcptoolu_safe_1',
      'mcp-tool-result:playwright:browser_snapshot:mcptoolu_safe_1:success',
    ]);
  });

  it('wires the MCP attachment only into the Anthropic request and never serializes the API key into the body', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      expect(init?.headers).toMatchObject({
        'x-api-key': FIXTURE,
        'anthropic-beta': ANTHROPIC_MCP_BETA,
      });
      const serialized = String(init?.body ?? '');
      expect(serialized).not.toContain(`\"x-api-key\":\"${FIXTURE}\"`);
      const body = JSON.parse(serialized) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: 'claude-test-model',
        mcp_servers: [{
          type: 'url',
          url: 'https://browser.example.com/mcp',
          name: 'playwright',
          authorization_token: 'browser-token',
        }],
        tools: [{
          type: 'mcp_toolset',
          mcp_server_name: 'playwright',
          default_config: { enabled: false },
        }],
      });
      const prompt = JSON.stringify(body.messages);
      expect(prompt).not.toContain(FIXTURE);
      expect(prompt).not.toContain('browser-token');

      return new Response(JSON.stringify({
        id: 'msg_browser_safe_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Read-only browser inspection complete.' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      ANTHROPIC_API_KEY: FIXTURE,
      FCR_RELAY_ANTHROPIC_MODEL: 'claude-test-model',
      FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL: 'https://browser.example.com/mcp',
      FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_TOKEN: 'browser-token',
    }, fetchMock);

    const response = await adapters['claude-code']?.(relay());
    expect(response).toMatchObject({
      fromOperator: 'claude-code',
      toOperator: 'codex',
      answer: 'Read-only browser inspection complete.',
      evidenceRefs: [
        'provider:anthropic:msg_browser_safe_1',
        ANTHROPIC_PLAYWRIGHT_CONFIG_EVIDENCE_REF,
      ],
      authorityRequested: 'none',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('promotes actual Anthropic MCP tool use into separate evidence receipts', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'msg_browser_used_1',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'mcp_tool_use',
          id: 'mcptoolu_runtime_1',
          name: 'browser_snapshot',
          server_name: 'playwright',
          input: {},
        },
        {
          type: 'mcp_tool_result',
          tool_use_id: 'mcptoolu_runtime_1',
          is_error: false,
          content: [{ type: 'text', text: 'snapshot' }],
        },
        { type: 'text', text: 'I inspected the page.' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      ANTHROPIC_API_KEY: FIXTURE,
      FCR_RELAY_ANTHROPIC_MODEL: 'claude-test-model',
      FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL: 'https://browser.example.com/mcp',
    }, fetchMock);

    const response = await adapters['claude-code']?.(relay());
    expect(response?.evidenceRefs).toEqual([
      'provider:anthropic:msg_browser_used_1',
      ANTHROPIC_PLAYWRIGHT_CONFIG_EVIDENCE_REF,
      'mcp-tool-use:playwright:browser_snapshot:mcptoolu_runtime_1',
      'mcp-tool-result:playwright:browser_snapshot:mcptoolu_runtime_1:success',
    ]);
  });
});
