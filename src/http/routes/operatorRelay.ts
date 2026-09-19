import { Router } from 'express';
import type { OperatorRelayAdapters } from '../../lib/operatorRelayDispatch.js';
import { dispatchOperatorRelay, OperatorRelayDispatchError } from '../../lib/operatorRelayDispatch.js';
import type { OperatorRelayRequestV1 } from '../../lib/operatorRelay.js';

export function createOperatorRelayRouter(adapters: OperatorRelayAdapters): Router {
  const router = Router();

  router.post('/api/operator-relay', async (req, res) => {
    try {
      const response = await dispatchOperatorRelay(req.body as OperatorRelayRequestV1, adapters);
      return res.status(200).set('Cache-Control', 'no-store').json(response);
    } catch (error) {
      if (error instanceof OperatorRelayDispatchError) {
        const status = error.code === 'relay_target_unavailable' ? 503 : 400;
        return res.status(status).set('Cache-Control', 'no-store').json({
          error: error.message,
          code: error.code,
        });
      }
      return res.status(500).set('Cache-Control', 'no-store').json({
        error: 'Operator relay failed.',
        code: 'relay_internal_failure',
      });
    }
  });

  return router;
}
