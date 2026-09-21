import { Router, type Response } from 'express';
import { onboardingContentSecurityPolicy } from '../middleware/onboardingSecurity.js';
import { callbackHtml } from './onboardingAssets/callbackHtml.js';
import { callbackJs } from './onboardingAssets/callbackJs.js';
import { controlRoomCss } from './onboardingAssets/controlRoomCss.js';
import { controlRoomHtml } from './onboardingAssets/controlRoomHtml.js';
import { controlRoomJs } from './onboardingAssets/controlRoomJs.js';
import {
  workspaceAppJs,
  workspaceCallbackHtml,
  workspaceCallbackJs,
  workspaceControlRoomHtml,
} from './onboardingAssets/workspaceSurface.js';
import { workspaceProjectsRouter } from './workspaceProjects.js';

export const onboardingRouter = Router();

// Scoped to this router's own routes only. The dashboard SPA has a separate
// policy, while this identity and onboarding surface stays same-origin.
onboardingRouter.use(onboardingContentSecurityPolicy);

// Workspace-scoped founder onboarding is deliberately separate from legacy
// global FCR routes. The route owns its tenant filter and cannot borrow global
// project authority merely because a founder is authenticated.
onboardingRouter.use('/workspace', workspaceProjectsRouter);

function sendAsset(res: Response, type: string, body: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(body);
}

onboardingRouter.get('/', (_req, res) =>
  sendAsset(res, 'text/html; charset=utf-8', controlRoomHtml));
onboardingRouter.get(['/founder-onboarding', '/founder-onboarding/'], (_req, res) =>
  sendAsset(res, 'text/html; charset=utf-8', controlRoomHtml));
onboardingRouter.get(['/app', '/app/'], (_req, res) =>
  sendAsset(res, 'text/html; charset=utf-8', workspaceControlRoomHtml));
onboardingRouter.get('/founder-onboarding-script', (_req, res) =>
  sendAsset(res, 'text/javascript; charset=utf-8', controlRoomJs));
onboardingRouter.get('/assets/control-room.css', (_req, res) =>
  sendAsset(res, 'text/css; charset=utf-8', controlRoomCss));
onboardingRouter.get('/assets/control-room.js', (_req, res) =>
  sendAsset(res, 'text/javascript; charset=utf-8', controlRoomJs));
onboardingRouter.get('/assets/workspace-app.js', (_req, res) =>
  sendAsset(res, 'text/javascript; charset=utf-8', workspaceAppJs));
onboardingRouter.get('/assets/auth-callback.js', (_req, res) =>
  sendAsset(res, 'text/javascript; charset=utf-8', callbackJs));
onboardingRouter.get('/assets/workspace-auth-callback.js', (_req, res) =>
  sendAsset(res, 'text/javascript; charset=utf-8', workspaceCallbackJs));

export function founderCallbackHtml(): string {
  return callbackHtml;
}

export function workspaceFounderCallbackHtml(): string {
  return workspaceCallbackHtml;
}
