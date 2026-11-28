import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import { bindPlaywrightBrowserAction } from '../playwrightBrowserAction.js';
import type { BrowserActionPlan, BrowserActionObservation } from '../authorizedBrowserAction.js';

const target = 'https://example.test/fixture/1';
const plan: BrowserActionPlan = {
  intentId:'fixture-intent',actor:'fixture-founder',actionId:'fixture.confirm',
  providerId:'fixture',subjectRef:'fixture:record:1',idempotencyKey:'fixture-once',
  toolCallId:'fixture-call',expectedOutcomeFingerprint:'d'.repeat(64),
};
const observation: BrowserActionObservation = {
  providerId:plan.providerId,subjectRef:plan.subjectRef,sessionFingerprint:'a'.repeat(64),
  stateFingerprint:'b'.repeat(64),authenticated:true,mutationSupported:true,
  observedAt:'2026-11-28T19:00:00.000Z',
};
function fixture() {
  const click = vi.fn(async () => undefined);
  const count = vi.fn(async () => 1);
  const getByRole = vi.fn(() => ({click,count}));
  const url = vi.fn(() => target);
  const isClosed = vi.fn(() => false);
  const page = {url,isClosed,getByRole} as unknown as Page;
  const read = vi.fn(async () => observation);
  const driver = bindPlaywrightBrowserAction(page,{
    providerId:plan.providerId,subjectRef:plan.subjectRef,actionId:plan.actionId,
    exactUrl:target,buttonName:'Confirm fixture',
  },read);
  return {driver,click,count,getByRole,url,isClosed,read};
}

describe('bounded Playwright click driver', () => {
  it('uses only the registered exact accessible button on the bound page',async () => {
    const f=fixture();
    await f.driver.perform(plan,observation);
    expect(f.getByRole).toHaveBeenCalledWith('button',{name:'Confirm fixture',exact:true});
    expect(f.click).toHaveBeenCalledWith({timeout:5000});
    expect(f.click).toHaveBeenCalledTimes(1);
  });
  it('rejects an unregistered action or subject',async () => {
    const f=fixture();
    await expect(f.driver.perform({...plan,actionId:'other'},observation)).rejects.toThrow();
    await expect(f.driver.perform({...plan,subjectRef:'other'},observation)).rejects.toThrow();
    expect(f.click).not.toHaveBeenCalled();
  });
  it('rejects navigation drift before clicking',async () => {
    const f=fixture();
    f.url.mockReturnValueOnce('https://example.test/other');
    await expect(f.driver.perform(plan,observation)).rejects.toThrow();
    expect(f.click).not.toHaveBeenCalled();
  });
  it('rejects changed session or state on the final observation',async () => {
    const f=fixture();
    f.read.mockResolvedValueOnce({...observation,sessionFingerprint:'c'.repeat(64)});
    await expect(f.driver.perform(plan,observation)).rejects.toThrow();
    expect(f.click).not.toHaveBeenCalled();
  });
  it('rejects ambiguous matching buttons',async () => {
    const f=fixture();
    f.count.mockResolvedValueOnce(2);
    await expect(f.driver.perform(plan,observation)).rejects.toThrow();
    expect(f.click).not.toHaveBeenCalled();
  });
  it('never treats a completed click as outcome verification',async () => {
    const f=fixture();
    expect(await f.driver.perform(plan,observation)).toBeUndefined();
  });
});
