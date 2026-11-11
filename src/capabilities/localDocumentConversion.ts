import type { Capability } from './workbenchRegistry.js';

export const LOCAL_DOCUMENT_CONVERSION_CONTRACT = 'fcr/local-document-conversion@v1';

export const LOCAL_DOCUMENT_FIXTURE_RECEIPT = Object.freeze({
  contract: LOCAL_DOCUMENT_CONVERSION_CONTRACT,
  engineVersion: '0.1.7',
  sourceSha256: 'd4e736c42bf0f0906c1290e8f6f1bba597dce846852cb8b35e43585b37863c1b',
  markdownSha256: '49921c008986450c1076a5247d6c520badae9e8bcdd28cdd662e2d7bb90ed050',
});

export const localDocumentToMarkdownCapability: Capability = {
  id: 'local-document-to-markdown-v1',
  kind: 'Contract',
  category: 'integrations',
  score: 95,
  summary: 'Convert one approved local file into Markdown evidence with a hash-bound provenance receipt.',
  purpose: 'Normalize local founder documents for Mirror and other FCR reasoning paths without granting network fetch, provider mutation, or execution authority.',
  inputs: [
    ['root', 'local directory', 'Explicit approved filesystem root'],
    ['input', 'relative path', 'One regular file contained by the approved root'],
    ['output', 'relative path', 'Local Markdown artifact path inside the approved root'],
    ['receipt', 'relative path', 'Local provenance receipt path inside the approved root'],
  ],
  environment: [
    'Python >=3.10',
    'markitdown 0.1.7 with only local document extras',
    'MarkItDown plugins disabled',
    'No Azure, LLM, remote URI, or MCP server configuration',
  ],
  proof: [
    `Receipt schema: ${LOCAL_DOCUMENT_CONVERSION_CONTRACT}`,
    `Fixture source sha256:${LOCAL_DOCUMENT_FIXTURE_RECEIPT.sourceSha256}`,
    `Fixture markdown sha256:${LOCAL_DOCUMENT_FIXTURE_RECEIPT.markdownSha256}`,
    'Adapter calls MarkItDown convert_local only',
    'URI-shaped inputs and approved-root path escapes fail closed',
  ],
  risk: 'Local artifact conversion only. The adapter may read only one relative file under the approved root and may write only the requested Markdown and receipt paths under that same root. Converted Markdown is derived evidence, never founder approval or execution authority.',
  implementation: `pip install -r requirements-markitdown.txt
python3 scripts/markitdown_local.py \
  --root ./approved-inputs \
  --input founder-evidence.html \
  --output .fcr/markitdown/founder-evidence.md \
  --receipt .fcr/markitdown/founder-evidence.receipt.json`,
};
