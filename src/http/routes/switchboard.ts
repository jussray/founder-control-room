import { Router } from 'express';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import {
  readSwitchboard,
  readSwitchHistory,
  setFounderDesiredState,
  SwitchboardError,
} from '../../switchboard/store.js';

export const switchboardRouter = Router();

switchboardRouter.use(requireFounder);

function statusForSwitchboardError(error: SwitchboardError): number {
  if (error.code === 'unknown_switch') return 404;
  if (error.code === 'locked_off') return 409;
  if (error.code === 'read_failed' || error.code === 'history_failed') return 503;
  return 500;
}

switchboardRouter.get('/', async (_req: FounderRequest, res) => {
  try {
    const switches = await readSwitchboard();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      switches,
      generatedAt: new Date().toISOString(),
      semantics: {
        enforced: 'FCR blocks its own governed execution when this desired state is OFF.',
        observe_only: 'FCR records founder intent only. The external provider is not mutated by this switch.',
        locked_off: 'This capability cannot be enabled from the UI until its code-reviewed activation gate changes.',
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(error instanceof SwitchboardError ? statusForSwitchboardError(error) : 500).json({
      error: 'switchboard_read_failed',
      detail,
    });
  }
});

switchboardRouter.patch('/:switchId', async (req: FounderRequest, res) => {
  const desiredState = req.body?.desiredState;
  const reason = req.body?.reason;

  if (desiredState !== 'on' && desiredState !== 'off') {
    return res.status(400).json({
      error: 'invalid_desired_state',
      detail: 'desiredState must be "on" or "off".',
    });
  }
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return res.status(400).json({
      error: 'invalid_reason',
      detail: 'reason must be a string when supplied.',
    });
  }

  try {
    const switchState = await setFounderDesiredState({
      switchId: req.params.switchId,
      desiredState,
      reason: typeof reason === 'string' ? reason : null,
      actorEmail: req.founder?.email ?? 'unknown-founder',
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ switch: switchState });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const status = error instanceof SwitchboardError ? statusForSwitchboardError(error) : 500;
    return res.status(status).json({
      error: error instanceof SwitchboardError ? error.code : 'switchboard_write_failed',
      detail,
    });
  }
});

switchboardRouter.get('/:switchId/history', async (req: FounderRequest, res) => {
  try {
    const history = await readSwitchHistory(req.params.switchId);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ history });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const status = error instanceof SwitchboardError ? statusForSwitchboardError(error) : 500;
    return res.status(status).json({
      error: error instanceof SwitchboardError ? error.code : 'switchboard_history_failed',
      detail,
    });
  }
});
