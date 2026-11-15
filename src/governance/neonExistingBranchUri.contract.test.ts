import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const flow=readFileSync('.github/workflows/neon-pr-branches.yml','utf8');
const resolver=flow.split('      - name: Resolve private Neon preview connection on creation or reuse')[1]
 ?.split('      - name: Verify exact PR head')[0] || '';
const migration=flow.split('      - name: Execute added migrations on Neon preview')[1]
 ?.split('      - name: Verify FCR commerce preview schema when present')[0] || '';
const commerce=flow.split('      - name: Verify FCR commerce preview schema when present')[1]
 ?.split('      - name: Delete Neon Branch')[0] || '';

describe('Neon existing branch private URI admission',()=>{
  it('resolves exact existing branch URI and never defaults to production',()=>{
    expect(resolver).toContain('if [ -n "$EXISTING_BRANCH_ID" ]');
    expect(resolver).toContain('CREATED_DATABASE_URL:');
    expect(resolver).toContain('EXISTING_BRANCH_ID:');
    expect(resolver).toContain('--data-urlencode "branch_id=$EXISTING_BRANCH_ID"');
    expect(resolver).toContain('--data-urlencode "database_name=$database_name"');
    expect(resolver).toContain('--data-urlencode "role_name=$role_name"');
    expect(resolver).toContain('connection_uri');
    expect(resolver).not.toContain('|| true');
  });
  it('keeps private database URI in a mode-0600 runner-only file',()=>{
    expect(resolver).toContain('mktemp "$RUNNER_TEMP/neon-preview-uri.XXXXXXXX"');
    expect(resolver).toContain('chmod 600 "$uri_file"');
    expect(resolver).toContain('printf '+"'uri_file=%s\\n'"+' "$uri_file" >> "$GITHUB_OUTPUT"');
    expect(resolver).not.toMatch(/(?:connection|NEON_DB_URL)=.*>>\s*["']?\$GITHUB_(?:ENV|OUTPUT)/);
    expect(resolver).not.toContain('echo "$connection"');
  });
  it('uses the private file in both migration and commerce verification',()=>{
    expect(migration).toContain('NEON_URI_FILE:');
    expect(migration).toContain('test -f "$NEON_URI_FILE"');
    expect(migration).toContain('NEON_DB_URL="$(cat "$NEON_URI_FILE")"');
    expect(commerce).toContain('NEON_URI_FILE:');
    expect(commerce).toContain('NEON_DB_URL="$(cat "$NEON_URI_FILE")"');
    expect(migration).not.toContain('NEON_DB_URL:');
  });
});