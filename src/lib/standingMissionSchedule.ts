import { createHash } from 'node:crypto';

export const STANDING_MISSION_SCHEDULE_CONTRACT = 'fcr/standing-mission-schedule@v1' as const;

export type StandingMissionTimingMode = 'exact_schedule' | 'flexible_schedule' | 'condition_watch';

export type StandingMissionCadence =
  | { kind: 'interval'; minutes: number; anchor: string }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; weekdays: number[]; hour: number; minute: number };

export interface StandingMissionDefinitionInput {
  missionId: string;
  sourceTaskRef: string;
  timingMode: StandingMissionTimingMode;
  cadence: StandingMissionCadence;
  timezone: string;
  executionProfile: string;
  privatePrompt: string;
  capabilityManifest: string[];
}

const TIMING_MODES = new Set<StandingMissionTimingMode>([
  'exact_schedule',
  'flexible_schedule',
  'condition_watch',
]);
const WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6]);
const MAX_INTERVAL_MINUTES = 60 * 24 * 31;

function text(value: unknown, field: string, maxLength = 2_000): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1-${maxLength} characters`);
  }
  return normalized;
}

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return Number(value);
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error('timezone must be a valid IANA time zone');
  }
}

export function normalizeStandingMissionCadence(value: unknown): StandingMissionCadence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cadence must be an object');
  }
  const cadence = value as Record<string, unknown>;
  if (cadence.kind === 'interval') {
    const minutes = boundedInteger(cadence.minutes, 'cadence.minutes', 1, MAX_INTERVAL_MINUTES);
    const anchor = text(cadence.anchor, 'cadence.anchor', 80);
    if (!Number.isFinite(Date.parse(anchor))) throw new Error('cadence.anchor must be an RFC3339 timestamp');
    return { kind: 'interval', minutes, anchor: new Date(anchor).toISOString() };
  }
  if (cadence.kind === 'daily') {
    return {
      kind: 'daily',
      hour: boundedInteger(cadence.hour, 'cadence.hour', 0, 23),
      minute: boundedInteger(cadence.minute, 'cadence.minute', 0, 59),
    };
  }
  if (cadence.kind === 'weekly') {
    if (!Array.isArray(cadence.weekdays) || cadence.weekdays.length === 0) {
      throw new Error('cadence.weekdays must contain at least one weekday');
    }
    const weekdays = [...new Set(cadence.weekdays.map((value) => boundedInteger(value, 'cadence.weekdays', 0, 6)))].sort();
    if (weekdays.some((value) => !WEEKDAYS.has(value))) throw new Error('cadence.weekdays is invalid');
    return {
      kind: 'weekly',
      weekdays,
      hour: boundedInteger(cadence.hour, 'cadence.hour', 0, 23),
      minute: boundedInteger(cadence.minute, 'cadence.minute', 0, 59),
    };
  }
  throw new Error('cadence.kind must be interval, daily, or weekly');
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function localDateToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedParts(new Date(guess), timezone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      0,
      0,
    );
    const delta = desired - observedAsUtc;
    if (delta === 0) return new Date(guess);
    guess += delta;
  }

  const finalParts = zonedParts(new Date(guess), timezone);
  if (
    finalParts.year !== year
    || finalParts.month !== month
    || finalParts.day !== day
    || finalParts.hour !== hour
    || finalParts.minute !== minute
  ) {
    throw new Error('local schedule time could not be resolved in timezone');
  }
  return new Date(guess);
}

function addLocalDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number; weekday: number } {
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    weekday: next.getUTCDay(),
  };
}

export function nextStandingMissionRun(
  cadenceInput: StandingMissionCadence,
  timezoneInput: string,
  afterInput: Date | string,
): Date {
  const cadence = normalizeStandingMissionCadence(cadenceInput);
  const timezone = text(timezoneInput, 'timezone', 120);
  assertTimezone(timezone);
  const after = afterInput instanceof Date ? new Date(afterInput.getTime()) : new Date(afterInput);
  if (!Number.isFinite(after.getTime())) throw new Error('after must be a valid timestamp');

  if (cadence.kind === 'interval') {
    const anchorMs = Date.parse(cadence.anchor);
    const intervalMs = cadence.minutes * 60_000;
    if (after.getTime() < anchorMs) return new Date(anchorMs);
    const steps = Math.floor((after.getTime() - anchorMs) / intervalMs) + 1;
    return new Date(anchorMs + steps * intervalMs);
  }

  const current = zonedParts(after, timezone);
  for (let offset = 0; offset <= 14; offset += 1) {
    const localDate = addLocalDays(current.year, current.month, current.day, offset);
    if (cadence.kind === 'weekly' && !cadence.weekdays.includes(localDate.weekday)) continue;
    const candidate = localDateToUtc(
      timezone,
      localDate.year,
      localDate.month,
      localDate.day,
      cadence.hour,
      cadence.minute,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }

  throw new Error('next standing mission run could not be resolved');
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function standingMissionDefinitionFingerprint(input: StandingMissionDefinitionInput): string {
  const missionId = text(input.missionId, 'missionId', 120);
  const sourceTaskRef = text(input.sourceTaskRef, 'sourceTaskRef', 200);
  if (!TIMING_MODES.has(input.timingMode)) throw new Error('timingMode is unsupported');
  const cadence = normalizeStandingMissionCadence(input.cadence);
  const timezone = text(input.timezone, 'timezone', 120);
  assertTimezone(timezone);
  const executionProfile = text(input.executionProfile, 'executionProfile', 120);
  const privatePrompt = text(input.privatePrompt, 'privatePrompt', 100_000);
  const capabilityManifest = [...new Set(input.capabilityManifest.map((value) => text(value, 'capabilityManifest', 160)))].sort();

  return hash(JSON.stringify([
    STANDING_MISSION_SCHEDULE_CONTRACT,
    missionId,
    sourceTaskRef,
    input.timingMode,
    cadence,
    timezone,
    executionProfile,
    hash(privatePrompt),
    capabilityManifest,
  ]));
}
