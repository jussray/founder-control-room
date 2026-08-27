import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const routePath = path.resolve(process.cwd(), 'src/http/routes/n8nConveyor.ts');

describe('n8n conveyor HTTP route contract', () => {
  it('uses the canonical conveyor contract instead of a hard-coded version', () => {
    const source = fs.readFileSync(routePath, 'utf8');
    expect(source).toContain("import { FOUNDER_CONVEYOR_CONTRACT } from '../../lib/founderConveyorReceipt.js';");
    expect(source).toContain('contract: FOUNDER_CONVEYOR_CONTRACT');
    expect(source).not.toContain('founder-control-room/n8n-conveyor@v1');
    expect(source).not.toContain('founder-control-room/n8n-conveyor@v2');
  });

  it('resolves retained live proof without exposing provider credentials', () => {
    const source = fs.readFileSync(routePath, 'utf8');
    expect(source).toContain('const readiness = await resolveFounderConveyorReadiness();');
    expect(source).toContain('readiness,');
    expect(source).not.toContain('bearerToken:');
    expect(source).not.toContain('webhookUrl:');
  });
});
