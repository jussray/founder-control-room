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


class WorkerReconcileSecretReceiptTests(unittest.TestCase):
    """Run the actual inline Python gate against synthetic, name-only Wrangler receipts."""

    @classmethod
    def setUpClass(cls) -> None:
        import tomllib

        cls.root = Path(__file__).resolve().parent.parent
        workflow = (cls.root / ".github/workflows/worker-reconcile.yml").read_text(
            encoding="utf-8"
        )
        anchor = """          SECRET_RECEIPT="$secret_receipt" python3 - <<'PY'
"""
        if anchor not in workflow or "\n          PY\n" not in workflow.split(anchor, 1)[1]:
            raise AssertionError("worker reconcile secret-name gate not found")
        import textwrap

        cls.gate = textwrap.dedent(
            workflow.split(anchor, 1)[1].split("\n          PY\n", 1)[0]
        )
        with (cls.root / "wrangler.worker.toml").open("rb") as config_file:
            config = tomllib.load(config_file)
        cls.names = sorted(set(config["secrets"]["required"]) - {
            "FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON"
        })

    def run_receipt(self, receipt: str):
        import os
        import subprocess

        with tempfile.TemporaryDirectory() as tmp:
            receipt_path = Path(tmp) / "wrangler-secret-names.txt"
            receipt_path.write_text(receipt, encoding="utf-8")
            return subprocess.run(
                [sys.executable, "-c", self.gate],
                cwd=self.root,
                env={**os.environ, "SECRET_RECEIPT": str(receipt_path)},
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )

    def entries(self):
        import json

        return [{"name": name, "type": "secret_text"} for name in self.names]

    def test_plain_json_receipt_accepted(self) -> None:
        import json

        result = self.run_receipt(json.dumps(self.entries()))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_wranger_stdout_notice_before_json_accepted(self) -> None:
        import json

        receipt = "Wrangler authenticating with an API token...\n" + json.dumps(
            self.entries()
        ) + "\n"
        result = self.run_receipt(receipt)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_required_name_is_rejected(self) -> None:
        import json

        result = self.run_receipt(json.dumps(self.entries()[1:]))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing provider-held Worker secret", result.stdout)

    def test_duplicate_entries_are_rejected(self) -> None:
        import json

        entries = self.entries()
        result = self.run_receipt(json.dumps(entries + entries[:1]))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid Cloudflare secret receipt", result.stdout)

    def test_malformed_provider_receipt_fails_closed_without_echo(self) -> None:
        receipt = "auth banner\n[SECRET_DO_NOT_ECHO\n"
        result = self.run_receipt(receipt)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid Cloudflare secret receipt", result.stdout)
        self.assertNotIn("SECRET_DO_NOT_ECHO", result.stdout + result.stderr)

    def test_bracketed_warning_notice_before_json_accepted(self) -> None:
        import json

        receipt = "▲ [WARNING] You are logged in with an API Token.\n\n" + json.dumps(
            self.entries()
        ) + "\n"
        result = self.run_receipt(receipt)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_bracketed_log_line_after_json_accepted(self) -> None:
        import json

        receipt = json.dumps(self.entries()) + "\n[wrangler] done\n"
        result = self.run_receipt(receipt)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_notice_that_parses_as_a_non_receipt_list_is_skipped(self) -> None:
        import json

        receipt = "step [1, 2] of setup\n" + json.dumps(self.entries())
        result = self.run_receipt(receipt)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_bracketed_notices_without_a_receipt_fail_closed_without_echo(self) -> None:
        receipt = "▲ [WARNING] SECRET_DO_NOT_ECHO\n[1, 2]\n[wrangler] done\n"
        result = self.run_receipt(receipt)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid Cloudflare secret receipt", result.stdout)
        self.assertNotIn("SECRET_DO_NOT_ECHO", result.stdout + result.stderr)

if __name__ == "__main__":
    unittest.main()
