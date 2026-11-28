"""Read-only admission checks for a normalized canonical-library handoff.

This does not implement the original ledger format or authenticate signatures.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath

SCHEMA = 'juss/canonical-library-intake@1'
LEDGER = 'ledger/ledger.jsonl'
HEX = re.compile(r'[0-9a-f]{64}\Z')


class IntakeError(ValueError):
    pass


def safe_path(value):
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        raise IntakeError('invalid manifest path')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or path.as_posix() != value or value == '.':
        raise IntakeError('noncanonical manifest path')
    return value


def valid_hash(value):
    return isinstance(value, str) and HEX.fullmatch(value) is not None


def hash_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify_intake(root, manifest, checkpoint=None):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise IntakeError('expected a locally extracted directory')
    if not isinstance(manifest, dict) or manifest.get('schema') != SCHEMA:
        raise IntakeError('unsupported manifest schema; explicit normalization required')
    entries = manifest.get('files')
    if not isinstance(entries, list) or not entries:
        raise IntakeError('empty or invalid manifest')
    expected = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise IntakeError('invalid manifest entry')
        path = safe_path(entry.get('path'))
        digest = entry.get('sha256')
        if path in expected or not valid_hash(digest):
            raise IntakeError('duplicate path or invalid digest')
        expected[path] = digest
    if LEDGER not in expected:
        raise IntakeError('missing ledger entry')
    observed = {}
    for path in root.rglob('*'):
        if path.is_symlink():
            raise IntakeError('symlink not permitted')
        if path.is_dir():
            continue
        if not path.is_file():
            raise IntakeError('nonregular file not permitted')
        key = safe_path(path.relative_to(root).as_posix())
        observed[key] = path
    if observed.keys() != expected.keys():
        raise IntakeError('missing or unlisted archive files')
    for key, path in observed.items():
        if hash_file(path) != expected[key]:
            raise IntakeError('archive digest mismatch')
    status = 'UNANCHORED'
    if checkpoint is not None:
        if not isinstance(checkpoint, dict):
            raise IntakeError('invalid checkpoint')
        size, digest = checkpoint.get('prefix_bytes'), checkpoint.get('prefix_sha256')
        if type(size) is not int or size <= 0 or not valid_hash(digest):
            raise IntakeError('invalid checkpoint fields')
        hasher, remaining, last = hashlib.sha256(), size, b''
        with observed[LEDGER].open('rb') as stream:
            while remaining:
                block = stream.read(min(remaining, 1024 * 1024))
                if not block:
                    raise IntakeError('ledger prefix truncated')
                hasher.update(block)
                remaining -= len(block)
                last = block[-1:]
        if last != b'\n' or hasher.hexdigest() != digest:
            raise IntakeError('ledger checkpoint mismatch')
        status = 'PREFIX_MATCHED_NOT_SIGNATURE_VERIFIED'
    return {'schema': SCHEMA, 'files_verified': len(observed), 'checkpoint_status': status,
            'ledger_chain_verified': False, 'production_integration': 'UNVERIFIED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--checkpoint', type=Path)
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
        checkpoint = json.loads(args.checkpoint.read_text(encoding='utf-8')) if args.checkpoint else None
        print(json.dumps(verify_intake(args.root, manifest, checkpoint), sort_keys=True))
    except (IntakeError, OSError, ValueError):
        parser.exit(1, 'Intake blocked: invalid or inaccessible package evidence.\n')


if __name__ == '__main__':
    main()
