import type { LaneSummary, MissionCard } from '@/lib/types';

export const laneSummaries: LaneSummary[] = [
  {
    id: 'founder-os',
    label: "Juss Founder OS",
    description: 'Operating contract embedded inside Founder Control Room. OODA, red-team, evidence-before-green, non-destructive, brand/IP protected.',
    status: 'Embedded as control policy',
    risk: 'green',
    metrics: [
      { label: 'Mode', value: 'ULTRATHINK' },
      { label: 'Deletion posture', value: 'Blocked by default' },
      { label: 'Proof rule', value: 'Evidence before green' }
    ]
  },
  {
    id: 'sekret-bip',
    label: "Se'kret Bip",
    description: 'Teen-facing emotional-wellness lane. Preview + waitlist funnel with privacy-first controls. The relationship survives preview closure.',
    status: 'Preview lane active',
    risk: 'yellow',
    metrics: [
      { label: 'State routing', value: 'Preview / waitlist' },
      { label: 'Safety posture', value: 'Teen privacy hardened' },
      { label: 'Data policy', value: 'Synthetic in demos' }
    ]
  },
  {
    id: 'partner-project',
    label: 'Their Project',
    description: 'External or partner initiative merged as a governed lane inside the same Founder Control Room — same OS rules, same evidence requirements.',
    status: 'Merge lane ready',
    risk: 'yellow',
    metrics: [
      { label: 'Integration mode', value: 'Lane inside control room' },
      { label: 'Governance', value: 'Same OS rules' },
      { label: 'Next proof', value: 'Real path demo' }
    ]
  }
];

export const missionCards: MissionCard[] = [
  {
    id: 'mission-001',
    title: 'Embed Founder OS inside Control Room',
    lane: 'founder-os',
    objective: 'Make operating rules visible in the live command surface instead of leaving them as a detached document.',
    risk: 'green',
    observe: [
      'Control Room is the command center for observing, testing, scoring, and mission creation.',
      'Founder OS and Bip should live inside Founder Control Room as governed lanes.'
    ],
    orient: [
      'Keep control policy inside the same runtime surface used during decisions.',
      'Avoid a split between repo docs and live execution context.'
    ],
    decide: [
      'Render Founder OS as an always-visible lane with policy checkpoints.',
      'Keep execution reversible and evidence-backed.'
    ],
    act: [
      'Expose policy rules, risk state, and next actions in one board.',
      'Route all lanes through the same mission contract.'
    ],
    evidence: [
      { id: 'e1', label: 'Mission board shows Founder OS lane', kind: 'screenshot', verified: true },
      { id: 'e2', label: 'Policy checkpoints rendered in UI', kind: 'note', verified: true }
    ],
    nextAction: 'Wire real repo events into the Founder OS lane via GitHub webhook.'
  },
  {
    id: 'mission-002',
    title: "Run Se'kret Bip as governed lane",
    lane: 'sekret-bip',
    objective: 'Show preview, waitlist, and safety posture without exposing sensitive teen data or internal prompts.',
    risk: 'yellow',
    observe: [
      "Se'kret Bip is a teen-facing emotional wellness lane.",
      'The waiting-list home must remain alive after preview closure.'
    ],
    orient: [
      'Protect privacy and brand while still proving momentum.',
      'Demo synthetic state only — no real user content.'
    ],
    decide: [
      'Show funnel state, safety status, and build phase.',
      'Do not expose live user content or private operating logic.'
    ],
    act: [
      'Display current phase, routing state, and approval flags.',
      'Keep the relationship view visible after closure.'
    ],
    evidence: [
      { id: 'e3', label: 'Synthetic waitlist metrics shown', kind: 'metric', verified: true },
      { id: 'e4', label: 'Teen privacy constraint banner present', kind: 'screenshot', verified: true }
    ],
    nextAction: 'Replace synthetic counters with safe aggregate metrics from Supabase.'
  },
  {
    id: 'mission-003',
    title: 'Merge their project as lane',
    lane: 'partner-project',
    objective: 'Treat the external project as another governed lane inside the same Founder Control Room.',
    risk: 'yellow',
    observe: [
      'The meeting is about their project and merging the two.',
      'Need code that matches existing repos, not documents.'
    ],
    orient: [
      'The external project plugs into the same command surface.',
      'One system with multiple lanes instead of three disconnected demos.'
    ],
    decide: [
      'Create a partner-project lane with OODA checkpoints.',
      'Leave repo adapter wiring as the next reversible step.'
    ],
    act: [
      'Render a lane summary and mission card for the partner project.',
      'Expose an event ingestion endpoint for later repo integration.'
    ],
    evidence: [
      { id: 'e5', label: 'Partner project lane rendered in dashboard', kind: 'screenshot', verified: true },
      { id: 'e6', label: 'Event endpoint schema defined and validated', kind: 'trace', verified: true }
    ],
    nextAction: 'Map the partner repository webhook payload into normalized event records.'
  }
];
