import importlib.util
import tempfile
import unittest
from datetime import date
from pathlib import Path
from zipfile import ZipFile

MODULE = Path(__file__).with_name('linkedin_post_performance.py')
spec = importlib.util.spec_from_file_location('linkedin_post_performance', MODULE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
KEY = 'k' * 64
OTHER_KEY = 'z' * 64
EPOCH = 'linkedin-post-id-v1'


def cell(ref, value):
    escaped = str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'<c r="{ref}" t="inlineStr"><is><t>{escaped}</t></is></c>'


def row(num, cells):
    return f'<row r="{num}">{"".join(cells)}</row>'


def sheet_xml(rows):
    return f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="{MAIN_NS}"><sheetData>{"".join(rows)}</sheetData></worksheet>'


def write_fixture(path: Path, *, include_out_of_window_leaders=False):
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
    ])
    top_rows = [
        row(1, [cell('A1','Maximum of 50 posts available to include in this list')]),
        row(2, []),
        row(3, [cell('A3','Post URL'), cell('B3','Post Publish Date'), cell('C3','Engagements'), cell('E3','Post URL'), cell('F3','Post Publish Date'), cell('G3','Impressions')]),
    ]
    if include_out_of_window_leaders:
        for index in range(1, 12):
            excel_row = 3 + index
            top_rows.append(row(excel_row, [
                cell(f'A{excel_row}', f'https://www.linkedin.com/posts/juss_share-old-{index}'),
                cell(f'B{excel_row}', '7/1/2026'),
                cell(f'C{excel_row}', str(100-index)),
                cell(f'E{excel_row}', f'https://www.linkedin.com/posts/juss_share-old-impr-{index}'),
                cell(f'F{excel_row}', '7/1/2026'),
                cell(f'G{excel_row}', str(1000-index)),
            ]))
        start_row = 15
    else:
        start_row = 4
    top_rows.extend([
        row(start_row, [cell(f'A{start_row}','https://www.linkedin.com/posts/juss_share-111-A?trk=x'), cell(f'B{start_row}','8/2/2026'), cell(f'C{start_row}','10'), cell(f'E{start_row}','https://www.linkedin.com/posts/juss_share-222-B'), cell(f'F{start_row}','8/2/2026'), cell(f'G{start_row}','900')]),
        row(start_row+1, [cell(f'A{start_row+1}','https://www.linkedin.com/posts/juss_share-222-B'), cell(f'B{start_row+1}','8/2/2026'), cell(f'C{start_row+1}','5'), cell(f'E{start_row+1}','https://www.linkedin.com/posts/juss_share-111-A?utm_source=y'), cell(f'F{start_row+1}','8/2/2026'), cell(f'G{start_row+1}','100')]),
        row(start_row+2, [cell(f'A{start_row+2}','https://www.linkedin.com/posts/juss_share-333-C'), cell(f'B{start_row+2}','8/2/2026'), cell(f'C{start_row+2}','4')]),
    ])
    top = sheet_xml(top_rows)
    with ZipFile(path, 'w') as zf:
        zf.writestr('xl/workbook.xml', workbook)
        zf.writestr('xl/_rels/workbook.xml.rels', rels)
        zf.writestr('xl/worksheets/sheet1.xml', engagement)
        zf.writestr('xl/worksheets/sheet2.xml', top)


class LinkedInPostPerformanceTest(unittest.TestCase):
    def analyze(self, path, *, window_role='recent_90'):
        return mod.analyze_performance(
            path,
            date(2026,8,2),
            date(2026,8,2),
            window_role=window_role,
            identity_key=KEY,
            identity_key_epoch=EPOCH,
        )

    def test_merges_ranked_lists_by_stable_keyed_fingerprint(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = self.analyze(path)
        self.assertEqual(report['contract'], 'linkedin-post-performance@v1')
        self.assertEqual(report['summary']['unique_ranked_posts'], 3)
        both = [p for p in report['posts'] if p['metric_completeness'] == 'BOTH_VISIBLE']
        self.assertEqual(len(both), 2)
        self.assertTrue(all(p['engagement_rate'] is not None for p in both))
        self.assertEqual(report['privacy']['post_identity_scheme'], 'HMAC-SHA256/private-runtime-key/v1')
        self.assertEqual(report['privacy']['post_identity_key_epoch'], EPOCH)
        self.assertNotIn(KEY, str(report))

    def test_different_private_keys_produce_different_public_post_ids(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            a = self.analyze(path)
            b = mod.analyze_performance(
                path,
                date(2026,8,2),
                date(2026,8,2),
                window_role='recent_90',
                identity_key=OTHER_KEY,
                identity_key_epoch=EPOCH,
            )
        self.assertNotEqual(
            sorted(p['fingerprint'] for p in a['posts']),
            sorted(p['fingerprint'] for p in b['posts']),
        )

    def test_missing_ranked_metric_is_unknown_not_zero(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = self.analyze(path, window_role='historical_365')
        only_engagement = [p for p in report['posts'] if p['metric_completeness'] == 'ENGAGEMENT_ONLY_VISIBLE']
        self.assertEqual(len(only_engagement), 1)
        self.assertIsNone(only_engagement[0]['engagement_rate'])
        self.assertNotIn('impressions', only_engagement[0])
        self.assertEqual(report['provider_rank_visibility']['missing_metric_policy'], 'UNKNOWN_NOT_ZERO')

    def test_top_ten_signal_separates_reach_and_resonance(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = self.analyze(path)
        signals = {p['performance_signal'] for p in report['posts']}
        self.assertIn('BALANCED_TOP_10_VISIBLE', signals)
        self.assertIn('ENGAGEMENT_RANKED_ONLY', signals)

    def test_date_filter_preserves_original_provider_rank(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path, include_out_of_window_leaders=True)
            report = self.analyze(path)
        ranked = {p['publish_date']: p for p in report['posts'] if p.get('engagements') == 10}
        target = ranked['2026-08-02']
        self.assertEqual(target['engagements_rank'], 12)
        self.assertNotIn(target['performance_signal'], {'BALANCED_TOP_10_VISIBLE', 'RESONANCE_LED_VISIBLE'})
        self.assertEqual(
            report['provider_rank_visibility']['rank_policy'],
            'PRESERVE_EXPORTED_PROVIDER_POSITION_BEFORE_WINDOW_FILTER',
        )


if __name__ == '__main__':
    unittest.main()
