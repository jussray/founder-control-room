/**
 * Incident Escalation Module
 * Routes security verdicts from Chief AI (REPAIR_REQUIRED, CONTAIN_ONLY) to incident channels.
 * Integrates with Slack, PagerDuty, Linear for severity-based escalation.
 * Called from emitReciprocalTelemetry hook after security verdict is determined.
 */

export interface SecurityVerdict {
  schema: string;
  service: string;
  verdict: 'HALLWAY' | 'CONTAIN_ONLY' | 'CONTAIN_ESCALATE' | 'REPAIR_REQUIRED' | 'OBSERVE';
  meaningful: boolean;
  unit?: {
    unitVerdict?: string;
    findings?: Array<{
      category: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      description?: string;
    }>;
  };
  technicalIdentity?: {
    actorFingerprint?: string | null;
    asn?: number | null;
    country?: string | null;
    claimedCrawler?: string | null;
    verifiedBot?: boolean;
    botScore?: number | null;
  };
  receipt?: string;
  hallway?: {
    active: boolean;
    baseExpansion: number;
  };
  boundaries?: {
    ownedOrAuthorizedSurfacesOnly?: boolean;
    externalCompromise?: boolean;
    externalExploit?: boolean;
  };
}

export interface IncidentEnv extends Record<string, string | undefined> {
  SLACK_WEBHOOK_URL?: string;
  PAGERDUTY_INTEGRATION_KEY?: string;
  LINEAR_API_KEY?: string;
  INCIDENT_WEBHOOK_URL?: string;
  FOUNDER_SLACK_USER_ID?: string;
}

const SEVERITY_MAP = Object.freeze({
  REPAIR_REQUIRED: 'critical',
  CONTAIN_ESCALATE: 'high',
  CONTAIN_ONLY: 'medium',
  HALLWAY: 'info',
  OBSERVE: 'low',
} as const);

function verdictToSeverity(verdict: string): keyof typeof SEVERITY_MAP {
  if (verdict === 'REPAIR_REQUIRED') return 'REPAIR_REQUIRED';
  if (verdict === 'CONTAIN_ESCALATE') return 'CONTAIN_ESCALATE';
  if (verdict === 'CONTAIN_ONLY') return 'CONTAIN_ONLY';
  if (verdict === 'HALLWAY') return 'HALLWAY';
  return 'OBSERVE';
}

function shouldEscalate(verdict: SecurityVerdict): boolean {
  if (!verdict.meaningful) return false;
  const s = verdictToSeverity(verdict.verdict);
  return SEVERITY_MAP[s] === 'critical' || SEVERITY_MAP[s] === 'high';
}

function formatSlackMessage(verdict: SecurityVerdict): {
  text: string;
  blocks: Array<Record<string, unknown>>;
} {
  const severity = SEVERITY_MAP[verdictToSeverity(verdict.verdict)];
  const emoji =
    severity === 'critical'
      ? ':rotating_light:'
      : severity === 'high'
        ? ':warning:'
        : severity === 'medium'
          ? ':information_source:'
          : ':white_check_mark:';

  const actor =
    verdict.technicalIdentity?.claimedCrawler ||
    (verdict.technicalIdentity?.verifiedBot ? 'verified-bot' : 'unknown-actor');
  const country = verdict.technicalIdentity?.country || 'unknown';

  const text = `${emoji} ${verdict.verdict} | ${verdict.service} | Actor: ${actor} | Country: ${country}`;

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} Security Incident: ${verdict.verdict}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Service:*\n${verdict.service}`,
        },
        {
          type: 'mrkdwn',
          text: `*Verdict:*\n${verdict.verdict}`,
        },
        {
          type: 'mrkdwn',
          text: `*Actor:*\n${actor}`,
        },
        {
          type: 'mrkdwn',
          text: `*Country:*\n${country}`,
        },
      ],
    },
  ];

  if (verdict.unit?.findings && verdict.unit.findings.length > 0) {
    const findingsText = verdict.unit.findings
      .map((f) => `• ${f.severity.toUpperCase()}: ${f.title}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Findings:*\n${findingsText}`,
      },
    });
  }

  if (verdict.boundaries?.externalCompromise || verdict.boundaries?.externalExploit) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⚠️ *EXTERNAL THREAT DETECTED* - May require immediate incident response',
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Receipt: \`${verdict.receipt?.slice(0, 16) || 'unknown'}\`  |  Timestamp: <!date^${Math.floor(Date.now() / 1000)}^{date_num} {time_secs}|${new Date().toISOString()}>`,
      },
    ],
  });

  return { text, blocks };
}

export async function escalateToSlack(
  verdict: SecurityVerdict,
  env: IncidentEnv,
): Promise<boolean> {
  if (!shouldEscalate(verdict)) return false;

  const webhookUrl = env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const message = formatSlackMessage(verdict);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message.text,
        blocks: message.blocks,
      }),
    });

    if (!response.ok) {
      console.error(
        '[incident-escalation] Slack webhook failed:',
        response.status,
        await response.text(),
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      '[incident-escalation] Slack escalation error:',
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function escalateToPagerDuty(
  verdict: SecurityVerdict,
  env: IncidentEnv,
): Promise<boolean> {
  const integrationKey = env.PAGERDUTY_INTEGRATION_KEY;
  if (!integrationKey) return false;

  const severity = SEVERITY_MAP[verdictToSeverity(verdict.verdict)];
  if (severity !== 'critical' && severity !== 'high') return false;

  try {
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: integrationKey,
        event_action: 'trigger',
        dedup_key: `${verdict.service}:${verdict.receipt?.slice(0, 16) || 'unknown'}`,
        payload: {
          summary: `${verdict.verdict} on ${verdict.service}`,
          severity,
          source: 'chief-ai-security',
          component: verdict.service,
          custom_details: {
            verdict: verdict.verdict,
            actor: verdict.technicalIdentity?.claimedCrawler || 'unknown',
            country: verdict.technicalIdentity?.country || 'unknown',
            external_threat: verdict.boundaries?.externalCompromise ? 'yes' : 'no',
          },
        },
      }),
    });

    if (!response.ok) {
      console.error(
        '[incident-escalation] PagerDuty escalation failed:',
        response.status,
        await response.text(),
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      '[incident-escalation] PagerDuty error:',
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function logIncidentToLinear(
  verdict: SecurityVerdict,
  env: IncidentEnv,
): Promise<boolean> {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) return false;

  const severity = SEVERITY_MAP[verdictToSeverity(verdict.verdict)];
  if (severity !== 'critical') return false;

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              issue {
                id
                identifier
              }
            }
          }
        `,
        variables: {
          input: {
            teamId: 'security', // Assumes 'security' team exists
            title: `Security Incident: ${verdict.verdict} on ${verdict.service}`,
            description: `Verdict: ${verdict.verdict}\nService: ${verdict.service}\nActor: ${verdict.technicalIdentity?.claimedCrawler || 'unknown'}\nCountry: ${verdict.technicalIdentity?.country || 'unknown'}\nReceipt: ${verdict.receipt}`,
            priority: 1, // Urgent
            labels: [verdict.verdict, 'security', 'auto-created'],
          },
        },
      }),
    });

    if (!response.ok) {
      console.error(
        '[incident-escalation] Linear creation failed:',
        response.status,
        await response.text(),
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      '[incident-escalation] Linear error:',
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function escalateIncident(
  verdict: SecurityVerdict,
  env: IncidentEnv,
): Promise<void> {
  if (!shouldEscalate(verdict)) return;

  console.log(
    '[incident-escalation] Escalating',
    verdict.verdict,
    'from',
    verdict.service,
  );

  const results = await Promise.allSettled([
    escalateToSlack(verdict, env),
    escalateToPagerDuty(verdict, env),
    logIncidentToLinear(verdict, env),
  ]);

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  const failed = results.filter((r) => r.status === 'rejected' || !r.value).length;

  console.log(`[incident-escalation] Escalation complete: ${succeeded} succeeded, ${failed} failed`);
}

export function emitReciprocalTelemetryWithEscalation(
  verdict: SecurityVerdict,
  env: IncidentEnv,
  ctx?: { waitUntil?: (promise: Promise<unknown>) => void },
): void {
  if (!verdict.meaningful) return;

  const logTask = Promise.resolve().then(() => {
    console.log('[reciprocal-defense]', JSON.stringify(verdict));
  });

  const escalationTask = escalateIncident(verdict, env);

  const allTasks = Promise.all([logTask, escalationTask]);

  if (ctx?.waitUntil) {
    ctx.waitUntil(allTasks);
  } else {
    allTasks.catch(() => undefined);
  }
}
