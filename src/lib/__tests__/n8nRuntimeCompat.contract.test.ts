import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = path.resolve(process.cwd(), '.github/workflows/n8n-runtime-compat.yml');
const scriptPath = path.resolve(process.cwd(), 'scripts/verify-n8n-runtime-compat.sh');
const fixturePath = path.resolve(process.cwd(), 'automation/n8n/compat/receipt-code.workflow.json');
const conveyorPath = path.resolve(process.cwd(), 'automation/n8n/founder-conveyor.workflow.json');
const EXPECTED_RECEIPT = 'fcr-conveyor-receipt-v3:4cbb74cbfdcc3937a91b3d25c1c25722c766d239bae42a2132851f0228eb90bf';
const EXPECTED_PLAN_HASH = 'ac26cec405a9f353cb76b6739744f2baa0e10142463a608126c7c55ef6bb260d';
const EXPECTED_IDEMPOTENCY = 'fcr-conveyor-v3:e78125f31ca297d6a2f1a2b0800901a971e0848b13546089e9908aeed8e0500a';

describe('n8n pinned runtime compatibility contract', () => {
  it('pins stable n8n 2.32.6 and never uses latest or wildcard module access', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain('docker.n8n.io/n8nio/n8n:2.32.6');
    expect(script).toContain('EXPECTED_VERSION="2.32.6"');
    expect(script).not.toContain('n8nio/n8n:latest');
    expect(script).toContain('NODE_FUNCTION_ALLOW_BUILTIN=crypto');
    expect(script).not.toContain('NODE_FUNCTION_ALLOW_BUILTIN=*');
  });

  it('keeps the production-shaped V3 conveyor directly importable with a stable workflow id', () => {
    const conveyor = JSON.parse(fs.readFileSync(conveyorPath, 'utf8'));
    expect(conveyor.id).toBe('fcrFounderConveyorV3');
    expect(conveyor.name).toBe('Founder Control Room Conveyor');
    expect(conveyor.active).toBe(false);
    const validationCode = conveyor.nodes.find((node: { name: string }) => node.name === 'Validate Capability Plan')?.parameters?.jsCode;
    expect(validationCode).toContain('founder-control-room/n8n-conveyor@v3');
    expect(validationCode).toContain('juss-v10/capability-plan@v1');
    expect(validationCode).toContain('chief-ai-machine');
  });

  it('imports the real V3 conveyor before executing the isolated semantic receipt fixture', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain('import:workflow --input=/workflows/founder-conveyor.workflow.json');
    expect(script).toContain('import:workflow --input=/workflows/compat/receipt-code.workflow.json');
    expect(script).toContain('execute --id=fcrN8nCompatV1');
    expect(script).toContain(EXPECTED_RECEIPT);
  });

  it('recomputes a real V10 plan, idempotency key, and receipt inside n8n', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    expect(fixture.id).toBe('fcrN8nCompatV1');
    expect(fixture.active).toBe(false);
    const code = fixture.nodes.find((node: { name: string }) => node.name === 'Canonical Receipt')?.parameters?.jsCode;
    expect(code).toContain("require('crypto')");
    expect(code).toContain("'juss-v10/capability-plan@v1'");
    expect(code).toContain("'chief-ai-machine'");
    expect(code).toContain('const planSeed = JSON.stringify');
    expect(code).toContain('capability plan mismatch');
    expect(code).toContain('idempotency mismatch');
    expect(code).toContain('receipt mismatch');
    expect(code).toContain(EXPECTED_PLAN_HASH);
    expect(code).toContain(EXPECTED_IDEMPOTENCY);
    expect(code).toContain(EXPECTED_RECEIPT);
    expect(code).toContain('fcr-conveyor-v3:');
    expect(code).toContain('registryHash');
  });

  it('runs the runtime proof on relevant PR/main changes and retains the receipt', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('bash scripts/verify-n8n-runtime-compat.sh');
    expect(workflow).toContain('n8n-runtime-compat-receipt.json');
    expect(workflow).toContain('actions/upload-artifact@v4');
  });
});
