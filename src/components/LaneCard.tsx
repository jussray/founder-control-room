import type { LaneSummary } from '@/lib/types';

const riskTone: Record<LaneSummary['risk'], string> = {
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  red: 'var(--red)'
};

export function LaneCard({ lane }: { lane: LaneSummary }) {
  return (
    <section className="laneCard">
      <div className="laneHeader">
        <div>
          <p className="eyebrow">{lane.status}</p>
          <h2>{lane.label}</h2>
        </div>
        <span className="riskBadge" style={{ borderColor: riskTone[lane.risk] }}>
          {lane.risk}
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
