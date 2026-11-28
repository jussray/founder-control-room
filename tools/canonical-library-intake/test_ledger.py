import hashlib
import tempfile
import unittest
from pathlib import Path
from ledger import verify_intake, IntakeError


def digest(data):
    return hashlib.sha256(data).hexdigest()


class LedgerIntakeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ledger = self.root / 'ledger' / 'ledger.jsonl'
        self.ledger.parent.mkdir()
        self.prefix = b'{"sequence":1}\n'
        self.ledger.write_bytes(self.prefix + b'{"sequence":2}\n')
        self.record = self.root / 'record.json'
        self.record.write_bytes(b'{"record":"synthetic"}\n')

    def manifest(self):
        return {'schema': 'juss/canonical-library-intake@1', 'files': [
            {'path': 'ledger/ledger.jsonl', 'sha256': digest(self.ledger.read_bytes())},
            {'path': 'record.json', 'sha256': digest(self.record.read_bytes())},
        ]}

    def checkpoint(self):
        return {'prefix_bytes': len(self.prefix), 'prefix_sha256': digest(self.prefix)}

    def test_valid_append_only_prefix(self):
        result = verify_intake(self.root, self.manifest(), self.checkpoint())
        self.assertEqual(result['files_verified'], 2)
        self.assertEqual(result['checkpoint_status'], 'PREFIX_MATCHED_NOT_SIGNATURE_VERIFIED')

    def test_unanchored_archive_is_not_historical_proof(self):
        self.assertEqual(verify_intake(self.root, self.manifest())['checkpoint_status'], 'UNANCHORED')

    def test_changed_file_rejected(self):
        manifest = self.manifest()
        self.record.write_bytes(b'changed')
        with self.assertRaises(IntakeError):
            verify_intake(self.root, manifest)

    def test_missing_file_rejected(self):
        manifest = self.manifest()
        self.record.unlink()
        with self.assertRaises(IntakeError):
            verify_intake(self.root, manifest)

    def test_unlisted_file_rejected(self):
        (self.root / 'unlisted.txt').write_text('synthetic')
        with self.assertRaises(IntakeError):
            verify_intake(self.root, self.manifest())

    def test_duplicate_manifest_entry_rejected(self):
        manifest = self.manifest()
        manifest['files'].append(dict(manifest['files'][0]))
        with self.assertRaises(IntakeError):
            verify_intake(self.root, manifest)

    def test_traversal_and_absolute_paths_rejected(self):
        for path in ('../outside', '/outside', 'a/../b', 'a\\b', './record.json', 'a//b'):
            with self.subTest(path=path):
                manifest = self.manifest()
                manifest['files'][1]['path'] = path
                with self.assertRaises(IntakeError):
                    verify_intake(self.root, manifest)

    def test_symlink_rejected(self):
        self.record.unlink()
        self.record.symlink_to(self.ledger)
        with self.assertRaises(IntakeError):
            verify_intake(self.root, self.manifest())

    def test_rehashed_rewrite_does_not_match_external_checkpoint(self):
        self.ledger.write_bytes(b'{"sequence":9}\n')
        with self.assertRaises(IntakeError):
            verify_intake(self.root, self.manifest(), self.checkpoint())

    def test_partial_record_checkpoint_rejected(self):
        checkpoint = {'prefix_bytes': 4, 'prefix_sha256': digest(self.prefix[:4])}
        with self.assertRaises(IntakeError):
            verify_intake(self.root, self.manifest(), checkpoint)


if __name__ == '__main__':
    unittest.main()
