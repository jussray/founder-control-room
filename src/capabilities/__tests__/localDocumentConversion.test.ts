import { describe, expect, it } from 'vitest';
import {
  LOCAL_DOCUMENT_CONVERSION_CONTRACT,
  LOCAL_DOCUMENT_FIXTURE_RECEIPT,
  localDocumentToMarkdownCapability,
} from '../localDocumentConversion.js';

describe('local document to Markdown capability', () => {
  it('keeps local conversion read-only at the provider authority boundary', () => {
    expect(localDocumentToMarkdownCapability.id).toBe('local-document-to-markdown-v1');
    expect(localDocumentToMarkdownCapability.kind).toBe('Contract');
    expect(localDocumentToMarkdownCapability.environment).toContain('MarkItDown plugins disabled');
    expect(localDocumentToMarkdownCapability.environment).toContain('No Azure, LLM, remote URI, or MCP server configuration');
    expect(localDocumentToMarkdownCapability.proof).toContain('Adapter calls MarkItDown convert_local only');
    expect(localDocumentToMarkdownCapability.proof).toContain('URI-shaped inputs and approved-root path escapes fail closed');
    expect(localDocumentToMarkdownCapability.risk).toContain('derived evidence, never founder approval or execution authority');
  });

  it('pins the browser-visible fixture receipt hashes', () => {
    expect(LOCAL_DOCUMENT_FIXTURE_RECEIPT).toEqual({
      contract: LOCAL_DOCUMENT_CONVERSION_CONTRACT,
      engineVersion: '0.1.7',
      sourceSha256: 'd4e736c42bf0f0906c1290e8f6f1bba597dce846852cb8b35e43585b37863c1b',
      markdownSha256: '49921c008986450c1076a5247d6c520badae9e8bcdd28cdd662e2d7bb90ed050',
    });
    expect(localDocumentToMarkdownCapability.proof.join('\n')).toContain(
      `sha256:${LOCAL_DOCUMENT_FIXTURE_RECEIPT.sourceSha256}`,
    );
    expect(localDocumentToMarkdownCapability.proof.join('\n')).toContain(
      `sha256:${LOCAL_DOCUMENT_FIXTURE_RECEIPT.markdownSha256}`,
    );
  });
});
