import { defineWorkflow, joinSession } from "@github/copilot-sdk/extension";

const SEAT_SCHEMA = {
  type: "object",
  required: ["seat", "findings", "risks", "unknowns", "recommendation"],
  properties: {
    seat: { type: "string" },
    findings: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
  },
};

const SYNTHESIS_SCHEMA = {
  type: "object",
  required: ["reality", "decision", "proof_needed", "risk", "rollback", "next_gate"],
  properties: {
    reality: { type: "array", items: { type: "string" } },
    decision: { type: "string" },
    proof_needed: { type: "array", items: { type: "string" } },
    risk: { type: "array", items: { type: "string" } },
    rollback: { type: "string" },
    next_gate: { type: "string" },
  },
};

const councilAgents = [
  {
    name: "goalfix-observer",
    displayName: "Goalfix Observer",
    description: "Separates supplied evidence into verified, inferred, unknown, and blocked claims.",
    tools: [],
    infer: false,
    prompt:
      "You are the observation seat for a founder-governed software workflow. Use only the supplied packet. Treat repository identity and evidence as claims supplied by the parent unless the packet contains direct proof. Never claim execution authority. Separate facts from inference and unknowns.",
  },
  {
    name: "goalfix-redteam",
    displayName: "Goalfix Red Team",
    description: "Attacks the premise, hidden failure modes, and false-green proof paths.",
    tools: [],
    infer: false,
    prompt:
      "You are the adversarial seat. Use only the supplied packet. Attack assumptions, stale proof, privilege expansion, fake-green tests, duplicate systems, and rollback gaps. Do not authorize changes and do not infer approval from consensus.",
  },
  {
    name: "goalfix-lindy",
    displayName: "Goalfix Lindy",
    description: "Tests whether the proposed direction is durable, minimal, reversible, and provider-portable.",
    tools: [],
    infer: false,
    prompt:
      "You are the durability seat. Prefer the smallest reversible change, existing architecture, provider portability, and boring long-lived contracts. Use only supplied evidence. Identify unnecessary novelty and parallel systems.",
  },
  {
    name: "goalfix-authority",
    displayName: "Goalfix Authority Auditor",
    description: "Checks authority, identity, proof, merge, deploy, publication, and provider-mutation boundaries.",
    tools: [],
    infer: false,
    prompt:
      "You are the authority auditor. Use only the supplied packet. Tool capability, model agreement, and workflow completion are never approval. Identify the exact next authority gate. Never grant merge, deploy, publication, credential, billing, database, auth, DNS, or provider-mutation permission.",
  },
  {
    name: "goalfix-synthesizer",
    displayName: "Goalfix Synthesizer",
    description: "Reconciles independent seats while preserving dissent and authority boundaries.",
    tools: [],
    infer: false,
    prompt:
      "You synthesize a founder-governed software decision from independent advisory seats. Preserve material dissent and unknowns. Consensus is not authority. Recommend one smallest safe next move and the proof required before it can advance.",
  },
];

const founderGoalfixGate = defineWorkflow({
  meta: {
    name: "founder-goalfix-gate",
    description:
      "Run a bounded, tool-less Council/Redteam gate for a founder software goal. " +
      "The parent must first supply the exact repository, branch, 40-character HEAD SHA, and evidence packet. " +
      "This workflow is advisory only and never grants execution, merge, deploy, publication, spend, or provider-mutation authority.",
    phases: [
      { title: "Intake" },
      { title: "Council" },
      { title: "Synthesis" },
      { title: "Authority gate" },
    ],
    argsSchema: {
      type: "object",
      required: ["goal", "repository", "branch", "headSha"],
      properties: {
        goal: { type: "string" },
        repository: { type: "string" },
        branch: { type: "string" },
        headSha: { type: "string" },
        requestedAction: { type: "string" },
        evidence: { type: "array", items: { type: "string" } },
      },
    },
    limits: {
      maxConcurrentSubagents: 4,
      maxTotalSubagents: 5,
    },
  },
  run: async (ctx) => {
    ctx.phase("Intake");

    const raw = ctx.args ?? {};
    const goal = typeof raw.goal === "string" ? raw.goal.trim() : "";
    const repository = typeof raw.repository === "string" ? raw.repository.trim() : "";
    const branch = typeof raw.branch === "string" ? raw.branch.trim() : "";
    const headSha = typeof raw.headSha === "string" ? raw.headSha.trim().toLowerCase() : "";
    const requestedAction =
      typeof raw.requestedAction === "string" && raw.requestedAction.trim()
        ? raw.requestedAction.trim()
        : "analyze";
    const evidence = Array.isArray(raw.evidence)
      ? raw.evidence.filter((item) => typeof item === "string" && item.trim()).slice(0, 40)
      : [];

    if (!goal || !repository || !branch || !/^[0-9a-f]{40}$/.test(headSha)) {
      return {
        schema: "juss/copilot-goalfix-gate@v1",
        status: "blocked",
        reason: "exact_identity_required",
        execution_authority: false,
        merge_permitted: false,
        deploy_permitted: false,
        next_gate:
          "Re-observe the authoritative repository, branch, and exact 40-character HEAD SHA, then rerun with the evidence packet.",
      };
    }

    const packet = await ctx.step("intake-v1", () => ({
      goal,
      repository,
      branch,
      headSha,
      requestedAction,
      evidence,
      identity_status: "SUPPLIED_NOT_VERIFIED_BY_WORKFLOW",
      authority_status: "NOT_GRANTED_BY_WORKFLOW",
    }));

    ctx.phase("Council");
    const seatSpecs = [
      ["observer", "goalfix-observer", "Classify the current reality and evidence quality."],
      ["redteam", "goalfix-redteam", "Attack the premise and likely failure paths."],
      ["lindy", "goalfix-lindy", "Assess durability, simplicity, reversibility, and provider portability."],
      ["authority", "goalfix-authority", "Audit authority and identify the next exact gate."],
    ];

    const seats = await ctx.parallel(
      seatSpecs.map(([seat, agent, task]) => () =>
        ctx.agent(
          [
            `Seat: ${seat}`,
            task,
            "Return only claims supportable from this supplied packet. Preserve unknowns.",
            JSON.stringify(packet),
          ].join("\n\n"),
          {
            label: `council:${seat}`,
            agent,
            schema: SEAT_SCHEMA,
          }
        )
      )
    );

    const completedSeats = seats.filter((value) => value !== null);
    if (completedSeats.length !== seatSpecs.length) {
      return {
        schema: "juss/copilot-goalfix-gate@v1",
        status: "blocked",
        reason: "incomplete_council",
        context: packet,
        council: completedSeats,
        execution_authority: false,
        merge_permitted: false,
        deploy_permitted: false,
        next_gate: "Inspect the failed workflow seat and rerun. Do not convert a partial Council into approval.",
      };
    }

    ctx.phase("Synthesis");
    const synthesis = await ctx.agent(
      [
        "Synthesize these independent seats into one founder-readable gate.",
        "Preserve disagreements and unknowns. Recommend exactly one smallest safe next move.",
        "Never grant execution, merge, deploy, publication, billing, credential, database, auth, DNS, or provider-mutation authority.",
        JSON.stringify({ packet, council: completedSeats }),
      ].join("\n\n"),
      {
        label: "council:synthesis",
        agent: "goalfix-synthesizer",
        schema: SYNTHESIS_SCHEMA,
      }
    );

    if (!synthesis) {
      return {
        schema: "juss/copilot-goalfix-gate@v1",
        status: "blocked",
        reason: "synthesis_failed",
        context: packet,
        council: completedSeats,
        execution_authority: false,
        merge_permitted: false,
        deploy_permitted: false,
        next_gate: "Inspect the synthesis failure and rerun before acting.",
      };
    }

    ctx.phase("Authority gate");
    return {
      schema: "juss/copilot-goalfix-gate@v1",
      status: "ready-for-founder-gate",
      context: packet,
      council: completedSeats,
      synthesis,
      authority: {
        execution_authority: false,
        merge_permitted: false,
        deploy_permitted: false,
        publication_permitted: false,
        provider_mutation_permitted: false,
        consensus_is_approval: false,
        rule:
          "Founder Control Room and repository-local authority contracts remain authoritative. Fresh exact-action approval and proof must be evaluated outside this advisory workflow.",
      },
      next_gate: synthesis.next_gate,
    };
  },
});

await joinSession({
  customAgents: councilAgents,
  workflows: [founderGoalfixGate],
});
