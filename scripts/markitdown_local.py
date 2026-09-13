#!/usr/bin/env python3
"""Convert one approved local file to Markdown with a hash-bound FCR provenance receipt."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

CONTRACT = "fcr/local-document-conversion@v1"
ADAPTER_VERSION = "1.0.0"
MAX_SOURCE_BYTES = 50 * 1024 * 1024
MAX_MARKDOWN_BYTES = 10 * 1024 * 1024


class ConversionError(ValueError):
    """Fail-closed local document conversion error."""


class Converter(Protocol):
    def convert_local(self, path: Path) -> Any: ...


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _resolve_relative(root: Path, value: str, *, must_exist: bool) -> Path:
    if not value or "://" in value or value.startswith(("data:", "file:")):
        raise ConversionError("input and output paths must be local relative paths without URI schemes")

    candidate = Path(value)
    if candidate.is_absolute():
        raise ConversionError("input and output paths must be relative to the approved root")

    root = root.resolve(strict=True)
    resolved = (root / candidate).resolve(strict=must_exist)
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ConversionError("path escapes the approved root") from exc
    return resolved


def _engine_version() -> str:
    try:
        return importlib.metadata.version("markitdown")
    except importlib.metadata.PackageNotFoundError:
        return "unavailable"


def _default_converter() -> Converter:
    try:
        from markitdown import MarkItDown
    except ImportError as exc:
        raise ConversionError(
            "MarkItDown is not installed. Run: pip install -r requirements-markitdown.txt"
        ) from exc
    return MarkItDown(enable_plugins=False)


def convert_local_document(
    root: str | Path,
    input_path: str,
    *,
    converter: Converter | None = None,
    engine_version: str | None = None,
    observed_at: str | None = None,
) -> tuple[str, dict[str, Any]]:
    approved_root = Path(root).resolve(strict=True)
    if not approved_root.is_dir():
        raise ConversionError("approved root must be a directory")

    source = _resolve_relative(approved_root, input_path, must_exist=True)
    if not source.is_file():
        raise ConversionError("input path must resolve to a regular file")

    source_size = source.stat().st_size
    if source_size > MAX_SOURCE_BYTES:
        raise ConversionError("input file exceeds the 50 MiB local conversion limit")
    source_bytes = source.read_bytes()
    active_converter = converter or _default_converter()
    result = active_converter.convert_local(source)
    markdown = getattr(result, "markdown", None)
    if not isinstance(markdown, str):
        markdown = getattr(result, "text_content", None)
    if not isinstance(markdown, str):
        raise ConversionError("MarkItDown returned no Markdown text")

    markdown_bytes = markdown.encode("utf-8")
    if len(markdown_bytes) > MAX_MARKDOWN_BYTES:
        raise ConversionError("Markdown output exceeds the 10 MiB local conversion limit")
    relative_source = source.relative_to(approved_root).as_posix()

    core = {
        "contract": CONTRACT,
        "adapterVersion": ADAPTER_VERSION,
        "engine": "microsoft/markitdown",
        "engineVersion": engine_version or _engine_version(),
        "conversionMode": "convert_local",
        "pluginsEnabled": False,
        "remoteUriInputAllowed": False,
        "source": {
            "path": relative_source,
            "sha256": _sha256(source_bytes),
            "bytes": len(source_bytes),
        },
        "output": {
            "sha256": _sha256(markdown_bytes),
            "bytes": len(markdown_bytes),
        },
    }
    receipt_digest = _sha256(
        json.dumps(core, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )
    receipt = {
        **core,
        "receiptDigest": receipt_digest,
        "observedAt": observed_at or datetime.now(timezone.utc).isoformat(),
    }
    return markdown, receipt


def _write_text_under_root(root: Path, relative_path: str, content: str) -> Path:
    destination = _resolve_relative(root, relative_path, must_exist=False)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content, encoding="utf-8")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert one approved local file into Markdown evidence."
    )
    parser.add_argument("--root", required=True, help="Approved local root directory")
    parser.add_argument("--input", required=True, help="Input path relative to --root")
    parser.add_argument("--output", required=True, help="Markdown output path relative to --root")
    parser.add_argument("--receipt", required=True, help="Receipt JSON path relative to --root")
    args = parser.parse_args()

    root = Path(args.root).resolve(strict=True)
    source = _resolve_relative(root, args.input, must_exist=True)
    output = _resolve_relative(root, args.output, must_exist=False)
    receipt_path = _resolve_relative(root, args.receipt, must_exist=False)

    if len({source, output, receipt_path}) != 3:
        raise ConversionError("input, output, and receipt paths must be distinct")

    markdown, receipt = convert_local_document(root, args.input)
    _write_text_under_root(root, args.output, markdown)
    _write_text_under_root(
        root,
        args.receipt,
        json.dumps(receipt, indent=2, sort_keys=True) + "\n",
    )

    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
