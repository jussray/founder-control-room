import hashlib
import importlib.util
import pathlib
import tempfile
import unittest

BASE = pathlib.Path(__file__).resolve().parents[1]
VERIFIER = BASE / 'scripts' / 'verify_inventory.py'


def loaded():
    spec = importlib.util.spec_from_file_location('inventory_checker', VERIFIER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture(tmp):
    root = pathlib.Path(tmp)
    (root / 'one.md').write_text('one\n')
    value = hashlib.sha256((root / 'one.md').read_bytes()).hexdigest()
    (root / 'SHA256SUMS.txt').write_text(f'{value}  ./one.md\n')
    return root


class InventoryTests(unittest.TestCase):
    def test_valid_inventory(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(loaded().verify(fixture(tmp)), [])

    def test_stale_digest_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = fixture(tmp)
            (root / 'one.md').write_text('modified')
            self.assertTrue(loaded().verify(root))

    def test_unlisted_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = fixture(tmp)
            (root / 'two.md').write_text('two')
            self.assertTrue(loaded().verify(root))

    def test_missing_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = fixture(tmp)
            (root / 'one.md').unlink()
            self.assertTrue(loaded().verify(root))

    def test_duplicate_and_traversal_entries_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = fixture(tmp)
            with (root / 'SHA256SUMS.txt').open('a') as handle:
                handle.write(hashlib.sha256(b'x').hexdigest() + '  ./one.md\n')
                handle.write(hashlib.sha256(b'x').hexdigest() + '  ./../outside.md\n')
            self.assertTrue(loaded().verify(root))

    def test_symlinks_cannot_be_used_as_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = fixture(tmp)
            (root / 'one.md').unlink()
            outside = root.parent / 'outside-inventory-probe.md'
            # Existing target not required to reject an injected symlink.
            (root / 'one.md').symlink_to(outside)
            self.assertTrue(loaded().verify(root))

    def test_python_cache_is_not_counted_as_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = fixture(tmp)
            cache = root / '__pycache__'
            cache.mkdir()
            (cache / 'test.cpython-312.pyc').write_bytes(b'dummy')
            self.assertEqual(loaded().verify(root), [])


if __name__ == '__main__':
    unittest.main()
