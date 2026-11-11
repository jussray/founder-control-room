import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  FEDERATED_RELAY_MEMBER_REPOSITORIES,
} from '../../founder-os-lab/federatedRelayV3.js';

const topologySource = readFileSync(
  new URL('../../../public/control-room/os-topology.js', import.meta.url),
  'utf8',
);

const relayMembers = Object.keys(FEDERATED_RELAY_MEMBER_REPOSITORIES);

describe('Founder OS topology contract', () => {
  it('keeps every signed federated relay member represented in the founder OS spine', () => {
    expect(relayMembers).toEqual([
      'founder-control-room',
      'chief-ai-machine',
      'solcontinuity',
      'promptos',
    ]);

    for (const member of relayMembers) {
      expect(topologySource).toContain(`id: '${member}'`);
    }
  });

  it('keeps FCR as the only authority owner and never promotes a handoff into authority', () => {
    expect(topologySource).toContain("authorityOwner: 'founder-control-room'");
    expect(topologySource).toContain('executionAuthorized: false');
    expect(topologySource).toContain('authorityTransferred: false');
    expect(topologySource).not.toMatch(/authorityTransfer:\s*true/);
    expect(topologySource).toContain('recipientVerificationRequired: true');
  });

  it('keeps L99 inside Chief rather than manufacturing a second control plane', () => {
    expect(topologySource).toContain('L99 stays a Chief operating method, not a rival control plane.');
    expect(topologySource).not.toMatch(/id:\s*['"]l99['"]/);
  });

  it('connects governed execution to project shells and returns evidence before continuity', () => {
    expect(topologySource).toContain("from: 'founder-control-room', to: 'project-runtime'");
    expect(topologySource).toContain("from: 'project-runtime', to: 'evidence-trust'");
    expect(topologySource).toContain("from: 'evidence-trust', to: 'founder-control-room'");
    expect(topologySource).toContain("from: 'founder-control-room', to: 'solcontinuity'");
    expect(topologySource).toContain("from: 'solcontinuity', to: 'ultrathink'");
  });
});