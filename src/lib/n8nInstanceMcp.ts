export const N8N_INSTANCE_MCP_CONTRACT = 'fcr/n8n-instance-mcp@v1' as const;
export const N8N_INSTANCE_MCP_DEFAULT_SERVER_URL = 'https://jussray.app.n8n.cloud/mcp-server/http' as const;
export const N8N_INSTANCE_MCP_AUTH_MODES = ['oauth', 'api-key'] as const;

export type N8nInstanceMcpAuthMode = (typeof N8N_INSTANCE_MCP_AUTH_MODES)[number];
export type N8nInstanceMcpPolicyState =
  | 'policy-ready-provider-unverified'
  | 'policy-violation';

export interface N8nInstanceMcpPolicy {
  contract: typeof N8N_INSTANCE_MCP_CONTRACT;
  serverUrl: string;
  serverUrlSource: 'portfolio-contract-default' | 'environment';
  transport: 'streamable-http';
  authMode: N8nInstanceMcpAuthMode;
  state: N8nInstanceMcpPolicyState;
  providerVerified: false;
  providerVerificationRequired: true;
  selectiveExposureRequired: true;
  autoExposeNewWorkflows: false;
  clientSpecificWorkflowScopingAvailable: false;
  searchWorkflowPreviewsMayIncludeUnexposedWorkflows: true;
  secretValuesExposed: false;
  exposurePolicy: {
    default: 'deny';
    enableExistingWorkflowsIndividually: true;
    enableProjectsOrFoldersOnlyAfterReview: true;
    autoExposeNewWorkflows: false;
  };
  authority: {
    mcpConnectionGrantsFounderAuthority: false;
    externalToolOutputCanIncreaseAuthority: false;
    workflowExecutionRequiresExistingFcrAuthority: true;
    merge: false;
    deploy: false;
    publish: false;
    spend: false;
    rotateSecrets: false;
  };
  violations: string[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function boolean(value: unknown): boolean {
  return text(value).toLowerCase() === 'true';
}

function validMcpServerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.hash
      && !url.search
      && url.pathname.endsWith('/mcp-server/http');
  } catch {
    return false;
  }
}

function authMode(value: string): N8nInstanceMcpAuthMode {
  return value.toLowerCase() === 'api-key' ? 'api-key' : 'oauth';
}

export function readN8nInstanceMcpPolicy(
  env: NodeJS.ProcessEnv = process.env,
): N8nInstanceMcpPolicy {
  const configuredServerUrl = text(env.N8N_MCP_SERVER_URL);
  const serverUrl = configuredServerUrl || N8N_INSTANCE_MCP_DEFAULT_SERVER_URL;
  const selectedAuthMode = authMode(text(env.N8N_MCP_AUTH_MODE) || 'oauth');
  const requestedAutoExpose = boolean(env.N8N_MCP_AUTO_EXPOSE_NEW_WORKFLOWS);
  const violations: string[] = [];

  if (!validMcpServerUrl(serverUrl)) {
    violations.push('server URL must use HTTPS and end with /mcp-server/http');
  }
  if (selectedAuthMode !== 'oauth') {
    violations.push('OAuth is required for governed portfolio MCP clients');
  }
  if (requestedAutoExpose) {
    violations.push('auto-expose new workflows must remain disabled');
  }

  return {
    contract: N8N_INSTANCE_MCP_CONTRACT,
    serverUrl,
    serverUrlSource: configuredServerUrl ? 'environment' : 'portfolio-contract-default',
    transport: 'streamable-http',
    authMode: selectedAuthMode,
    state: violations.length === 0 ? 'policy-ready-provider-unverified' : 'policy-violation',
    providerVerified: false,
    providerVerificationRequired: true,
    selectiveExposureRequired: true,
    autoExposeNewWorkflows: false,
    clientSpecificWorkflowScopingAvailable: false,
    searchWorkflowPreviewsMayIncludeUnexposedWorkflows: true,
    secretValuesExposed: false,
    exposurePolicy: {
      default: 'deny',
      enableExistingWorkflowsIndividually: true,
      enableProjectsOrFoldersOnlyAfterReview: true,
      autoExposeNewWorkflows: false,
    },
    authority: {
      mcpConnectionGrantsFounderAuthority: false,
      externalToolOutputCanIncreaseAuthority: false,
      workflowExecutionRequiresExistingFcrAuthority: true,
      merge: false,
      deploy: false,
      publish: false,
      spend: false,
      rotateSecrets: false,
    },
    violations,
  };
}
