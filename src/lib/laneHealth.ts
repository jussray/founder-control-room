import type { LaneHealthState, LaneSummary, RiskState } from './types.js';

/**
 * How long a lane can go without an `updated_at` bump before its risk
 * color is treated as stale rather than current. A presentation-only
 * default, not a persisted policy — safe to retune without a migration.
 */
export const LANE_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

const RISK_TO_HEALTH: Record<RiskState, LaneHealthState> = {
  green: 'healthy',
  yellow: 'waiting',
  red: 'blocked',
};

/**
 * Derives a presentation-only health state from a lane's persisted risk
 * plus recency. `lanes.risk` stays green/yellow/red at rest (see
 * 002_lanes_missions_events.sql) — this never reads or writes a fifth
 * database value.
 *
 * A lane with no `updatedAt` at all (e.g. static seed data) falls back to
 * the plain risk mapping instead of being marked unknown, since an absent
 * field means "not checked," not "checked and stale."
 */
export function deriveLaneHealth(
  lane: Pick<LaneSummary, 'risk' | 'updatedAt'>,
  now: Date = new Date(),
): LaneHealthState {
  if (lane.updatedAt) {
    const updated = new Date(lane.updatedAt).getTime();
    if (!Number.isNaN(updated) && now.getTime() - updated > LANE_STALE_AFTER_MS) {
      return 'unknown';
    }
  }
  return RISK_TO_HEALTH[lane.risk];
}
