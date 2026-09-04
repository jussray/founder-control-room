import hashlib
import tempfile
import unittest
from datetime import date
from pathlib import Path
from zipfile import ZipFile
import importlib.util

MODULE = Path(__file__).with_name('linkedin_analytics_continuity.py')
spec = importlib.util.spec_from_file_location('linkedin_analytics_continuity', MODULE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
KEY = 'k' * 64
OTHER_KEY = 'z' * 64
EPOCH = 'linkedin-post-id-v1'
OTHER_EPOCH = 'linkedin-post-id-v2'


def cell(ref, value):
    escaped = str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'<c r="{ref}" t="inlineStr"><is><t>{escaped}</t></is></c>'


def row(num, cells):
    return f'<row r="{num}">{"".join(cells)}</row>'


def sheet_xml(rows):
    return f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="{MAIN_NS}"><sheetData>{"".join(rows)}</sheetData></worksheet>'


def write_fixture(path: Path):
    workbook = f'''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="{MAIN_NS}" xmlns:r="{REL_NS}"><sheets>
<sheet name="ENGAGEMENT" sheetId="1" r:id="rId1"/><sheet name="TOP POSTS" sheetId="2" r:id="rId2"/>
</sheets></workbook>'''
    rels = f'''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="{PKG_NS}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>'''
    engagement = sheet_xml([
        row(1, [cell('A1','Date'), cell('B1','Impressions'), cell('C1','Engagements')]),
        row(2, [cell('A2','8/2/2026'), cell('B2','100'), cell('C2','4')]),
        row(3, [cell('A3','8/3/2026'), cell('B3','50'), cell('C3','2')]),
    ])
    top = sheet_xml([
        row(1, [cell('A1','Maximum of 3 posts available to include in this list')]),
        row(2, []),
        row(3, [cell('E3','Post URL'), cell('F3','Post Publish Date'), cell('G3','Impressions')]),
        row(4, [cell('E4','https://www.linkedin.com/posts/juss-rayy_share-111-A?utm_source=x'), cell('F4','8/2/2026'), cell('G4','80')]),
        row(5, [cell('E5','https://www.linkedin.com/posts/juss-rayy_share-222-B'), cell('F5','8/2/2026'), cell('G5','60')]),
        row(6, [cell('E6','https://www.linkedin.com/posts/juss-rayy_share-333-C'), cell('F6','8/3/2026'), cell('G6','40')]),
    ])
    with ZipFile(path, 'w') as zf:
        zf.writestr('xl/workbook.xml', workbook)
        zf.writestr('xl/_rels/workbook.xml.rels', rels)
        zf.writestr('xl/worksheets/sheet1.xml', engagement)
        zf.writestr('xl/worksheets/sheet2.xml', top)


class LinkedInAnalyticsContinuityTest(unittest.TestCase):
    def test_xlsx_to_cadence_fingerprints_and_floor(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_export(
                path,
                date(2026,8,2),
                date(2026,8,3),
                export_limit=3,
                identity_key=KEY,
                identity_key_epoch=EPOCH,
            )

        self.assertEqual(report['contract'], 'linkedin-analytics-continuity@v1')
        self.assertEqual(report['authority'], 'observation_only')
        self.assertEqual(report['summary']['evidence_state'], 'VERIFIED_VISIBLE_FLOOR')
        self.assertEqual(report['summary']['verified_visible_posts'], 3)
        self.assertEqual(report['summary']['active_posting_days'], 2)
        self.assertEqual(report['summary']['max_posts_in_day'], 2)
        self.assertEqual([d['verified_visible_posts'] for d in report['days']], [2,1])
        self.assertTrue(report['days'][0]['day_cookie'].startswith('LI-DAY-20260802-P02-'))
        self.assertNotIn('utm_source', report['posts'][0]['post_url'])
        self.assertEqual(report['privacy']['post_identity_scheme'], 'HMAC-SHA256/private-runtime-key/v1')
        self.assertEqual(report['privacy']['post_identity_key_epoch'], EPOCH)
        self.assertFalse(report['privacy']['private_key_persisted'])
        self.assertNotIn(KEY, str(report))

    def test_fingerprint_is_stable_across_tracking_noise_but_keyed(self):
        day = date(2026,8,2)
        base = 'https://www.linkedin.com/posts/juss-rayy_share-111-A'
        a = mod.post_fingerprint(day, base, identity_key=KEY)
        b = mod.post_fingerprint(day, base + '?utm_source=foo', identity_key=KEY)
        c = mod.post_fingerprint(day, base, identity_key=OTHER_KEY)
        legacy = hashlib.sha256(f'linkedin|{day.isoformat()}|{base}'.encode()).hexdigest()[:16]
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertNotEqual(a, legacy)
        self.assertEqual(len(a), 32)

    def test_reconcile_preserves_history_without_treating_missing_as_deleted(self):
        previous = {
            'contract': 'linkedin-analytics-continuity@v1',
            'privacy': {'post_identity_key_epoch': EPOCH},
            'posts': [{'fingerprint':'a'}, {'fingerprint':'b'}],
        }
        current = {
            'privacy': {'post_identity_key_epoch': EPOCH},
            'posts': [{'fingerprint':'b'}, {'fingerprint':'c'}],
        }
        result = mod.reconcile(previous, current)
        self.assertEqual(result['new'], ['c'])
        self.assertEqual(result['retained'], ['b'])
        self.assertEqual(result['missing_from_current_visible_set'], ['a'])
        self.assertEqual(result['baseline_or_unknown_visible'], [])

    def test_reconcile_unwraps_redacted_post_evidence_envelope(self):
        previous = {
            'contract': 'linkedin-post-evidence@v1',
            'continuity': {
                'contract': 'linkedin-analytics-continuity@v1',
                'privacy': {'post_identity_key_epoch': EPOCH},
                'posts': [{'fingerprint':'a'}, {'fingerprint':'b'}],
            },
            'performance': {'contract': 'linkedin-post-performance@v1'},
        }
        current = {
            'privacy': {'post_identity_key_epoch': EPOCH},
            'posts': [{'fingerprint':'b'}, {'fingerprint':'c'}],
        }
        result = mod.reconcile(previous, current)
        self.assertEqual(result['new'], ['c'])
        self.assertEqual(result['retained'], ['b'])
        self.assertEqual(result['missing_from_current_visible_set'], ['a'])

    def test_key_rotation_starts_baseline_instead_of_fake_growth_or_churn(self):
        previous = {
            'contract': 'linkedin-analytics-continuity@v1',
            'privacy': {'post_identity_key_epoch': EPOCH},
            'posts': [{'fingerprint':'old-a'}, {'fingerprint':'old-b'}],
        }
        current = {
            'privacy': {'post_identity_key_epoch': OTHER_EPOCH},
            'posts': [{'fingerprint':'new-a'}, {'fingerprint':'new-b'}],
        }
        result = mod.reconcile(previous, current)
        self.assertEqual(result['new'], [])
        self.assertEqual(result['retained'], [])
        self.assertEqual(result['missing_from_current_visible_set'], [])
        self.assertEqual(result['baseline_or_unknown_visible'], ['new-a', 'new-b'])
        self.assertEqual(result['baseline_reason'], 'POST_IDENTITY_KEY_EPOCH_CHANGED')

    def test_legacy_receipt_without_epoch_starts_new_keyed_baseline(self):
        previous = {
            'contract': 'linkedin-analytics-continuity@v1',
            'posts': [{'fingerprint':'legacy-public-hash'}],
        }
        current = {
            'privacy': {'post_identity_key_epoch': EPOCH},
            'posts': [{'fingerprint':'keyed-a'}],
        }
        result = mod.reconcile(previous, current)
        self.assertEqual(result['new'], [])
        self.assertEqual(result['missing_from_current_visible_set'], [])
        self.assertEqual(result['baseline_or_unknown_visible'], ['keyed-a'])
        self.assertEqual(result['baseline_reason'], 'POST_IDENTITY_KEY_EPOCH_CHANGED')

    def test_reconcile_rejects_malformed_outer_envelope(self):
        previous = {'contract': 'linkedin-post-evidence@v1', 'continuity': {'posts': []}}
        current = {'privacy': {'post_identity_key_epoch': EPOCH}, 'posts': []}
        with self.assertRaisesRegex(ValueError, 'nested continuity receipt contract mismatch'):
            mod.reconcile(previous, current)

    def test_workflow_keeps_source_auth_separate_from_post_identity_key(self):
        workflow = (Path(__file__).parents[1] / '.github/workflows/linkedin-post-analytics.yml').read_text()
        self.assertIn('LINKEDIN_POST_ID_HMAC_KEY', workflow)
        self.assertIn('LINKEDIN_POST_ID_HMAC_EPOCH', workflow)
        self.assertIn('LINKEDIN_ANALYTICS_SNAPSHOT_TOKEN', workflow)
        self.assertNotIn('LINKEDIN_POST_ID_HMAC_KEY: ${{ secrets.LINKEDIN_ANALYTICS_SNAPSHOT_TOKEN }}', workflow)
        self.assertNotIn('} || true)', workflow)
        self.assertIn('BLOCKED_PREDECESSOR_ARTIFACT', workflow)


if __name__ == '__main__':
    unittest.main()
