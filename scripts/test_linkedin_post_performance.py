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
    ])
    top = sheet_xml([
        row(1, [cell('A1','Maximum of 50 posts available to include in this list')]),
        row(2, []),
        row(3, [cell('A3','Post URL'), cell('B3','Post Publish Date'), cell('C3','Engagements'), cell('E3','Post URL'), cell('F3','Post Publish Date'), cell('G3','Impressions')]),
        row(4, [cell('A4','https://www.linkedin.com/posts/juss_share-111-A?trk=x'), cell('B4','8/2/2026'), cell('C4','10'), cell('E4','https://www.linkedin.com/posts/juss_share-222-B'), cell('F4','8/2/2026'), cell('G4','900')]),
        row(5, [cell('A5','https://www.linkedin.com/posts/juss_share-222-B'), cell('B5','8/2/2026'), cell('C5','5'), cell('E5','https://www.linkedin.com/posts/juss_share-111-A?utm_source=y'), cell('F5','8/2/2026'), cell('G5','100')]),
        row(6, [cell('A6','https://www.linkedin.com/posts/juss_share-333-C'), cell('B6','8/2/2026'), cell('C6','4')]),
    ])
    with ZipFile(path, 'w') as zf:
        zf.writestr('xl/workbook.xml', workbook)
        zf.writestr('xl/_rels/workbook.xml.rels', rels)
        zf.writestr('xl/worksheets/sheet1.xml', engagement)
        zf.writestr('xl/worksheets/sheet2.xml', top)


class LinkedInPostPerformanceTest(unittest.TestCase):
    def test_merges_ranked_lists_by_stable_fingerprint(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_performance(
                path,
                date(2026,8,2),
                date(2026,8,2),
                window_role='recent_90',
            )
        self.assertEqual(report['contract'], 'linkedin-post-performance@v1')
        self.assertEqual(report['summary']['unique_ranked_posts'], 3)
        both = [p for p in report['posts'] if p['metric_completeness'] == 'BOTH_VISIBLE']
        self.assertEqual(len(both), 2)
        self.assertTrue(all(p['engagement_rate'] is not None for p in both))

    def test_missing_ranked_metric_is_unknown_not_zero(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_performance(
                path,
                date(2026,8,2),
                date(2026,8,2),
                window_role='historical_365',
            )
        only_engagement = [p for p in report['posts'] if p['metric_completeness'] == 'ENGAGEMENT_ONLY_VISIBLE']
        self.assertEqual(len(only_engagement), 1)
        self.assertIsNone(only_engagement[0]['engagement_rate'])
        self.assertNotIn('impressions', only_engagement[0])
        self.assertEqual(report['provider_rank_visibility']['missing_metric_policy'], 'UNKNOWN_NOT_ZERO')

    def test_top_ten_signal_separates_reach_and_resonance(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_performance(
                path,
                date(2026,8,2),
                date(2026,8,2),
                window_role='recent_90',
            )
        signals = {p['performance_signal'] for p in report['posts']}
        self.assertIn('BALANCED_TOP_10_VISIBLE', signals)
        self.assertIn('ENGAGEMENT_RANKED_ONLY', signals)


if __name__ == '__main__':
    unittest.main()
