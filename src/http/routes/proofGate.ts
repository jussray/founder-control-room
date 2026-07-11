/**
 * Proof Gate HTTP route.
 *
 * POST /proof-gate/:missionId
 *   Submit evidence for a gate.  Runs the gate engine, persists the result,
 *   and returns {status, allFailures, resultId}.
 *
 *   Body: {
 *     gateId: string;           // e.g. "merge", "deploy"
 *     approvedBy?: string;      // founder reference, required for approval gates
 *     evidence: ProofEvidence;
 *   }
 *
 * GET /proof-gate/:missionId/:gateId
 *   Returns the most recent PASSING result, or 404 if none exists.
 *   Use this as a pre-check before calling POST /approvals/:missionId/execute.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { requireFounder } from '../middleware/requireFounder.js';
import type { FounderRequest } from '../middleware/requireFounder.js';
import { runProofGate } from '../../proof-gate/gate.js';
import { persistProofResult, getLatestPassingGate } from '../../proof-gate/persist.js';
import type { ProofEvidence } from '../../proof-gate/types.js';

export const proofGateRouter = Router();

proofGateRouter.use(requireFounder);

// ── POST /proof-gate/:missionId ───────────────────────────────────────────────
proofGateRouter.post(
  '/:missionId',
  async (req: FounderRequest, res: Response) => {
    const { missionId } = req.params as { missionId: string };
    const { gateId, approvedBy, evidence } = req.body as {
      gateId: string;
      approvedBy?: string;
      evidence: ProofEvidence;
    };

    if (!gateId) {
      return res.status(400).json({ error: '`gateId` is required.' });
    }

    if (!evidence) {
      return res.status(400).json({ error: '`evidence` is required.' });
    }

    const result = runProofGate(gateId, evidence, approvedBy);

    let resultId: string | null = null;
    try {
      resultId = await persistProofResult(missionId, result);
    } catch (err) {
      // Persistence failure is logged but should not silently pass the gate
      return res.status(500).json({
        error: 'Failed to persist proof gate result.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    return res.status(result.status === 'pass' ? 200 : 422).json({
      status: result.status,
      allFailures: result.allFailures,
      resultId,
      timestamp: result.timestamp,
    });
  },
);

// ── GET /proof-gate/:missionId/:gateId ────────────────────────────────────────
proofGateRouter.get(
  '/:missionId/:gateId',
  async (req: FounderRequest, res: Response) => {
    const { missionId, gateId } = req.params as { missionId: string; gateId: string };

    let gate;
    try {
      gate = await getLatestPassingGate(missionId, gateId);
    } catch (err) {
      return res.status(500).json({
        error: 'Failed to query proof gate results.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    if (!gate) {
      return res.status(404).json({
        error: `No passing proof gate found for mission '${missionId}' gateId '${gateId}'.`,
        blocked: true,
      });
    }

    return res.json({ gate });
  },
);
