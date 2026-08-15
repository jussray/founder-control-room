import type { NextFunction, Request, Response } from 'express';
import {
  readEffectiveDesiredState,
  SwitchboardError,
} from '../../switchboard/store.js';

export function requirePortfolioSwitchOn(switchId: string) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const desiredState = await readEffectiveDesiredState(switchId);
      if (desiredState !== 'on') {
        return res.status(423).json({
          error: 'founder_switch_off',
          switchId,
          desiredState,
          detail: 'Founder Control Room blocked this execution because its governing switch is OFF.',
        });
      }
      return next();
    } catch (error) {
      const detail = error instanceof SwitchboardError
        ? error.message
        : 'Founder switch state could not be verified.';
      return res.status(503).json({
        error: 'switchboard_state_unavailable',
        switchId,
        detail,
      });
    }
  };
}
