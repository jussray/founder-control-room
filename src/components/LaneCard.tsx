import { deriveLaneHealth } from '@/lib/laneHealth';
import type { LaneHealthState, LaneSummary } from '@/lib/types';

const healthTone: Record<LaneHealthState, string> = {
  healthy: 'var(--green)',
  waiting: 'var(--yellow)',
  blocked: 'var(--red)',
  unknown: 'var(--unknown)'
};

export function LaneCard({ lane }: { lane: LaneSummary }) {
  const health = deriveLaneHealth(lane);
  return (
    <section className="laneCard">
      <div className="laneHeader">
        <div>
          <p className="eyebrow">{lane.status}</p>
          <h2>{lane.label}</h2>
        </div>
        <span className="riskBadge" style={{ borderColor: healthTone[health] }}>
          <span className={`healthDot health-${health}`} />
          {health}
        </span>
      </div>
      <p className="laneDescription">{lane.description}</p>
      <div className="metricGrid">
        {lane.metrics.map((metric) => (
          <div className="metricBox" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
