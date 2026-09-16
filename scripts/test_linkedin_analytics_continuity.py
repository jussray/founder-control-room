import tempfile
import unittest
from datetime import date
from pathlib import Path
from zipfile import ZipFile
import importlib.util

MODULE = Path(__file__).with_name('linkedin_analytics_continuity.py')
DOC = MODULE.parents[1] / 'docs' / 'founder-signal-engine' / 'linkedin-analytics-continuity.md'
spec = importlib.util.spec_from_file_location('linkedin_analytics_continuity', MODULE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'


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
            report = mod.analyze_export(path, date(2026,8,2), date(2026,8,3), export_limit=3)

        self.assertEqual(report['contract'], 'linkedin-analytics-continuity@v1')
        self.assertEqual(report['authority'], 'observation_only')
        self.assertEqual(report['summary']['evidence_state'], 'VERIFIED_VISIBLE_FLOOR')
        self.assertEqual(report['summary']['verified_visible_posts'], 3)
        self.assertEqual(report['summary']['active_posting_days'], 2)
        self.assertEqual(report['summary']['max_posts_in_day'], 2)
        self.assertEqual([d['verified_visible_posts'] for d in report['days']], [2,1])
        self.assertTrue(report['days'][0]['day_cookie'].startswith('LI-DAY-20260802-P02-'))
        self.assertNotIn('utm_source', report['posts'][0]['post_url'])
        self.assertEqual(report['posts'][0]['linkedin_post_urn'], 'urn:li:share:111')

    def test_missing_activity_row_remains_unknown_instead_of_zero(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_export(path, date(2026,8,2), date(2026,8,4), export_limit=3)

        missing_day = report['days'][2]
        self.assertEqual(missing_day['date'], '2026-08-04')
        self.assertIsNone(missing_day['activity_impressions'])
        self.assertIsNone(missing_day['activity_engagements'])
        self.assertEqual(missing_day['activity_evidence_state'], 'UNKNOWN_NO_EVIDENCE')

    def test_fingerprint_is_stable_across_tracking_query_noise(self):
        day = date(2026,8,2)
        base = 'https://www.linkedin.com/posts/juss-rayy_share-111-A'
        self.assertEqual(mod.post_fingerprint(day, base), mod.post_fingerprint(day, base + '?utm_source=foo'))

    def test_reconcile_preserves_history_without_treating_missing_as_deleted(self):
        previous = {'posts': [{'fingerprint':'a'}, {'fingerprint':'b'}]}
        current = {'posts': [{'fingerprint':'b'}, {'fingerprint':'c'}]}
        result = mod.reconcile(previous, current)
        self.assertEqual(result['new'], ['c'])
        self.assertEqual(result['retained'], ['b'])
        self.assertEqual(result['missing_from_current_visible_set'], ['a'])

    def test_exact_post_measurement_binds_declared_identity_without_granting_learning(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_export(path, date(2026,8,2), date(2026,8,3), export_limit=3)

        receipt = mod.exact_post_measurement(
            report,
            account_id='linkedin-N6yjyvwGD9',
            experiment_id='LI-2ENGINE-20260910-A',
            post_identity='urn:li:share:111',
        )
        self.assertEqual(receipt['contract'], 'linkedin-native-post-measurement@v1')
        self.assertEqual(receipt['measurement_identity'], {
            'platform': 'linkedin',
            'account': 'linkedin-N6yjyvwGD9',
            'post': 'urn:li:share:111',
            'experiment': 'LI-2ENGINE-20260910-A',
        })
        self.assertEqual(receipt['evidence_state'], 'VERIFIED_VISIBLE')
        self.assertEqual(receipt['metrics']['impressions'], 80)
        self.assertIsNone(receipt['metrics']['engagements'])
        self.assertEqual(receipt['metric_provenance']['engagements'], 'UNAVAILABLE_POST_LEVEL_IN_THIS_EXPORT')
        self.assertEqual(receipt['identity_binding']['account_binding'], 'DECLARED_FCR_IDENTITY_NOT_PROVIDER_AUTHENTICATED')
        self.assertEqual(receipt['source']['window'], {'start': '2026-08-02', 'end': '2026-08-03', 'calendar_days': 2})
        self.assertEqual(receipt['source']['freshness_state'], 'NOT_ESTABLISHED_BY_THIS_RECEIPT')
        self.assertIn('current_native_export_freshness', receipt['learning']['requires'])
        self.assertFalse(receipt['learning']['eligible_from_this_receipt'])
        self.assertEqual(receipt['learning']['next_gate'], 'REQUIRES_PROVIDER_AUTHENTICATED_ACCOUNT_BINDING')
        self.assertFalse(receipt['publication_authority'])
        self.assertFalse(receipt['strategy_mutation_authority'])

    def test_exact_post_measurement_does_not_promote_daily_aggregate_engagements(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_export(path, date(2026,8,2), date(2026,8,3), export_limit=3)

        self.assertEqual(report['days'][0]['activity_engagements'], 4)
        receipt = mod.exact_post_measurement(
            report,
            account_id='founder-linkedin',
            experiment_id='exp-1',
            post_identity='https://www.linkedin.com/posts/juss-rayy_share-111-A?trk=noise',
        )
        self.assertIsNone(receipt['metrics']['engagements'])

    def test_missing_exact_post_in_capped_export_remains_unknown_not_zero(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_export(path, date(2026,8,2), date(2026,8,3), export_limit=3)

        receipt = mod.exact_post_measurement(
            report,
            account_id='founder-linkedin',
            experiment_id='exp-missing',
            post_identity='urn:li:share:999',
        )
        self.assertEqual(receipt['evidence_state'], 'UNKNOWN_NO_EVIDENCE')
        self.assertIsNone(receipt['metrics']['impressions'])
        self.assertIsNone(receipt['metrics']['engagements'])
        self.assertEqual(receipt['absence_semantics'], 'TARGET_NOT_VISIBLE_IN_CAPPED_EXPORT_IS_NOT_ZERO_OR_FAILURE')
        self.assertFalse(receipt['learning']['eligible_from_this_receipt'])

    def test_canonical_post_identity_accepts_only_canonical_urn_or_linkedin_host(self):
        self.assertEqual(mod.canonical_post_identity('urn:li:share:123')['urn'], 'urn:li:share:123')
        self.assertEqual(mod.canonical_post_identity('urn:li:ugcPost:456')['urn'], 'urn:li:ugcPost:456')
        self.assertEqual(
            mod.canonical_post_identity('https://www.linkedin.com/feed/update/urn:li:share:789/')['urn'],
            'urn:li:share:789',
        )
        with self.assertRaises(ValueError):
            mod.canonical_post_identity('https://example.com/posts/share-123-test')
        with self.assertRaises(ValueError):
            mod.canonical_post_identity('https://example.com/urn:li:share:123')
        with self.assertRaises(ValueError):
            mod.canonical_post_identity('prefix urn:li:share:123 suffix')

    def test_declared_binding_rejects_empty_or_multiline_identity(self):
        report = {'posts': [], 'summary': {}, 'source': {}, 'window': {}}
        with self.assertRaises(ValueError):
            mod.exact_post_measurement(report, account_id='', experiment_id='exp', post_identity='urn:li:share:1')
        with self.assertRaises(ValueError):
            mod.exact_post_measurement(report, account_id='acct\nspoof', experiment_id='exp', post_identity='urn:li:share:1')

    def test_operator_contract_keeps_native_measurement_non_authorizing(self):
        doc = DOC.read_text()
        required = [
            'linkedin-native-post-measurement@v1',
            'DECLARED_FCR_IDENTITY_NOT_PROVIDER_AUTHENTICATED',
            'learning.eligible_from_this_receipt = false',
            'publication_authority = false',
            'strategy_mutation_authority = false',
            'UNKNOWN_NO_EVIDENCE',
            'must never be promoted to an exact-post engagement metric',
            'freshness is not established by this receipt',
        ]
        for marker in required:
            self.assertIn(marker, doc)


if __name__ == '__main__':
    unittest.main()
