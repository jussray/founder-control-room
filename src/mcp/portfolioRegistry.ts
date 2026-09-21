import { getKnownProject } from "../config/portfolio.js";

const SERVER_SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const REGISTRY_VERSION = "1.0.0";
const FCR_API_ORIGIN = "https://api.foundercontrolroom.org";

export const PORTFOLIO_MCP_REGISTRY_PROJECTS = [
  "founder-control-room",
  "chief-ai-machine",
  "solcontinuity",
  "promptos",
] as const;

export const PORTFOLIO_MCP_BRIDGE_PROJECTS = [
  "founder-control-room",
  "solcontinuity",
  "promptos",
] as const;

export type PortfolioMcpRegistryProjectSlug =
  (typeof PORTFOLIO_MCP_REGISTRY_PROJECTS)[number];

const registryNames: Record<PortfolioMcpRegistryProjectSlug, string> = {
  "founder-control-room": "org.foundercontrolroom/fcr",
  "chief-ai-machine": "org.foundercontrolroom/chief",
  solcontinuity: "org.foundercontrolroom/sol",
  promptos: "org.foundercontrolroom/promptos",
};

const registryTitles: Record<PortfolioMcpRegistryProjectSlug, string> = {
  "founder-control-room": "Founder Control Room",
  "chief-ai-machine": "Chief AI Machine ProofMode",
  solcontinuity: "SolContinuity",
  promptos: "PromptOS",
};

const registryDescriptions: Record<PortfolioMcpRegistryProjectSlug, string> = {
  "founder-control-room": "Governed FCR read and preview tools scoped to Founder Control Room.",
  "chief-ai-machine": "Chief ProofMode read-only repository evidence audit server.",
  solcontinuity: "Governed FCR read bridge scoped only to SolContinuity continuity evidence.",
  promptos: "Governed FCR read bridge scoped only to PromptOS prompt and workflow evidence.",
};

function bridgeRemote(slug: (typeof PORTFOLIO_MCP_BRIDGE_PROJECTS)[number]) {
  return {
    type: "streamable-http" as const,
    url: `${FCR_API_ORIGIN}/mcp/portfolio/${slug}`,
    headers: [
      {
        name: "Authorization",
        description: "Enter the server credential as: Bearer <FCR remote read token>.",
        isRequired: true,
        isSecret: true,
      },
    ],
  };
}

function serverFor(slug: PortfolioMcpRegistryProjectSlug) {
  const project = getKnownProject(slug);
  if (!project) {
    throw new Error(`MCP registry project is not a known FCR project: ${slug}`);
  }

  const remote = slug === "chief-ai-machine"
    ? {
        type: "streamable-http" as const,
        url: "https://chief-ai.mcgill-raylene.workers.dev/mcp",
      }
    : bridgeRemote(slug);

  return {
    server: {
      $schema: SERVER_SCHEMA,
      name: registryNames[slug],
      title: registryTitles[slug],
      description: registryDescriptions[slug],
      version: REGISTRY_VERSION,
      repository: {
        url: `https://github.com/${project.repository}`,
        source: "github",
      },
      remotes: [remote],
    },
  };
}

export function buildPortfolioMcpRegistryResponse(options: {
  search?: string;
  version?: string;
} = {}) {
  const requestedVersion = options.version?.trim();
  if (
    requestedVersion &&
    requestedVersion !== "latest" &&
    requestedVersion !== REGISTRY_VERSION
  ) {
    return { servers: [], metadata: { count: 0 } };
  }

  const search = options.search?.trim().toLowerCase();
  const servers = PORTFOLIO_MCP_REGISTRY_PROJECTS
    .map(serverFor)
    .filter((entry) => {
      if (!search) return true;
      const project = entry.server;
      return [
        project.name,
        project.title,
        project.description,
        project.repository.url,
      ].some((value) => value.toLowerCase().includes(search));
    });

  return {
    servers,
    metadata: { count: servers.length },
  };
}
