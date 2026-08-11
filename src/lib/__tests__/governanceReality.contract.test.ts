import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

describe('Founder Control Room governance reality contract', () => {
  it('keeps the canonical master spec aligned with the existing browser and guarded execution surfaces', () => {
    const spec = read('docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md');

    expect(spec).toContain('Reality refresh: 2026-08-11');
    expect(spec).toContain('Target branch: `main` through focused branches and pull requests');
    expect(spec).toContain('a founder-facing browser UI under `public/control-room/`');
    expect(spec).toContain('Guarded execution existing in the repository does not create blanket mutation authority.');
    expect(spec).not.toContain('The repository currently states there is no web frontend.');
  });

  it('keeps the canonical master spec aligned with the V10 Chief/FCR/n8n execution boundary', () => {
    const spec = read('docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md');
    const pairContract = read('config/founder-chief-pair.contract.json');
    const workflow = read('automation/n8n/founder-conveyor.workflow.json');

    expect(spec).toContain('Version: 1.2');
    expect(spec).toContain('juss-v10/capability-plan@v1');
    expect(spec).toContain('founder-control-room/n8n-conveyor@v3');
    expect(spec).toContain('### 4.3 n8n execution plane owns');
    expect(spec).toContain('A successful n8n webhook response or acceptance receipt proves dispatch acceptance only.');
    expect(spec).toContain('dispatch receipt');
    expect(spec).toContain('execution receipt');
    expect(spec).toContain('outcome receipt');
    expect(spec).toContain('Zapier is a specialized or transitional adapter');
    expect(spec).not.toContain('-> Provider adapters perform bounded work\n-> Evidence returns to the Control Room');

    expect(pairContract).toContain('"capabilitySelector": "chief-ai-machine"');
    expect(pairContract).toContain('"conveyorContract": "founder-control-room/n8n-conveyor@v3"');
    expect(workflow).toContain('founder-control-room/n8n-conveyor@v3');
    expect(workflow).toContain('capability selection must be owned by Chief AI Machine');
  });

  it('keeps ChatGPT and Cursor from regressing to the obsolete read-only-dashboard contract', () => {
    const chatgpt = read('CHATGPT.md');
    const cursor = read('.cursor/rules');

    for (const contract of [chatgpt, cursor]) {
      expect(contract).toContain('public/control-room/');
      expect(contract.toLowerCase()).toContain('guarded execution');
      expect(contract).not.toContain('Dashboard is read-only and status-only');
      expect(contract).not.toContain('Dashboard is read-only — no execution, mutations, or secrets storage.');
    }
  });
});
