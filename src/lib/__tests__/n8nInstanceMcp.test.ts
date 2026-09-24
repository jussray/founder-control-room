import { describe, expect, it } from 'vitest';
import {
  N8N_INSTANCE_MCP_CONTRACT,
  N8N_INSTANCE_MCP_DEFAULT_SERVER_URL,
  readN8nInstanceMcpPolicy,
} from '../n8nInstanceMcp.js';

describe('n8n instance-level MCP policy', () => {
  it('defaults to the approved portfolio endpoint without claiming provider verification', () => {
    const policy = readN8nInstanceMcpPolicy({});

    expect(policy).toEqual(expect.objectContaining({
      contract: N8N_INSTANCE_MCP_CONTRACT,
      serverUrl: N8N_INSTANCE_MCP_DEFAULT_SERVER_URL,
      serverUrlSource: 'portfolio-contract-default',
      transport: 'streamable-http',
      authMode: 'oauth',
      state: 'policy-ready-provider-unverified',
      providerVerified: false,
      providerVerificationRequired: true,
      selectiveExposureRequired: true,
      autoExposeNewWorkflows: false,
      clientSpecificWorkflowScopingAvailable: false,
      searchWorkflowPreviewsMayIncludeUnexposedWorkflows: true,
      secretValuesExposed: false,
    }));
    expect(policy.violations).toEqual([]);
    expect(policy.authority).toEqual({
      mcpConnectionGrantsFounderAuthority: false,
      externalToolOutputCanIncreaseAuthority: false,
      workflowExecutionRequiresExistingFcrAuthority: true,
      merge: false,
      deploy: false,
      publish: false,
      spend: false,
      rotateSecrets: false,
    });
  });

  it('rejects API-key mode for the governed portfolio client surface', () => {
    const policy = readN8nInstanceMcpPolicy({
      N8N_MCP_AUTH_MODE: 'api-key',
    });

    expect(policy.state).toBe('policy-violation');
    expect(policy.violations).toContain('OAuth is required for governed portfolio MCP clients');
  });

  it('rejects auto-expose so newly created workflows cannot silently widen MCP authority', () => {
    const policy = readN8nInstanceMcpPolicy({
      N8N_MCP_AUTO_EXPOSE_NEW_WORKFLOWS: 'true',
    });

    expect(policy.state).toBe('policy-violation');
    expect(policy.exposurePolicy.default).toBe('deny');
    expect(policy.exposurePolicy.autoExposeNewWorkflows).toBe(false);
    expect(policy.violations).toContain('auto-expose new workflows must remain disabled');
  });

  it('rejects non-HTTPS or non-MCP server URLs', () => {
    const policy = readN8nInstanceMcpPolicy({
      N8N_MCP_SERVER_URL: 'http://example.test/not-mcp',
    });

    expect(policy.state).toBe('policy-violation');
    expect(policy.violations).toContain('server URL must use HTTPS and end with /mcp-server/http');
  });
});
