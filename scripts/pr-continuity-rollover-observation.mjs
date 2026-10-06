import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA, rolloverMode } from './pr-continuity.mjs';

export const ROLLOVER_DEBT_PREFIX = 'ROLLOVER_BLOCKED:';

const artifactPath = () => process.env.ARTIFACT_PATH || 'artifacts/pr-continuity.json';

export function isRecordedPrDebt(error) {
  return String(error?.message || error || '').startsWith(ROLLOVER_DEBT_PREFIX);
}

export function markBlockedObservation(receipt) {
  if (
    !receipt
    || receipt.schema !== SCHEMA
    || receipt.mode !== 'rollover'
    || !Number.isInteger(receipt.blockedCount)
    || receipt.blockedCount < 1
  ) {
    throw new Error('ROLLOVER_DEBT_RECEIPT_INVALID');
  }

  return {
    ...receipt,
    rolloverState: 'BLOCKED_PR_DEBT',
    observationStatus: 'RECORDED',
    blockingScope: 'open-pr-graph',
    prMergeContinuityClear: false,
  };
}

function persistBlockedObservation() {
  const target = path.resolve(artifactPath());
  const receipt = JSON.parse(fs.readFileSync(target, 'utf8'));
  const next = markBlockedObservation(receipt);
  fs.writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function runRolloverObservation() {
  try {
    await rolloverMode();
    return { rolloverState: 'CLEAR', observationStatus: 'RECORDED' };
  } catch (error) {
    if (!isRecordedPrDebt(error)) throw error;
    const receipt = persistBlockedObservation();
    console.log(JSON.stringify({
      schema: SCHEMA,
      mode: 'rollover-observation',
      status: 'RECORDED_BLOCKED_PR_DEBT',
      blockedCount: receipt.blockedCount,
      blockedByState: receipt.blockedByState,
    }));
    return receipt;
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runRolloverObservation().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
