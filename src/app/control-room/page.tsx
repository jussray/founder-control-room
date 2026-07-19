import { LaneCard } from '@/components/LaneCard';
import { MissionCard } from '@/components/MissionCard';
import { getLanes, getMissions } from '@/lib/queries';
import { laneSummaries, missionCards } from '@/lib/data';
import type { LaneSummary, MissionCard as MissionCardType } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function fetchLanes(): Promise<LaneSummary[]> {
  try {
    const rows = await getLanes();
    return rows.map((r) => ({
      id: r.id as LaneSummary['id'],
      label: r.label,
      description: '',
      status: r.status,
      risk: r.risk,
      metrics: []
    }));
  } catch {
    return laneSummaries; // fall back to static seed if DB not reachable
  }
}

async function fetchMissions(): Promise<MissionCardType[]> {
  try {
    const rows = await getMissions();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      lane: r.lane_id as MissionCardType['lane'],
      objective: r.objective,
      risk: r.risk,
      observe: r.ooda_steps?.filter((s) => s.phase === 'observe').map((s) => s.body) ?? [],
      orient:  r.ooda_steps?.filter((s) => s.phase === 'orient').map((s) => s.body) ?? [],
      decide:  r.ooda_steps?.filter((s) => s.phase === 'decide').map((s) => s.body) ?? [],
      act:     r.ooda_steps?.filter((s) => s.phase === 'act').map((s) => s.body) ?? [],
      evidence: r.evidence?.map((e) => ({
        id: e.id,
        label: e.label,
        kind: e.kind,
        verified: e.verified
      })) ?? [],
      nextAction: r.next_action ?? ''
    }));
  } catch {
    return missionCards; // fall back to static seed
  }
}

export default async function ControlRoomPage() {
  const [lanes, missions] = await Promise.all([fetchLanes(), fetchMissions()]);

  // Merge live DB lanes with static descriptions/metrics (static data has richer content)
  const enrichedLanes = lanes.map((live) => {
    const seed = laneSummaries.find((s) => s.id === live.id);
    return seed ? { ...seed, risk: live.risk, status: live.status } : live;
  });

  // Use static missions when DB has none yet (no missions seeded = fall back)
  const displayMissions = missions.length > 0 ? missions : missionCards;

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
        {enrichedLanes.map((lane) => (
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
        {displayMissions.map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
      </section>
    </main>
  );
}
