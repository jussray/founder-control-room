/**
 * FCR's immutable, locally executable source snapshot of the Council validators.
 * Snapshot pin: jussray/ULTRATHINK-COUNCIL@223ad28ce4b0831912a3cd9b9c49541d559c7683.
 * Hashes checked in CI. Do not substitute an external URL/runtime import.
 */
import {verifyCouncil,verifyCourt} from './council-bus-v1/council.mjs';
import {verifyCouncilBusHandoff} from './council-bus-v1/busHandoff.mjs';
import {runEmbeddedCouncilBus,type BusPorts} from './council-bus-v1/councilBusRuntime.mjs';
import type {CouncilPacket,CourtPacket} from './council-bus-v1/council.mjs';
import type {HandoffPacket} from './council-bus-v1/busHandoff.mjs';

export type PinnedCouncilBundle={council:CouncilPacket;court:CourtPacket;handoff:HandoffPacket};

/** Locally verifies all fields and deterministic Court re-adjudication. */
export function verifyPinnedCouncilBundle(bundle:PinnedCouncilBundle):true {
  verifyCouncil(bundle.council);
  verifyCourt(bundle.council,bundle.court);
  verifyCouncilBusHandoff(bundle);
  return true;
}

/** Actual Council code path; owning app must supply all authoritative ports. */
export async function dispatchPinnedCouncilBus(input:{
  bundle:PinnedCouncilBundle;caller:unknown;ports:BusPorts;signal?:AbortSignal;
}) {
  verifyPinnedCouncilBundle(input.bundle);
  return runEmbeddedCouncilBus({
    council:input.bundle.council,court:input.bundle.court,
    handoff:input.bundle.handoff,caller:input.caller,ports:input.ports,
    ...(input.signal?{signal:input.signal}:{})
  });
}
