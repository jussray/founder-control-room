import importlib.util
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

MODULE = Path(__file__).with_name('linkedin_thesis_comment_lane.py')
spec = importlib.util.spec_from_file_location('linkedin_thesis_comment_lane', MODULE)
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
    names = ['DISCOVERY', 'ENGAGEMENT', 'FOLLOWERS', 'AUDIENCE DEMOGRAPHICS']
    workbook_sheets = ''.join(
        f'<sheet name="{name}" sheetId="{idx}" r:id="rId{idx}"/>'
        for idx, name in enumerate(names, start=1)
    )
    workbook = f'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="{MAIN_NS}" xmlns:r="{REL_NS}"><sheets>{workbook_sheets}</sheets></workbook>'
    rels = f'''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="{PKG_NS}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
</Relationships>'''

    discovery = sheet_xml([
        row(1, [cell('A1', 'Overall Performance'), cell('B1', '8/9/2026 - 9/5/2026')]),
        row(2, [cell('A2', 'Impressions'), cell('B2', '2233')]),
        row(3, [cell('A3', 'Members reached'), cell('B3', '1096')]),
    ])
    engagement = sheet_xml([
        row(1, [cell('A1', 'Date'), cell('B1', 'Impressions'), cell('C1', 'Engagements')]),
        row(2, [cell('A2', '9/4/2026'), cell('B2', '85'), cell('C2', '2')]),
        row(3, [cell('A3', '9/5/2026'), cell('B3', '9'), cell('C3', '0')]),
    ])
    followers = sheet_xml([
        row(1, [cell('A1', 'Total followers on 9/5/2026'), cell('B1', '68')]),
        row(2, []),
        row(3, [cell('A3', 'Date'), cell('B3', 'New followers')]),
        row(4, [cell('A4', '9/4/2026'), cell('B4', '2')]),
        row(5, [cell('A5', '9/5/2026'), cell('B5', '3')]),
    ])
    audience = sheet_xml([
        row(1, [cell('A1', 'Top Demographics'), cell('B1', 'Value'), cell('C1', 'Percentage')]),
        row(2, [cell('A2', 'Seniority'), cell('B2', 'Senior'), cell('C2', '37%')]),
        row(3, [cell('A3', 'Seniority'), cell('B3', 'CXO'), cell('C3', '14%')]),
    ])

    with ZipFile(path, 'w') as zf:
        zf.writestr('xl/workbook.xml', workbook)
        zf.writestr('xl/_rels/workbook.xml.rels', rels)
        zf.writestr('xl/worksheets/sheet1.xml', discovery)
        zf.writestr('xl/worksheets/sheet2.xml', engagement)
        zf.writestr('xl/worksheets/sheet3.xml', followers)
        zf.writestr('xl/worksheets/sheet4.xml', audience)


class LinkedInThesisCommentLaneTest(unittest.TestCase):
    def test_extracts_baseline_and_keeps_outcome_unknown(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'analytics.xlsx'
            write_fixture(path)
            report = mod.analyze_export(path)

        self.assertEqual(report['contract'], 'linkedin-thesis-comment-lane@v1')
        self.assertEqual(report['authority'], 'observation_only')
        self.assertEqual(report['lane']['execution'], 'founder_manual_only')
        self.assertEqual(report['baseline']['impressions'], 2233)
        self.assertEqual(report['baseline']['members_reached'], 1096)
        self.assertEqual(report['baseline']['engagements'], 2)
        self.assertEqual(report['baseline']['followers_total'], 68)
        self.assertEqual(report['baseline']['follower_movement'], 5)
        self.assertEqual(report['baseline']['audience_senior_pct'], 37.0)
        self.assertEqual(report['baseline']['audience_cxo_pct'], 14.0)
        self.assertEqual(report['field_test']['state'], 'READY_TO_TEST')
        self.assertEqual(report['field_test']['outcome_state'], 'UNKNOWN')

    def test_lane_cannot_win_on_impressions_only_or_auto_publish(self):
        lane = mod.LANE_CONTRACT
        self.assertIn('raw impressions alone cannot declare a winner', lane['test']['winner_rule'])
        self.assertEqual(lane['test']['target_comments'], 6)
        self.assertEqual(lane['test']['window_days'], 7)
        self.assertEqual(lane['test']['max_comments_per_day'], 2)
        self.assertFalse(lane['truth_boundary']['auto_publish'])

    def test_comment_fingerprint_ignores_tracking_query_and_whitespace(self):
        base = 'https://www.linkedin.com/posts/example_share-123-ABC'
        text = 'Creative judgment is becoming the scarce part.'
        self.assertEqual(
            mod.comment_fingerprint(base, text),
            mod.comment_fingerprint(base + '?utm_source=foo', '  Creative   judgment is becoming the scarce part.  '),
        )


if __name__ == '__main__':
    unittest.main()
