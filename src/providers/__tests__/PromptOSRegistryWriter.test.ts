import { describe, expect, it } from 'vitest';
import { PromptOSRegistryWriter } from '../PromptOSRegistryWriter.js';

const approvedHead = 'a'.repeat(40);
const commitSha = 'b'.repeat(40);
const movedHead = 'c'.repeat(40);

function client(input: {
  initialHead?: string;
  raceBeforeUpdate?: boolean;
  ambiguousAfterApply?: boolean;
} = {}) {
  let head = input.initialHead ?? approvedHead;
  let branchReads = 0;
  return {
    repos: {
      async getBranch() {
        branchReads += 1;
        if (input.raceBeforeUpdate && branchReads > 1 && head === approvedHead) head = movedHead;
        return { data: { commit: { sha: head, commit: { tree: { sha: 'tree-base' } } } } };
      },
    },
    git: {
      async createBlob() { return { data: { sha: 'blob' } }; },
      async createTree() { return { data: { sha: 'tree-next' } }; },
      async createCommit(args: { parents: string[] }) {
        expect(args.parents).toEqual([approvedHead]);
        return { data: { sha: commitSha } };
      },
      async updateRef(args: { force: false; sha: string }) {
        expect(args.force).toBe(false);
        expect(args.sha).toBe(commitSha);
        if (input.raceBeforeUpdate) {
          head = movedHead;
          throw new Error('non-fast-forward');
        }
        head = commitSha;
        if (input.ambiguousAfterApply) throw new Error('connection reset after provider accepted update');
        return {};
      },
    },
  };
}

function write(writer: PromptOSRegistryWriter) {
  return writer.commitRegistryAtExpectedHead({
    expectedHeadSha: approvedHead,
    registryContent: '{"workflows":[]}\n',
    message: 'feat(workflows): approve test@1.0',
    authorName: 'Founder Control Room',
  });
}

describe('PromptOSRegistryWriter', () => {
  it('commits only from the exact approved pre-head and reads back the resulting head', async () => {
    const receipt = await write(new PromptOSRegistryWriter(client() as never));
    expect(receipt.expectedHeadSha).toBe(approvedHead);
    expect(receipt.commitSha).toBe(commitSha);
    expect(receipt.providerDisposition).toBe('COMMITTED');
  });

  it('fails before mutation when main already moved', async () => {
    await expect(write(new PromptOSRegistryWriter(client({ initialHead: movedHead }) as never)))
      .rejects.toThrow(/TARGET_MOVED/);
  });

  it('fails closed on a concurrent non-fast-forward race', async () => {
    await expect(write(new PromptOSRegistryWriter(client({ raceBeforeUpdate: true }) as never)))
      .rejects.toThrow(/NOT_APPLIED/);
  });

  it('reconciles an ambiguous response only when provider readback proves our exact commit won', async () => {
    const receipt = await write(new PromptOSRegistryWriter(client({ ambiguousAfterApply: true }) as never));
    expect(receipt.commitSha).toBe(commitSha);
    expect(receipt.providerDisposition).toBe('RECONCILED_AFTER_AMBIGUOUS_RESPONSE');
  });
});
