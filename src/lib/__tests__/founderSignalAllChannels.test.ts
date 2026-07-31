import { describe, expect, it } from 'vitest';
import { FIRST_PARTY_SOCIAL_PLATFORMS } from '../firstPartySocialPublisher.js';
import { FOUNDER_SIGNAL_CHANNELS } from '../founderSignalAutomationPolicy.js';

describe('Founder Signal social channel inheritance', () => {
  it('keeps every first-party social platform inside the proof-gated automation policy', () => {
    for (const platform of FIRST_PARTY_SOCIAL_PLATFORMS) {
      expect(FOUNDER_SIGNAL_CHANNELS).toContain(platform);
    }
  });

  it('keeps investor email as a separate governed route', () => {
    expect(FOUNDER_SIGNAL_CHANNELS).toContain('gmail');
  });
});
