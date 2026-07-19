import type { MissionCard as Mission } from '@/lib/types';

export function MissionCard({ mission }: { mission: Mission }) {
  return (
    <article className="missionCard">
      <div className="missionTop">
        <div>
          <p className="eyebrow">{mission.lane}</p>
          <h3>{mission.title}</h3>
        </div>
        <span className={`riskDot risk-${mission.risk}`} />
      </div>
      <p className="objective">{mission.objective}</p>
      <div className="oodaGrid">
        <OodaColumn label="Observe" items={mission.observe} />
        <OodaColumn label="Orient" items={mission.orient} />
        <OodaColumn label="Decide" items={mission.decide} />
        <OodaColumn label="Act" items={mission.act} />
      </div>
      <div className="evidenceBox">
        <p className="eyebrow">Evidence</p>
        <ul>
          {mission.evidence.map((item) => (
            <li key={item.id}>
              <span>{item.verified ? '✓' : '•'}</span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      <p className="nextAction"><strong>Next:</strong> {mission.nextAction}</p>
    </article>
  );
}

function OodaColumn({ label, items }: { label: string; items: string[] }) {
  return (
    <section className="oodaColumn">
      <p className="eyebrow">{label}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
