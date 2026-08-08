import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = path.resolve(process.cwd(), '.github/workflows/n8n-runtime-compat.yml');
const scriptPath = path.resolve(process.cwd(), 'scripts/verify-n8n-runtime-compat.sh');
const fixturePath = path.resolve(process.cwd(), 'automation/n8n/compat/receipt-code.workflow.json');
const conveyorPath = path.resolve(process.cwd(), 'automation/n8n/founder-conveyor.workflow.json');

describe('n8n pinned runtime compatibility contract', () => {
  it('pins stable n8n 2.32.6 and never uses latest or wildcard module access', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain('docker.n8n.io/n8nio/n8n:2.32.6');
    expect(script).toContain('EXPECTED_VERSION="2.32.6"');
    expect(script).not.toContain('n8nio/n8n:latest');
    expect(script).toContain('NODE_FUNCTION_ALLOW_BUILTIN=crypto');
    expect(script).not.toContain('NODE_FUNCTION_ALLOW_BUILTIN=*');
  });

  it('keeps the production-shaped conveyor directly importable with a stable workflow id', () => {
    const conveyor = JSON.parse(fs.readFileSync(conveyorPath, 'utf8'));
    expect(conveyor.id).toBe('fcrFounderConveyorV2');
    expect(conveyor.name).toBe('Founder Control Room Conveyor');
    expect(conveyor.active).toBe(false);
  });

  it('imports the real conveyor before executing the isolated receipt fixture', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain('import:workflow --input=/workflows/founder-conveyor.workflow.json');
    expect(script).toContain('import:workflow --input=/workflows/compat/receipt-code.workflow.json');
    expect(script).toContain('execute --id=fcrN8nCompatV1');
    expect(script).toContain('fcr-conveyor-receipt-v2:1a86c0f18a9f22d0bb12fe59757f48028a113810527324ebcf1f89b90f256c8e');
  });

  it('executes crypto inside n8n and fails if the canonical receipt drifts', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    expect(fixture.id).toBe('fcrN8nCompatV1');
    expect(fixture.active).toBe(false);
    const code = fixture.nodes.find((node: { name: string }) => node.name === 'Canonical Receipt')?.parameters?.jsCode;
    expect(code).toContain("require('crypto')");
    expect(code).toContain("throw new Error(`receipt mismatch: ${receiptId}`)");
    expect(code).toContain('fcr-conveyor-receipt-v2:1a86c0f18a9f22d0bb12fe59757f48028a113810527324ebcf1f89b90f256c8e');
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
