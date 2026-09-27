import { createHash, createHmac } from 'node:crypto';

export const ACTIVE_DEFENSE_CONTRACT = 'juss/active-defense@v1';
export const HALLWAY_BASE_EXPANSION = 48_000;
export const HALLWAY_RANDOM_EXPANSION_MAX = 48_000;

export const ACTIVE_ATTACK_FLOWS = [
  'attack10',
  'attack20',
  'attack30',
  'attack3000',
  'attack5000',
  'attack6000',
  'attack48000',
  'redteamI',
  'redteamII',
  'redteamTwin',
  'devil',
  'lindymode',
  'l99',
  'ooda',
  'truthmode',
  'confess',
  'goalfix',
  'proofMode',
  'continuity',
  'rollback',
] as const;

export type AttackFlowName = (typeof ACTIVE_ATTACK_FLOWS)[number];
export type ActiveDefenseMode = 'off' | 'observe' | 'contain';
export type ActiveDefenseVerdict =
  | 'ALLOW'
  | 'VERIFIED_BOT'
  | 'OBSERVE_AUTOMATION'
  | 'HALLWAY'
  | 'DROP_SESSION';

interface BotManagementSignals {
  score?: number;
  verifiedBot?: boolean;
  signedAgent?: boolean;
  ja3Hash?: string;
  ja4?: string;
  detectionIds?: number[];
}

interface CloudflareSignals {
  asn?: number;
  asOrganization?: string;
  verifiedBotCategory?: string;
  botManagement?: BotManagementSignals | null;
}

interface RequestWithCloudflare extends Request {
  cf?: CloudflareSignals;
}

export interface ActiveDefenseEnv {
  ACTIVE_DEFENSE_MODE?: ActiveDefenseMode;
  FOUNDER_SESSION_ENCRYPTION_KEY?: string;
}

export interface AttackFlowResult {
  flow: AttackFlowName;
  score: number;
  finding: string;
}

export interface ActiveDefenseDecision {
  contract: typeof ACTIVE_DEFENSE_CONTRACT;
  verdict: ActiveDefenseVerdict;
  actorFingerprint: string;
  incidentFingerprint: string;
  sourceIp: string;
  asn: number | null;
  asOrganization: string | null;
  claimedUserAgent: string;
  verifiedBot: boolean;
  verifiedBotCategory: string | null;
  botScore: number | null;
  risk: number;
  logicalExpansion: number;
  fixedExpansion: number;
  randomExpansion: number;
  attackUnit: AttackFlowResult[];
  evidence: {
    method: string;
    pathname: string;
    cfRay: string | null;
    ja3: string | null;
    ja4: string | null;
    automationClaimed: boolean;
    suspiciousPath: boolean;
  };
  controls: {
    outboundProbe: false;
    productionExposure: 0;
    realCredentialsExposed: 0;
    customerDataExposed: 0;
    lazyMaterialization: true;
    sessionIsolationRequired: true;
  };
}

const AUTOMATION_UA = /(bot|crawler|spider|scrapy|curl|wget|httpclient|python-requests|go-http-client|headless|scanner|nikto|nmap)/i;
const SUSPICIOUS_PATH = /(^|\/)(\.env|\.git|wp-admin|wp-login\.php|phpmyadmin|server-status|actuator|cgi-bin|\.aws|etc\/passwd|vendor\/phpunit|boaform)(\/|$)/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

function normalizedMode(value: unknown): ActiveDefenseMode {
  return value === 'contain' || value === 'observe' || value === 'off' ? value : 'observe';
}

function randomExpansion(secret: string, incidentFingerprint: string): number {
  const digest = hmac(secret, `hallway-random:${incidentFingerprint}`);
  const sample = Number.parseInt(digest.slice(0, 12), 16);
  return 1 + (sample % HALLWAY_RANDOM_EXPANSION_MAX);
}

function flow(
  name: AttackFlowName,
  score: number,
  finding: string,
): AttackFlowResult {
  return { flow: name, score: clamp(score, 0, 100), finding };
}

function runAttackUnit(input: {
  suspiciousPath: boolean;
  automationClaimed: boolean;
  verifiedBot: boolean;
  botScore: number | null;
  method: string;
  pathname: string;
  cfRay: string | null;
  sourceIp: string;
  asn: number | null;
}): AttackFlowResult[] {
  const lowBotScore = input.botScore !== null && input.botScore < 30;
  const noRay = !input.cfRay;
  const unknownSource = input.sourceIp === 'unknown';
  const mutationMethod = !['GET', 'HEAD', 'OPTIONS'].includes(input.method);

  // Every meaningful request is evaluated by the entire attack ensemble against
  // the same bounded evidence object. These are deliberately lightweight
  // runtime checks; the expensive attack suites remain CI/proof gates.
  return [
    flow('attack10', input.suspiciousPath ? 95 : lowBotScore ? 70 : 10, input.suspiciousPath ? 'known reconnaissance path' : 'baseline ingress abuse checks'),
    flow('attack20', noRay ? 55 : 5, noRay ? 'continuity witness missing' : 'edge continuity present'),
    flow('attack30', mutationMethod && input.automationClaimed ? 65 : 10, 'state-transition pressure check'),
    flow('attack3000', lowBotScore ? 75 : 15, 'automation pressure sweep'),
    flow('attack5000', mutationMethod ? 45 : 10, 'authority-boundary pressure sweep'),
    flow('attack6000', input.automationClaimed && !input.verifiedBot ? 70 : 10, 'identity/evidence contradiction sweep'),
    flow('attack48000', input.suspiciousPath || lowBotScore ? 90 : 20, 'portfolio-scale adversarial pressure gate'),
    flow('redteamI', input.suspiciousPath ? 90 : 15, 'premise and exploitability challenge'),
    flow('redteamII', mutationMethod ? 55 : 10, 'solution and control-plane challenge'),
    flow('redteamTwin', input.automationClaimed && !input.verifiedBot ? 60 : 10, 'counterparty trust challenge'),
    flow('devil', unknownSource || noRay ? 60 : 15, 'escape, attribution, and cost-amplification challenge'),
    flow('lindymode', 5, 'bounded stateless controls preferred over fragile retaliation'),
    flow('l99', mutationMethod ? 40 : 5, 'authority, state, evidence, rollback, compounding-value check'),
    flow('ooda', input.suspiciousPath ? 70 : 10, 'observe-orient-decide-act-verify loop'),
    flow('truthmode', input.verifiedBot ? 5 : input.automationClaimed ? 45 : 10, 'separate claimed identity from verified identity'),
    flow('confess', input.automationClaimed && !input.verifiedBot ? 45 : 5, 'record attribution uncertainty'),
    flow('goalfix', input.suspiciousPath ? 65 : 5, 'smallest reversible containment action'),
    flow('proofMode', noRay ? 50 : 5, 'evidence receipt completeness'),
    flow('continuity', noRay ? 45 : 5, 'session/evidence lineage check'),
    flow('rollback', 5, 'response-only containment remains instantly reversible'),
  ];
}

function riskFromAttackUnit(results: AttackFlowResult[]): number {
  // Weight the strongest findings rather than summing every lens and creating a
  // runaway score merely because the same event is examined many ways.
  const top = [...results].sort((a, b) => b.score - a.score).slice(0, 5);
  return Math.round(top.reduce((sum, item) => sum + item.score, 0) / top.length);
}

export function evaluateActiveDefenseRequest(
  request: Request,
  env: ActiveDefenseEnv,
): ActiveDefenseDecision {
  const cfRequest = request as RequestWithCloudflare;
  const cf = cfRequest.cf;
  const bot = cf?.botManagement ?? null;
  const url = new URL(request.url);
  const mode = normalizedMode(env.ACTIVE_DEFENSE_MODE);
  const sourceIp = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
  const claimedUserAgent = request.headers.get('User-Agent')?.trim() || 'unknown';
  const verifiedBot = bot?.verifiedBot === true;
  const botScore = Number.isFinite(bot?.score) ? Number(bot?.score) : null;
  const automationClaimed = AUTOMATION_UA.test(claimedUserAgent);
  const suspiciousPath = SUSPICIOUS_PATH.test(url.pathname);
  const cfRay = request.headers.get('CF-Ray');
  const asn = Number.isFinite(cf?.asn) ? Number(cf?.asn) : null;
  const asOrganization = typeof cf?.asOrganization === 'string' ? cf.asOrganization : null;

  const actorFingerprint = sha256(JSON.stringify({
    sourceIp,
    asn,
    asOrganization,
    claimedUserAgent,
    ja3: bot?.ja3Hash ?? null,
    ja4: bot?.ja4 ?? null,
  }));
  const incidentFingerprint = sha256(JSON.stringify({
    actorFingerprint,
    method: request.method,
    pathname: url.pathname,
    queryKeys: [...url.searchParams.keys()].sort(),
    cfRay,
  }));

  const attackUnit = runAttackUnit({
    suspiciousPath,
    automationClaimed,
    verifiedBot,
    botScore,
    method: request.method,
    pathname: url.pathname,
    cfRay,
    sourceIp,
    asn,
  });
  const risk = riskFromAttackUnit(attackUnit);

  let verdict: ActiveDefenseVerdict = 'ALLOW';
  if (verifiedBot) verdict = 'VERIFIED_BOT';
  else if (mode !== 'off' && (automationClaimed || botScore !== null)) verdict = 'OBSERVE_AUTOMATION';
  if (mode === 'contain' && !verifiedBot && (suspiciousPath || risk >= 70)) verdict = 'HALLWAY';

  const secret = env.FOUNDER_SESSION_ENCRYPTION_KEY?.trim() || '';
  const extra = verdict === 'HALLWAY' && secret
    ? randomExpansion(secret, incidentFingerprint)
    : 0;
  const fixed = verdict === 'HALLWAY' ? HALLWAY_BASE_EXPANSION : 0;

  return {
    contract: ACTIVE_DEFENSE_CONTRACT,
    verdict,
    actorFingerprint,
    incidentFingerprint,
    sourceIp,
    asn,
    asOrganization,
    claimedUserAgent,
    verifiedBot,
    verifiedBotCategory: typeof cf?.verifiedBotCategory === 'string' ? cf.verifiedBotCategory : null,
    botScore,
    risk,
    logicalExpansion: fixed + extra,
    fixedExpansion: fixed,
    randomExpansion: extra,
    attackUnit,
    evidence: {
      method: request.method,
      pathname: url.pathname,
      cfRay,
      ja3: bot?.ja3Hash ?? null,
      ja4: bot?.ja4 ?? null,
      automationClaimed,
      suspiciousPath,
    },
    controls: {
      outboundProbe: false,
      productionExposure: 0,
      realCredentialsExposed: 0,
      customerDataExposed: 0,
      lazyMaterialization: true,
      sessionIsolationRequired: true,
    },
  };
}

function syntheticLinks(request: Request, decision: ActiveDefenseDecision): string[] {
  const origin = new URL(request.url).origin;
  const seed = decision.incidentFingerprint;
  return Array.from({ length: 8 }, (_, index) => {
    const node = sha256(`${seed}:${index}`).slice(0, 16);
    return `${origin}/api/v1/resource/${node}`;
  });
}

export function activeDefenseResponse(
  request: Request,
  decision: ActiveDefenseDecision,
): Response | null {
  const logRecord = {
    type: 'juss.active-defense',
    contract: decision.contract,
    verdict: decision.verdict,
    actor_fingerprint: decision.actorFingerprint,
    incident_fingerprint: decision.incidentFingerprint,
    source_ip: decision.sourceIp,
    asn: decision.asn,
    as_organization: decision.asOrganization,
    claimed_user_agent: decision.claimedUserAgent,
    verified_bot: decision.verifiedBot,
    verified_bot_category: decision.verifiedBotCategory,
    bot_score: decision.botScore,
    risk: decision.risk,
    fixed_expansion: decision.fixedExpansion,
    random_expansion: decision.randomExpansion,
    logical_expansion: decision.logicalExpansion,
    attack_flows: decision.attackUnit.map((item) => item.flow),
    evidence: decision.evidence,
    controls: decision.controls,
  };
  console.info(JSON.stringify(logRecord));

  if (decision.verdict !== 'HALLWAY') return null;

  // The Hallway is local deception only. No request is sent back to the source
  // IP, and no synthetic value carries a real credential, customer record, or
  // production authority. The huge graph stays logical; only touched nodes are
  // materialized by subsequent inbound requests.
  const payload = {
    ok: true,
    request_id: decision.incidentFingerprint.slice(0, 24),
    continuation: syntheticLinks(request, decision),
    cursor: sha256(`cursor:${decision.incidentFingerprint}`).slice(0, 24),
  };
  return Response.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function enforceActiveDefense(
  request: Request,
  env: ActiveDefenseEnv,
): Response | null {
  const decision = evaluateActiveDefenseRequest(request, env);
  return activeDefenseResponse(request, decision);
}
