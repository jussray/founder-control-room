/**
 * Founder Control Room Plugin Center
 *
 * This is the typed contract layer for external capability surfaces: GitHub,
 * Supabase, Cloudflare, design tools, comms, commerce, AI providers, and any
 * future adapter. It deliberately separates inventory from execution. A plugin
 * card may describe power; actual high-risk action still goes through founder
 * auth, proof gates, audit rows, and rollback-specific approvals.
 */

import { AUTHORITY_LEVELS, AUTHORITY_LEVEL_IDS, type AuthorityLevel } from './authorityLevels.js';

export type PluginRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PluginCapabilityDescriptor {
  id: string;
  label: string;
  authorityLevel: AuthorityLevel;
  risk: PluginRiskLevel;
  requiresEvidence: boolean;
  separateFounderGate: boolean;
}

export interface PluginDescriptor {
  type: string;
  label: string;
  description: string;
  defaultAuthorityLevel: AuthorityLevel;
  defaultDataBoundary: string;
  secretsPolicy: string;
  capabilities: readonly PluginCapabilityDescriptor[];
  blockedByDefault: readonly string[];
}

export interface PluginConnectionSnapshot {
  id: string;
  projectId: string;
  projectSlug: string | null;
  projectName: string | null;
  type: string;
  label: string | null;
  status: string;
  authorityLevel: string | null;
  capabilities: readonly string[];
  dataBoundary: string | null;
  requiredApproval: string | null;
  secretRef: string | null;
  lastCheckedAt: string | null;
  updatedAt: string | null;
  catalogLabel: string | null;
  risk: PluginRiskLevel;
}

export interface PluginCenterSummary {
  installedConnections: number;
  activeConnections: number;
  disconnectedConnections: number;
  errorConnections: number;
  highRiskConnections: number;
  missingAuthorityLevel: number;
}

export const PLUGIN_CENTER_CONTRACT = Object.freeze({
  id: 'founder-control-room-plugin-center',
  version: '1.0.0',
  label: 'Founder Control Room Plugin Center',
  purpose: 'Connect tools, gate power, preserve proof.',
  enforcementNote:
    'Plugin Center is an inventory and authority contract. High-risk execution remains enforced by route middleware, proof gates, approval_executions, provider adapters, and auditable temporary grants.',
  principles: Object.freeze([
    'No credential values in database rows, dashboards, docs, logs, or committed config.',
    'Read authority is separate from write authority; no approval carries forward.',
    'Temporary grants must have an expiry, usage limit, and rollback/removal instruction.',
    'External communication, billing, deployment, credentials, deletion, and provider changes remain separate founder gates.',
    'Plugin health is observed evidence, not a promise that the provider action succeeded.',
  ]),
});

const CAPABILITIES = Object.freeze({
  inspectRepos: {
    id: 'inspect_repos',
    label: 'Inspect repositories and metadata',
    authorityLevel: 'L1',
    risk: 'low',
    requiresEvidence: false,
    separateFounderGate: false,
  },
  createBranch: {
    id: 'create_branch',
    label: 'Create sandbox branch or change proposal',
    authorityLevel: 'L4',
    risk: 'medium',
    requiresEvidence: true,
    separateFounderGate: true,
  },
  integrateMain: {
    id: 'integrate_main',
    label: 'Integrate verified work into the project',
    authorityLevel: 'L5',
    risk: 'high',
    requiresEvidence: true,
    separateFounderGate: true,
  },
  deploy: {
    id: 'deploy',
    label: 'Deploy, rollback, migrate, or alter production providers',
    authorityLevel: 'L6',
    risk: 'critical',
    requiresEvidence: true,
    separateFounderGate: true,
  },
  inspectData: {
    id: 'inspect_operational_data',
    label: 'Inspect minimized operational data',
    authorityLevel: 'L1',
    risk: 'low',
    requiresEvidence: false,
    separateFounderGate: false,
  },
  writeDesign: {
    id: 'write_design_artifact',
    label: 'Create or update design artifacts',
    authorityLevel: 'L4',
    risk: 'medium',
    requiresEvidence: true,
    separateFounderGate: true,
  },
  sendExternalMessage: {
    id: 'send_external_message',
    label: 'Send external communication',
    authorityLevel: 'L6',
    risk: 'critical',
    requiresEvidence: true,
    separateFounderGate: true,
  },
} satisfies Record<string, PluginCapabilityDescriptor>);

export const PLUGIN_CATALOG = [
  {
    type: 'github',
    label: 'GitHub',
    description: 'Repository, issue, pull request, Actions, provenance, and code-security surface.',
    defaultAuthorityLevel: 'L5',
    defaultDataBoundary: 'Repository metadata, diffs, checks, and issue/PR evidence only. No private app data or secrets.',
    secretsPolicy: 'Use secret_ref for token location only; never store token text.',
    capabilities: [CAPABILITIES.inspectRepos, CAPABILITIES.createBranch, CAPABILITIES.integrateMain],
    blockedByDefault: ['force_push', 'delete_repo', 'change_visibility', 'rotate_credentials'],
  },
  {
    type: 'supabase',
    label: 'Supabase',
    description: 'Control Room auth, operational tables, migrations, storage, and database evidence.',
    defaultAuthorityLevel: 'L6',
    defaultDataBoundary: 'Control Room project only unless a project-specific scoped connection is separately approved.',
    secretsPolicy: 'Service-role keys never enter browser clients, project_connections.config, logs, or docs.',
    capabilities: [CAPABILITIES.inspectData, CAPABILITIES.deploy],
    blockedByDefault: ['production_dml', 'destructive_ddl', 'rls_weakening', 'secret_exposure'],
  },
  {
    type: 'cloudflare',
    label: 'Cloudflare',
    description: 'Pages, Workers, domains, DNS, deployment status, and edge observability.',
    defaultAuthorityLevel: 'L6',
    defaultDataBoundary: 'Project deployment metadata and sanitized logs only.',
    secretsPolicy: 'API tokens remain in provider secrets; dashboard shows secret_ref only.',
    capabilities: [CAPABILITIES.inspectData, CAPABILITIES.deploy],
    blockedByDefault: ['dns_change', 'domain_transfer', 'production_deploy_without_gate'],
  },
  {
    type: 'openai',
    label: 'OpenAI',
    description: 'Replaceable model capability behind server-side adapters.',
    defaultAuthorityLevel: 'L3',
    defaultDataBoundary: 'Server-side model calls with minimized prompts and no durable private memory.',
    secretsPolicy: 'API keys stay server-side and never ship to browser or client repositories.',
    capabilities: [CAPABILITIES.inspectData],
    blockedByDefault: ['client_side_key', 'raw_private_content_ingest'],
  },
  {
    type: 'anthropic',
    label: 'Anthropic',
    description: 'Replaceable long-context model capability behind server-side adapters.',
    defaultAuthorityLevel: 'L3',
    defaultDataBoundary: 'Repository and operational context only; no uncontrolled private content mirror.',
    secretsPolicy: 'API keys stay server-side and never ship to browser or client repositories.',
    capabilities: [CAPABILITIES.inspectData],
    blockedByDefault: ['client_side_key', 'raw_private_content_ingest'],
  },
  {
    type: 'figma',
    label: 'Figma',
    description: 'Design files, prototypes, component libraries, and product review surfaces.',
    defaultAuthorityLevel: 'L4',
    defaultDataBoundary: 'Design artifacts and review comments only.',
    secretsPolicy: 'OAuth/token references only; never store design-access tokens in config.',
    capabilities: [CAPABILITIES.writeDesign],
    blockedByDefault: ['publish_external', 'delete_design_file'],
  },
  {
    type: 'canva',
    label: 'Canva',
    description: 'Marketing, presentation, social, and brand asset workflows.',
    defaultAuthorityLevel: 'L4',
    defaultDataBoundary: 'Brand assets and approved campaign copy only.',
    secretsPolicy: 'Connector authorization remains outside repository config.',
    capabilities: [CAPABILITIES.writeDesign],
    blockedByDefault: ['publish_external', 'delete_brand_assets'],
  },
  {
    type: 'gmail',
    label: 'Gmail',
    description: 'Founder-approved inbox triage, draft, forwarding, and external communication surface.',
    defaultAuthorityLevel: 'L6',
    defaultDataBoundary: 'Founder mailbox actions only; do not copy mailbox contents into Control Room storage.',
    secretsPolicy: 'OAuth connection is provider-held; never persist tokens in Control Room tables.',
    capabilities: [CAPABILITIES.inspectData, CAPABILITIES.sendExternalMessage],
    blockedByDefault: ['send_without_founder_instruction', 'delete_email', 'bulk_forward_private_threads'],
  },
  {
    type: 'shopify',
    label: 'Shopify',
    description: 'Storefront data, commerce operations, product catalog, checkout, and app surfaces.',
    defaultAuthorityLevel: 'L6',
    defaultDataBoundary: 'Store operations only after commercial consent; customer data stays minimized.',
    secretsPolicy: 'Admin tokens and storefront tokens are secret references only.',
    capabilities: [CAPABILITIES.inspectData, CAPABILITIES.deploy],
    blockedByDefault: ['charge_customer', 'refund_order', 'change_pricing_without_gate'],
  },
  {
    type: 'playwright',
    label: 'Playwright',
    description: 'Browser verification and UI evidence collection.',
    defaultAuthorityLevel: 'L3',
    defaultDataBoundary: 'Screenshots, console errors, network health, and test evidence only.',
    secretsPolicy: 'No production secrets inside browser context.',
    capabilities: [CAPABILITIES.inspectData],
    blockedByDefault: ['production_mutation', 'credential_capture'],
  },
  {
    type: 'other',
    label: 'Other provider',
    description: 'Explicitly documented custom provider connection.',
    defaultAuthorityLevel: 'L1',
    defaultDataBoundary: 'Must be declared before activation.',
    secretsPolicy: 'Secret references only; custom providers inherit the no-secret-storage rule.',
    capabilities: [CAPABILITIES.inspectData],
    blockedByDefault: ['undeclared_high_risk_action'],
  },
] as const satisfies readonly PluginDescriptor[];

export function isAuthorityLevel(value: unknown): value is AuthorityLevel {
  return typeof value === 'string' && AUTHORITY_LEVEL_IDS.has(value);
}

export function pluginDescriptorFor(type: string): PluginDescriptor | null {
  return PLUGIN_CATALOG.find((plugin) => plugin.type === type) ?? null;
}

export function pluginRiskFor(authorityLevel: string | null, requiredApproval: string | null): PluginRiskLevel {
  if (authorityLevel === 'L6') return 'critical';
  if (authorityLevel === 'L5') return 'high';
  if (authorityLevel === 'L3' || authorityLevel === 'L4') return 'medium';
  if (requiredApproval && requiredApproval.trim().length > 0) return 'medium';
  return 'low';
}

export function summarizePluginConnections(
  connections: readonly PluginConnectionSnapshot[],
): PluginCenterSummary {
  return {
    installedConnections: connections.length,
    activeConnections: connections.filter((connection) => connection.status === 'active').length,
    disconnectedConnections: connections.filter((connection) => connection.status === 'disconnected').length,
    errorConnections: connections.filter((connection) => connection.status === 'error').length,
    highRiskConnections: connections.filter((connection) => connection.risk === 'high' || connection.risk === 'critical').length,
    missingAuthorityLevel: connections.filter((connection) => !isAuthorityLevel(connection.authorityLevel)).length,
  };
}

export function authorityLevelLabels(): readonly string[] {
  return AUTHORITY_LEVELS.map((authority) => `${authority.level}: ${authority.label}`);
}
