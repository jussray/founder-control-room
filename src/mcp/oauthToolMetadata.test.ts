import { describe, expect, it } from 'vitest';
import { decoratePairedOAuthResponse } from './oauthToolMetadata.js';

describe('paired OAuth MCP response metadata', () => {
  it('adds the same OAuth scope to every advertised tool', () => {
    const response = decoratePairedOAuthResponse({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: [
          { name: 'fcr_list_projects', annotations: { readOnlyHint: true } },
          { name: 'fcr_relay_operator', annotations: { readOnlyHint: false } },
        ],
      },
    }, {
      method: 'tools/list',
      scope: 'mcp:read',
    }) as Record<string, any>;

    expect(response.result.tools).toEqual([
      {
        name: 'fcr_list_projects',
        annotations: { readOnlyHint: true },
        securitySchemes: [{ type: 'oauth2', scopes: ['mcp:read'] }],
      },
      {
        name: 'fcr_relay_operator',
        annotations: { readOnlyHint: false },
        securitySchemes: [{ type: 'oauth2', scopes: ['mcp:read'] }],
      },
    ]);
  });

  it('adds the OAuth challenge to JSON-RPC auth errors without discarding existing data', () => {
    const challenge = 'Bearer resource_metadata="https://api.foundercontrolroom.org/.well-known/oauth-protected-resource/mcp", error="invalid_token"';
    const response = decoratePairedOAuthResponse({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32000,
        message: 'Unauthorized',
        data: { reason: 'missing token' },
      },
    }, {
      method: 'tools/list',
      scope: 'mcp:read',
      challenge,
    }) as Record<string, any>;

    expect(response.error.data).toEqual({
      reason: 'missing token',
      _meta: { 'mcp/www_authenticate': [challenge] },
    });
  });

  it('does not add tool metadata to unrelated MCP methods', () => {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      result: { tools: [{ name: 'fcr_list_projects' }] },
    };
    expect(decoratePairedOAuthResponse(body, {
      method: 'ping',
      scope: 'mcp:read',
    })).toEqual(body);
  });
});
