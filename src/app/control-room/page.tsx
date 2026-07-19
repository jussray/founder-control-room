import { LaneCard } from '@/components/LaneCard';
import { MissionCard } from '@/components/MissionCard';
import { laneSummaries, missionCards } from '@/lib/data';

export default function ControlRoomPage() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Founder Control Room</p>
          <h1>One command surface.<br />Three governed lanes.</h1>
          <p className="heroCopy">
            Founder OS is embedded here as the operating contract.
            Se&apos;kret Bip and the partner project run as governed lanes
            under the same evidence-backed, non-destructive policy.
          </p>
        </div>
        <div className="heroPanel">
          <div>
            <span className="panelLabel">North star</span>
            <strong>Ship faster without false greens</strong>
          </div>
          <div>
            <span className="panelLabel">Execution style</span>
            <strong>Event-first, evidence-backed, reversible</strong>
          </div>
          <div>
            <span className="panelLabel">Default posture</span>
            <strong>Brand and IP protected</strong>
          </div>
        </div>
      </section>

      <section className="laneGrid">
        {laneSummaries.map((lane) => (
          <LaneCard key={lane.id} lane={lane} />
        ))}
      </section>

      <section className="boardHeader">
        <div>
          <p className="eyebrow">Mission board</p>
          <h2>Active OODA missions</h2>
        </div>
        <p className="heroCopy">Each lane carries observe, orient, decide, act, evidence, and one next move.</p>
      </section>

      <section className="missionGrid">
        {missionCards.map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
      </section>
    </main>
  );
}
