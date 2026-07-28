import { pathToFileURL } from "node:url";
import { createZapierSdk } from "@zapier/zapier-sdk";

type AppRow = {
  key?: unknown;
  slug?: unknown;
};

type ConnectionRow = {
  app_key?: unknown;
  is_expired?: unknown;
};

export type ReadonlyVerificationSummary = {
  authenticated: true;
  mode: "read_only";
  limits: {
    apps: 100;
    connections: 100;
  };
  availableAppsObserved: number;
  connectionsObserved: number;
  expiredConnectionsObserved: number;
  appKeys: string[];
  possibleAdditionalApps: boolean;
  possibleAdditionalConnections: boolean;
  redactedFields: string[];
};

function createClient() {
  const clientId = process.env.ZAPIER_CREDENTIALS_CLIENT_ID?.trim();
  const clientSecret = process.env.ZAPIER_CREDENTIALS_CLIENT_SECRET?.trim();
  const directToken = process.env.ZAPIER_CREDENTIALS?.trim();

  if (clientId || clientSecret) {
    if (!clientId || !clientSecret) {
      throw new Error("incomplete_client_credentials");
    }

    return createZapierSdk({
      credentials: {
        clientId,
        clientSecret,
      },
    });
  }

  if (directToken) {
    return createZapierSdk({ credentials: directToken });
  }

  return createZapierSdk();
}

function asRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isExpired(value: unknown): boolean {
  return value === true || value === "true";
}

export function classifyFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message === "incomplete_client_credentials") {
    return message;
  }

  if (/auth|credential|login|unauthori[sz]ed|401/i.test(message)) {
    return "authentication_required";
  }

  if (/fetch|network|econn|timeout|socket/i.test(message)) {
    return "network_failure";
  }

  return "verification_failed";
}

export function buildReadonlySummary(
  apps: unknown,
  connections: unknown,
): ReadonlyVerificationSummary {
  const appRows = asRows(apps) as AppRow[];
  const connectionRows = asRows(connections) as ConnectionRow[];
  const appKeys = new Set<string>();

  for (const app of appRows) {
    const appKey = asNonEmptyString(app.slug) ?? asNonEmptyString(app.key);
    if (appKey) appKeys.add(appKey);
  }

  for (const connection of connectionRows) {
    const appKey = asNonEmptyString(connection.app_key);
    if (appKey) appKeys.add(appKey);
  }

  return {
    authenticated: true,
    mode: "read_only",
    limits: {
      apps: 100,
      connections: 100,
    },
    availableAppsObserved: appRows.length,
    connectionsObserved: connectionRows.length,
    expiredConnectionsObserved: connectionRows.filter((connection) =>
      isExpired(connection.is_expired),
    ).length,
    appKeys: [...appKeys].sort(),
    possibleAdditionalApps: appRows.length === 100,
    possibleAdditionalConnections: connectionRows.length === 100,
    redactedFields: [
      "profile",
      "connection_id",
      "connection_title",
      "account_label",
      "email",
    ],
  };
}

async function main(): Promise<void> {
  const zapier = createClient();

  // Authentication proof only. Profile fields are deliberately discarded.
  await zapier.getProfile();

  const [{ data: apps }, { data: connections }] = await Promise.all([
    zapier.listApps({ maxItems: 100 }),
    zapier.listConnections({
      owner: "me",
      pageSize: 100,
      maxItems: 100,
    }),
  ]);

  console.log(JSON.stringify(buildReadonlySummary(apps, connections), null, 2));
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    console.error(
      JSON.stringify(
        {
          authenticated: false,
          mode: "read_only",
          error: classifyFailure(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
