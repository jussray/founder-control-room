import { Router, type Response } from 'express';
import { onboardingContentSecurityPolicy } from '../middleware/onboardingSecurity.js';
import { callbackHtml } from './onboardingAssets/callbackHtml.js';
import { callbackJs } from './onboardingAssets/callbackJs.js';
import { controlRoomCss } from './onboardingAssets/controlRoomCss.js';
import { controlRoomHtml } from './onboardingAssets/controlRoomHtml.js';
import { controlRoomJs } from './onboardingAssets/controlRoomJs.js';

export const onboardingRouter = Router();

// Scoped to this router's own routes only. The dashboard SPA has a separate
// policy, while this identity and onboarding surface stays same-origin.
onboardingRouter.use(onboardingContentSecurityPolicy);

function sendAsset(res: Response, type: string, body: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(body);
}

onboardingRouter.get('/', (_req, res) =>
  sendAsset(res, 'text/html; charset=utf-8', controlRoomHtml));
onboardingRouter.get('/assets/control-room.css', (_req, res) =>
  sendAsset(res, 'text/css; charset=utf-8', controlRoomCss));
onboardingRouter.get('/assets/control-room.js', (_req, res) =>
  sendAsset(res, 'text/javascript; charset=utf-8', controlRoomJs));
onboardingRouter.get('/assets/auth-callback.js', (_req, res) =>
  sendAsset(res, 'text/javascript; charset=utf-8', callbackJs));

export function founderCallbackHtml(): string {
  return callbackHtml;
}
