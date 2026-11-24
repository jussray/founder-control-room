import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_BYTES = 16 * 1024 * 1024;
const blocked = reason => ({ status: 'blocked', executionAllowed: false, reason });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Operator-only local adapter. The image digest and artifact digest must be
// supplied by trusted configuration, not by a public request or skill text.
export function runStaticScan(input, run = spawnSync) {
  if (!input || typeof input.archive !== 'string' || !/^skillspector@sha256:[a-f0-9]{64}$/.test(input.image ?? '') || !/^[a-f0-9]{64}$/.test(input.artifactSha256 ?? '')) return blocked('invalid-input');
  let directory, fd;
  try {
    fd = openSync(input.archive, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_BYTES) return blocked('invalid-artifact');
    const bytes = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = readSync(fd, bytes, count, bytes.length - count, null);
      if (!n) break;
      count += n;
    }
    const artifact = bytes.subarray(0, count);
    if (count !== stat.size || hash(artifact) !== input.artifactSha256) return blocked('artifact-mismatch');
    directory = mkdtempSync(join(tmpdir(), 'fcr-scan-'));
    writeFileSync(join(directory, 'skill.zip'), artifact, { mode: 0o644, flag: 'wx' });
    const args = ['run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534', '--pids-limit=128', '--memory=512m', '--cpus=1', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=128m', '--env=HOME=/tmp', '--mount', `type=bind,source=${join(directory, 'skill.zip')},target=/scan/skill.zip,readonly`, input.image, 'scan', '/scan/skill.zip', '--no-llm', '--format', 'json'];
    const result = run('/usr/bin/docker', args, { shell: false, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, env: { PATH: '/usr/bin:/bin' } });
    if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return blocked('scanner-failed');
    const report = JSON.parse(result.stdout);
    if (!report || typeof report !== 'object' || Array.isArray(report)) return blocked('invalid-report');
    return { status: 'report-received', executionAllowed: false, artifactSha256: input.artifactSha256, image: input.image, reportSha256: hash(result.stdout), report };
  } catch { return blocked('scanner-or-artifact-unavailable'); }
  finally {
    if (fd !== undefined) closeSync(fd);
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
}
