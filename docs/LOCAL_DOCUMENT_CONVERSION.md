# Local Document to Markdown Capability

## Purpose

`local-document-to-markdown-v1` converts one founder-approved local file into Markdown evidence for Founder Control Room reasoning paths such as Mirror.

It is deliberately **not** a network-enabled MarkItDown MCP server and it does not run inside the Cloudflare Worker. The Python adapter runs locally, outside the hosted authority plane.

## Authority boundary

The adapter:

- accepts one input path relative to an explicit approved root;
- resolves the path and rejects traversal outside that root;
- rejects URI-shaped inputs including `http:`, `https:`, `file:`, and `data:` forms;
- constructs `MarkItDown(enable_plugins=False)`;
- calls `convert_local` only;
- supplies no Azure client, LLM client, remote URL fetcher, or MCP server;
- writes only the requested Markdown artifact and provenance receipt under the same approved root.

The converted Markdown is **derived evidence**. It is never founder approval, merge authority, deploy authority, publishing authority, or proof that the source claims are true.

## Install

```bash
python3 -m pip install -r requirements-markitdown.txt
```

The dependency file pins MarkItDown `0.1.7` and only the PDF/Word/PowerPoint/Excel extras needed for common local founder documents. It intentionally omits Azure, audio transcription, YouTube transcription, and plugins.

## Convert

```bash
python3 scripts/markitdown_local.py \
  --root ./approved-inputs \
  --input founder-evidence.html \
  --output .fcr/markitdown/founder-evidence.md \
  --receipt .fcr/markitdown/founder-evidence.receipt.json
```

## Receipt

The adapter emits `fcr/local-document-conversion@v1`.

The receipt binds:

- relative source path;
- source SHA-256 and byte count;
- Markdown SHA-256 and byte count;
- MarkItDown version;
- adapter version;
- conversion mode `convert_local`;
- plugins disabled;
- remote URI input disabled;
- a deterministic receipt digest;
- observation time.

Historical source/output hashes do not become execution authority. If either file changes, its digest changes and downstream evidence must be re-observed.

## Fixture proof

Committed fixture:

`founder-evidence.html`

Expected source SHA-256:

`d4e736c42bf0f0906c1290e8f6f1bba597dce846852cb8b35e43585b37863c1b`

Expected Markdown SHA-256:

`49921c008986450c1076a5247d6c520badae9e8bcdd28cdd662e2d7bb90ed050`

These hashes are also exposed in the founder-only Capability Workbench so the existing Playwright browser journey renders an inspectable provenance pair.

## Rollback

Before merge, revert the focused local-document-conversion commit on the existing carrier. No database migration, provider credential, external publication, deployment promotion, or remote authority change is required to roll back this capability.
