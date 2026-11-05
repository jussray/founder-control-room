#!/usr/bin/env python3
"""Check export file bytes and inventory completeness against SHA256SUMS.txt.

This is a local integrity check, not proof of authorship or source authenticity.
"""
import argparse
import hashlib
import pathlib
import re
import sys

ENTRY = re.compile(r'^([0-9a-f]{64})  \./([^\x00\n]+)$')


def verify(root):
    root = pathlib.Path(root)
    if root.is_symlink() or not root.is_dir():
        return ['export root must be a real directory']
    manifest = root / 'SHA256SUMS.txt'
    if not manifest.is_file() or manifest.is_symlink():
        return ['SHA256SUMS.txt missing or symlink']
    try:
        lines = manifest.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeError) as exc:
        return [f'manifest unreadable: {exc}']

    issues = []
    declared = {}
    for number, line in enumerate(lines, start=1):
        match = ENTRY.fullmatch(line)
        if not match:
            issues.append(f'line {number}: malformed checksum entry')
            continue
        expected, rel = match.groups()
        if '\\' in rel or any(part in ('', '.', '..') for part in rel.split('/')):
            issues.append(f'line {number}: unsafe relative path')
            continue
        if rel in declared:
            issues.append(f'line {number}: duplicate path {rel}')
            continue
        declared[rel] = expected

    actual = {}
    for path in root.rglob('*'):
        rel = path.relative_to(root)
        if '__pycache__' in rel.parts or path.suffix == '.pyc':
            continue
        if path.is_symlink():
            issues.append(f'{rel.as_posix()}: symlink forbidden')
            continue
        if path.is_file() and rel.as_posix() != 'SHA256SUMS.txt':
            actual[rel.as_posix()] = path

    missing = sorted(set(declared) - set(actual))
    extras = sorted(set(actual) - set(declared))
    for rel in missing:
        issues.append(f'{rel}: listed but missing')
    for rel in extras:
        issues.append(f'{rel}: file absent from manifest')
    for rel in sorted(set(declared) & set(actual)):
        h = hashlib.sha256()
        try:
            with actual[rel].open('rb') as file:
                for block in iter(lambda: file.read(65536), b''):
                    h.update(block)
        except OSError as exc:
            issues.append(f'{rel}: unreadable ({exc})')
            continue
        if h.hexdigest() != declared[rel]:
            issues.append(f'{rel}: checksum mismatch')
    return issues


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=pathlib.Path)
    args = parser.parse_args(argv)
    issues = verify(args.root)
    if issues:
        print('INVALID EXPORT:\n' + '\n'.join(f'- {issue}' for issue in issues))
        return 2
    print('INVENTORY_OK: complete SHA-256 file-byte verification (not source authentication)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
