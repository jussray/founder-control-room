#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("whoami.py")
SPEC = importlib.util.spec_from_file_location("founder_whoami", MODULE_PATH)
assert SPEC and SPEC.loader
whoami = importlib.util.module_from_spec(SPEC)
# Must be registered before exec_module: whoami.py uses `from __future__ import
# annotations` with `@dataclass(frozen=True)`, and dataclass's own type
# resolution looks the module up via sys.modules[cls.__module__] — which is
# empty until this line, otherwise raising AttributeError on class definition.
sys.modules[SPEC.name] = whoami
SPEC.loader.exec_module(whoami)


class WhoAmITests(unittest.TestCase):
    def test_email_is_hidden_by_default(self) -> None:
        with patch.dict(os.environ, {"FOUNDER_EMAIL": "founder@example.com"}, clear=False):
            snapshot = whoami.build_snapshot(include_email=False)
        self.assertIsNone(snapshot.email)

    def test_email_can_be_explicitly_included(self) -> None:
        with patch.dict(os.environ, {"FOUNDER_EMAIL": "founder@example.com"}, clear=False):
            snapshot = whoami.build_snapshot(include_email=True)
        self.assertEqual(snapshot.email, "founder@example.com")

    def test_sensitive_environment_names_are_redacted(self) -> None:
        with patch.dict(os.environ, {"FOUNDER_SECRET": "do-not-print"}, clear=False):
            self.assertEqual(whoami.safe_environment_value("FOUNDER_SECRET", "fallback"), whoami.REDACTED)

    def test_repository_snapshot_reports_exact_git_truth(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
            (root / "README.md").write_text("truth\n", encoding="utf-8")
            subprocess.run(["git", "add", "README.md"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True)

            snapshot = whoami.repository_snapshot(root)

            self.assertEqual(snapshot.root, str(root.resolve()))
            self.assertEqual(len(snapshot.head or ""), 40)
            self.assertFalse(snapshot.dirty)

            (root / "README.md").write_text("changed\n", encoding="utf-8")
            self.assertTrue(whoami.repository_snapshot(root).dirty)

    def test_expectation_mismatch_fails_closed(self) -> None:
        snapshot = whoami.WhoAmISnapshot(
            schema_version=1,
            display_name="Juss",
            role="Founder",
            email=None,
            environment="test",
            python_version="3.x",
            platform="test",
            repository=whoami.RepositorySnapshot(
                root="/tmp/founder-control-room",
                branch="main",
                head="a" * 40,
                dirty=False,
            ),
        )
        errors = whoami.validate_expectations(
            snapshot,
            expected_repo="founder-control-room",
            expected_head="b" * 40,
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("expected HEAD", errors[0])

    def test_json_cli_never_includes_email_without_flag(self) -> None:
        completed = subprocess.run(
            ["python3", str(MODULE_PATH), "--json"],
            check=True,
            capture_output=True,
            text=True,
            env={**os.environ, "FOUNDER_EMAIL": "founder@example.com"},
        )
        payload = json.loads(completed.stdout)
        self.assertIsNone(payload["email"])
        self.assertTrue(payload["ok"])


if __name__ == "__main__":
    unittest.main()
