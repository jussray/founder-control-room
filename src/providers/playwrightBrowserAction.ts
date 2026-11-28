import type { Page } from 'playwright';
import type { BrowserActionDependencies, BrowserActionObservation, BrowserActionPlan } from './authorizedBrowserAction.js';

interface RegisteredBrowserAction {
  providerId: string;
  subjectRef: string;
  actionId: string;
  exactUrl: string;
  buttonName: string;
}

/**
 * Bind a single server-registered action to an already authenticated Playwright
 * page. No navigation, arbitrary selectors, scripts, session export or force
 * clicks. Registry construction and provider-specific readback remain trusted
 * server responsibilities. No provider action is registered by this module.
 */
export function bindPlaywrightBrowserAction(
  page: Page,
  registration: RegisteredBrowserAction,
  read: (plan: BrowserActionPlan) => Promise<BrowserActionObservation>,
): Pick<BrowserActionDependencies,'observe'|'perform'> {
  const target = Object.freeze({...registration});
  const url = new URL(target.exactUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.href !== target.exactUrl || !target.providerId || !target.subjectRef || !target.actionId
      || !target.buttonName.trim() || target.buttonName.length > 160) {
    throw new Error('INVALID_REGISTERED_BROWSER_ACTION');
  }
  let consumed = false;
  function assertTarget(plan: BrowserActionPlan): void {
    if (page.isClosed() || page.url() !== target.exactUrl || plan.providerId !== target.providerId
        || plan.subjectRef !== target.subjectRef || plan.actionId !== target.actionId) {
      throw new Error('BROWSER_TARGET_CHANGED');
    }
  }
  async function observe(plan: BrowserActionPlan): Promise<BrowserActionObservation> {
    assertTarget(plan);
    const current = await read(plan);
    assertTarget(plan);
    if (current.providerId !== target.providerId || current.subjectRef !== target.subjectRef
        || current.authenticated !== true || current.mutationSupported !== true
        || !/^[a-f0-9]{64}$/.test(current.sessionFingerprint)
        || !/^[a-f0-9]{64}$/.test(current.stateFingerprint)
        || !Number.isFinite(Date.parse(current.observedAt))) {
      throw new Error('BROWSER_STATE_UNVERIFIED');
    }
    return current;
  }
  return {
    observe,
    async perform(plan, precondition) {
      if (consumed) throw new Error('BROWSER_ACTION_ALREADY_ATTEMPTED');
      assertTarget(plan);
      const button = page.getByRole('button',{name:target.buttonName,exact:true});
      if (await button.count() !== 1) throw new Error('BROWSER_BUTTON_AMBIGUOUS');
      const current = await observe(plan);
      if (precondition.authenticated !== true || precondition.mutationSupported !== true
          || precondition.providerId !== current.providerId || precondition.subjectRef !== current.subjectRef
          || current.sessionFingerprint !== precondition.sessionFingerprint
          || current.stateFingerprint !== precondition.stateFingerprint
          || current.stateFingerprint === plan.expectedOutcomeFingerprint
          || Date.parse(current.observedAt) < Date.parse(precondition.observedAt)) {
        throw new Error('BROWSER_PRECONDITION_CHANGED');
      }
      assertTarget(plan);
      if (consumed) throw new Error('BROWSER_ACTION_ALREADY_ATTEMPTED');
      consumed = true;
      // Playwright strict locator resolution is the final ambiguity check.
      // Completion is not provider acceptance or independent outcome proof.
      await button.click({timeout:5000});
    },
  };
}
