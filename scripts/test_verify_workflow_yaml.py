#!/usr/bin/env python3
"""Tests for scripts/verify_workflow_yaml.py (fail-closed workflow YAML parse guard)."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("verify_workflow_yaml.py")
SPEC = importlib.util.spec_from_file_location("verify_workflow_yaml", MODULE_PATH)
assert SPEC and SPEC.loader
verifier = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = verifier
SPEC.loader.exec_module(verifier)


VALID_WORKFLOW = """name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Say hi
        run: |
          echo "hi"
"""

# Same defect class as the #1065 deploy.yml breakage: a line that sits at the
# key's indentation instead of inside the `run: |` block, which GitHub rejects.
UNDER_INDENTED_BLOCK = """name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Say hi
        run: |
          echo one
        echo two
"""


class VerifyWorkflowYamlTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write_workflow(self, name: str, body: str) -> None:
        workflows = self.root / ".github" / "workflows"
        workflows.mkdir(parents=True, exist_ok=True)
        (workflows / name).write_text(body, encoding="utf-8")

    def run_guard(self) -> tuple[int, str]:
        out = io.StringIO()
        err = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = verifier.main(["verify_workflow_yaml.py", str(self.root)])
        return code, out.getvalue() + err.getvalue()

    def test_valid_workflow_passes(self) -> None:
        self.write_workflow("ci.yml", VALID_WORKFLOW)
        code, _ = self.run_guard()
        self.assertEqual(code, 0)

    def test_under_indented_block_fails_and_names_the_file(self) -> None:
        self.write_workflow("deploy.yml", UNDER_INDENTED_BLOCK)
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("deploy.yml", output)

    def test_one_invalid_file_fails_even_when_others_are_valid(self) -> None:
        self.write_workflow("ci.yml", VALID_WORKFLOW)
        self.write_workflow("deploy.yml", UNDER_INDENTED_BLOCK)
        code, _ = self.run_guard()
        self.assertEqual(code, 1)

    def test_yaml_extension_is_checked(self) -> None:
        self.write_workflow("deploy.yaml", UNDER_INDENTED_BLOCK)
        code, _ = self.run_guard()
        self.assertEqual(code, 1)

    def test_missing_workflow_directory_fails_closed(self) -> None:
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("no workflow files", output)

    def test_empty_workflow_directory_fails_closed(self) -> None:
        (self.root / ".github" / "workflows").mkdir(parents=True)
        code, _ = self.run_guard()
        self.assertEqual(code, 1)

    def test_files_outside_the_workflow_directory_are_not_checked(self) -> None:
        self.write_workflow("ci.yml", VALID_WORKFLOW)
        (self.root / "config.yml").write_text(UNDER_INDENTED_BLOCK, encoding="utf-8")
        code, _ = self.run_guard()
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
