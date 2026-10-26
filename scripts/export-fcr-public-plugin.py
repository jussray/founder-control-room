#!/usr/bin/env python3
"""Build a deterministic, allowlisted, secret-free FCR public plugin ZIP.

No repository, provider, or network mutation. --check creates only temporary
archives and independently checks the entry set, bytes, and reproducibility.
"""
from __future__ import annotations

import argparse
import hashlib
import tempfile
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO / "plugins" / "fcr-public"
FILES = (
    "plugin.json",
    "mcp.json",
    "portable.json",
    "README.md",
    "review/test-cases.json",
    "skills/fcr-public-workflows/SKILL.md",
)


def build(target: Path) -> None:
    with zipfile.ZipFile(target, "w") as archive:
        for relative in FILES:
            source = SOURCE / relative
            content = source.read_bytes()
            info = zipfile.ZipInfo(relative, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)


def verify(target: Path) -> None:
    with zipfile.ZipFile(target, "r") as archive:
        assert archive.namelist() == list(FILES), "Unexpected or missing archive entries"
        assert archive.testzip() is None, "Archive CRC mismatch"
        for relative in FILES:
            assert archive.read(relative) == (SOURCE / relative).read_bytes(), (
                "Archive content differs: " + relative
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Only test ZIP output in a temporary directory")
    parser.add_argument("--output", type=Path, default=REPO / "dist" / "fcr-public-plugin.zip")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="fcr-plugin-export-") as tmp:
        a, b = Path(tmp) / "a.zip", Path(tmp) / "b.zip"
        build(a)
        verify(a)
        build(b)
        verify(b)
        assert a.read_bytes() == b.read_bytes(), "Export is not reproducible"
        digest = hashlib.sha256(a.read_bytes()).hexdigest()
        if args.check:
            print(f"[export:fcr-public] PASS: {len(FILES)} allowlisted entries; deterministic SHA-256 {digest}")
            return

        output = args.output.resolve()
        if output.exists():
            if output.read_bytes() != a.read_bytes():
                parser.error(f"Refusing to overwrite different existing archive: {output}")
            print(f"[export:fcr-public] Identical archive already exists: {output} ({digest})")
            return
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(a.read_bytes())
        verify(output)
        print(f"[export:fcr-public] Wrote {output} ({digest})")


if __name__ == "__main__":
    main()
