const EVENT = Object.freeze({
  bridgeRequested: 'founder_signal_engine_bridge_requested',
  bridgeAccepted: 'founder_signal_engine_bridge_accepted',
  bridgeFailed: 'founder_signal_engine_bridge_failed',
  bridgeRejected: 'founder_signal_engine_bridge_rejected',
  openAiProof: new Set([
    'founder_signal_engine_openai_output_recorded',
    'founder_signal_engine_openai_proof_recorded',
  ]),
  bufferProof: new Set([
    'founder_signal_engine_buffer_artifact_recorded',
    'founder_signal_engine_buffer_proof_recorded',
  ]),
  hubSpotProof: new Set([
    'founder_signal_engine_hubspot_association_recorded',
    'founder_signal_engine_hubspot_proof_recorded',
  ]),
  finalProof: new Set([
    'founder_signal_engine_end_to_end_proof_complete',
    'founder_signal_engine_proof_complete',
  ]),
});

export const DEFAULT_SOURCE = Object.freeze({
  repository: 'jussray/Sekret-Bip',
  pr: 599,
  commit: 'f4573d360a8fea99b301f33a2a21192525725f7b',
  dealId: '337185466050',
  keyReference: 'zapier-founder-signal-engine',
});

function metadataOf(event) {
  return event && typeof event.metadata === 'object' && event.metadata ? event.metadata : {};
}

function eventType(event) {
  return String(event?.event_type ?? '').toLowerCase();
}

function invocationIdOf(event) {
  const value = metadataOf(event).invocationId ?? metadataOf(event).invocation_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function latestDate(events) {
  return events
    .map((event) => event?.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

function latestInvocation(events) {
  const ordered = [...events].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );
  const invocationId = ordered.map(invocationIdOf).find(Boolean) ?? null;
  return {
    invocationId,
    events: invocationId
      ? ordered.filter((event) => invocationIdOf(event) === invocationId)
      : [],
  };
}

function explicitProof(events, eventTypes, metadataFlag) {
  return events.find((event) => {
    const metadata = metadataOf(event);
    return eventTypes.has(eventType(event)) || metadata[metadataFlag] === true;
  }) ?? null;
}

function stage(status, evidence, observedAt, action) {
  return { status, evidence, observedAt, action };
}

export function buildFounderSignalModel(activity, source = DEFAULT_SOURCE) {
  const signalEvents = Array.isArray(activity)
    ? activity.filter((event) => eventType(event).startsWith('founder_signal_engine_'))
    : [];
  const latest = latestInvocation(signalEvents);
  const events = latest.events;

  const requested = events.find((event) => eventType(event) === EVENT.bridgeRequested) ?? null;
  const accepted = events.find((event) => eventType(event) === EVENT.bridgeAccepted) ?? null;
  const failed = events.find((event) =>
    [EVENT.bridgeFailed, EVENT.bridgeRejected].includes(eventType(event)),
  ) ?? null;

  const acceptedMetadata = metadataOf(accepted);
  const runId = typeof acceptedMetadata.zapierRunId === 'string' && acceptedMetadata.zapierRunId.trim()
    ? acceptedMetadata.zapierRunId.trim()
    : typeof acceptedMetadata.zapier_run_id === 'string' && acceptedMetadata.zapier_run_id.trim()
      ? acceptedMetadata.zapier_run_id.trim()
      : null;

  const openAiProof = explicitProof(events, EVENT.openAiProof, 'openAiArtifactVerified');
  const bufferProof = explicitProof(events, EVENT.bufferProof, 'bufferArtifactVerified');
  const hubSpotProof = explicitProof(events, EVENT.hubSpotProof, 'hubSpotEvidenceVerified');
  const finalProof = explicitProof(events, EVENT.finalProof, 'endToEndProofComplete');

  const stages = [
    {
      id: 'github',
      label: 'GitHub',
      ...stage(
        'complete',
        `PR #${source.pr} merged at ${source.commit}`,
        null,
        'Preserve the exact source PR and commit.',
      ),
    },
    {
      id: 'bridge',
      label: 'Secure bridge',
      ...stage(
        requested || accepted || failed ? 'complete' : 'pending',
        requested || accepted || failed
          ? `Audited invocation: ${latest.invocationId}`
          : 'No audited bridge invocation found.',
        latestDate(events),
        requested || accepted || failed
          ? 'Keep the raw key sealed and inspect the provider receipt.'
          : 'Invoke through the approved @OpenAI Developers bridge path.',
      ),
    },
    {
      id: 'zapier',
      label: 'Zapier',
      ...(failed
        ? stage(
            'blocked',
            String(metadataOf(failed).failure ?? eventType(failed)),
            failed.created_at ?? null,
            'Repair the configured Zapier hook or bridge path, then use a new invocation ID.',
          )
        : accepted
          ? stage(
              runId ? 'complete' : 'pending',
              runId ? `Run ID: ${runId}` : 'Bridge accepted, but no Zapier run ID was returned.',
              accepted.created_at ?? null,
              runId
                ? 'Inspect that exact run and capture downstream artifacts.'
                : 'Locate the invocation in Zapier history and record its run ID.',
            )
          : stage(
              'pending',
              requested
                ? `Invocation requested: ${latest.invocationId}`
                : 'No Zapier provider receipt recorded.',
              requested?.created_at ?? null,
              requested
                ? 'Wait for or inspect the provider result.'
                : 'Run the approved bridge invocation.',
            )),
    },
    {
      id: 'openai',
      label: 'OpenAI 5W1H',
      ...(openAiProof
        ? stage(
            'complete',
            'Verified OpenAI output artifact recorded.',
            openAiProof.created_at ?? null,
            'Review platform-specific copy and the send decision.',
          )
        : stage(
            'pending',
            'No explicit OpenAI output artifact recorded.',
            null,
            'Capture the 5W1H result from the matching Zapier run.',
          )),
    },
    {
      id: 'buffer',
      label: 'Buffer',
      ...(bufferProof
        ? stage(
            'complete',
            'Verified Buffer artifact recorded.',
            bufferProof.created_at ?? null,
            'Confirm draft, queue, schedule, or publish state.',
          )
        : stage(
            'pending',
            'No explicit Buffer artifact recorded.',
            null,
            'Capture the Buffer result for the matching run.',
          )),
    },
    {
      id: 'hubspot',
      label: 'HubSpot',
      ...(hubSpotProof
        ? stage(
            'complete',
            `Verified deal association recorded for ${source.dealId}.`,
            hubSpotProof.created_at ?? null,
            'Inspect the associated task or note.',
          )
        : stage(
            'pending',
            'No explicit run-specific HubSpot evidence recorded.',
            null,
            `Record a deal-associated proof artifact for ${source.dealId} after approval.`,
          )),
    },
    {
      id: 'control-room',
      label: 'Control Room',
      ...(finalProof
        ? stage(
            'complete',
            'End-to-end proof marked complete.',
            finalProof.created_at ?? null,
            'Inspect every linked artifact before closing Day 3.',
          )
        : stage(
            'pending',
            signalEvents.length
              ? `${signalEvents.length} audit event(s) retained; final proof is still open.`
              : 'No Founder Signal Engine audit events found.',
            latestDate(signalEvents),
            'Keep Day 3 open until every downstream artifact is verified.',
          )),
    },
  ];

  const firstBlocker = stages.find((item) => item.status === 'blocked')
    ?? stages.find((item) => item.status !== 'complete')
    ?? null;
  const complete = stages.every((item) => item.status === 'complete');

  return {
    source,
    invocationId: latest.invocationId,
    runId,
    stages,
    firstBlocker,
    complete,
    signalEventCount: signalEvents.length,
  };
}
