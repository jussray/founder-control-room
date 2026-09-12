import json
import tempfile
import unittest
from pathlib import Path

from scripts.markitdown_local import ConversionError, convert_local_document


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "markitdown"
EXPECTED_MARKDOWN = "# Founder evidence\n\nLocal conversion only."
SOURCE_SHA256 = "d4e736c42bf0f0906c1290e8f6f1bba597dce846852cb8b35e43585b37863c1b"
OUTPUT_SHA256 = "49921c008986450c1076a5247d6c520badae9e8bcdd28cdd662e2d7bb90ed050"


class _Result:
    def __init__(self, markdown: str):
        self.markdown = markdown


class _FixtureConverter:
    def convert_local(self, path: Path) -> _Result:
        if path.name != "founder-evidence.html":
            raise AssertionError(f"unexpected fixture path: {path}")
        return _Result(EXPECTED_MARKDOWN)


class MarkItDownLocalTests(unittest.TestCase):
    def test_fixture_receipt_binds_source_to_markdown_without_leaking_absolute_path(self) -> None:
        markdown, receipt = convert_local_document(
            FIXTURE_ROOT,
            "founder-evidence.html",
            converter=_FixtureConverter(),
            engine_version="0.1.7",
            observed_at="2026-09-12T23:30:00+00:00",
        )

        self.assertEqual(markdown, EXPECTED_MARKDOWN)
        self.assertEqual(receipt["contract"], "fcr/local-document-conversion@v1")
        self.assertEqual(receipt["conversionMode"], "convert_local")
        self.assertFalse(receipt["pluginsEnabled"])
        self.assertFalse(receipt["remoteUriInputAllowed"])
        self.assertEqual(receipt["source"]["sha256"], SOURCE_SHA256)
        self.assertEqual(receipt["output"]["sha256"], OUTPUT_SHA256)
        self.assertEqual(receipt["source"]["path"], "founder-evidence.html")
        self.assertNotIn(str(FIXTURE_ROOT), json.dumps(receipt))

    def test_receipt_digest_is_deterministic_for_same_conversion(self) -> None:
        first = convert_local_document(
            FIXTURE_ROOT,
            "founder-evidence.html",
            converter=_FixtureConverter(),
            engine_version="0.1.7",
            observed_at="2026-09-12T23:30:00+00:00",
        )[1]
        second = convert_local_document(
            FIXTURE_ROOT,
            "founder-evidence.html",
            converter=_FixtureConverter(),
            engine_version="0.1.7",
            observed_at="2026-09-13T00:30:00+00:00",
        )[1]
        self.assertEqual(first["receiptDigest"], second["receiptDigest"])

    def test_rejects_uri_input(self) -> None:
        with self.assertRaisesRegex(ConversionError, "local relative paths"):
            convert_local_document(
                FIXTURE_ROOT,
                "https://example.com/document.pdf",
                converter=_FixtureConverter(),
            )

    def test_rejects_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            parent = Path(temp)
            root = parent / "approved"
            root.mkdir()
            outside = parent / "outside.txt"
            outside.write_text("outside", encoding="utf-8")
            with self.assertRaisesRegex(ConversionError, "escapes the approved root"):
                convert_local_document(
                    root,
                    "../outside.txt",
                    converter=_FixtureConverter(),
                )


if __name__ == "__main__":
    unittest.main()
