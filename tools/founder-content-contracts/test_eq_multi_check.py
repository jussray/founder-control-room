import csv
import tempfile
import unittest
from pathlib import Path
from eq_multi_check import ExportError, load, parse_count, report

HEADERS = ['Post ID','Message','Publish time','Reach','Reactions','Comments','Shares','Link clicks']
ROW = {'Post ID':'p1','Message':'We lost 3 days. Which action?', 'Publish time':'2026-11-17',
       'Reach':'1,000','Reactions':'2','Comments':'3','Shares':'4','Link clicks':'5'}

def fixture(t, headers=HEADERS, rows=None):
    p=Path(t.name)/'export.csv'
    with p.open('w',newline='') as f:
        w=csv.DictWriter(f, fieldnames=headers);w.writeheader();w.writerows(rows if rows is not None else [ROW])
    return p

class PostCheckTests(unittest.TestCase):
    def test_complete_data(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})()); x=load(p,'facebook')[0]
            self.assertEqual(x.engagement,14);self.assertEqual(x.reach,1000)
            self.assertAlmostEqual(x.rate(),.014);self.assertEqual(sum(x.checks().values()),4)
    def test_missing_metric_is_unknown(self):
        with tempfile.TemporaryDirectory() as d:
            cols=HEADERS[:-1];p=fixture(type('D',(),{'name':d})(),cols,[{k:ROW[k] for k in cols}])
            x=load(p,'facebook')[0];self.assertIsNone(x.engagement);self.assertIsNone(x.rate());self.assertIn('clicks',x.missing)
    def test_explicit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            x=dict(ROW);x.update({'Reactions':'0','Comments':'0','Shares':'0','Link clicks':'0'})
            p=fixture(type('D',(),{'name':d})(),rows=[x]);self.assertEqual(load(p,'facebook')[0].rate(),0)
    def test_zero_denominator_is_unknown(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})(),rows=[{**ROW,'Reach':'0'}]);self.assertIsNone(load(p,'facebook')[0].rate())
    def test_auto_needs_platform(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})());self.assertRaisesRegex(ExportError,'platform.*column',load,p,None)
    def test_auto_reads_platform(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})(),['platform',*HEADERS],[{'platform':'FACEBOOK',**ROW}]);self.assertEqual(load(p,None)[0].platform,'facebook')
    def test_conflicting_platform_fails(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})(),['platform',*HEADERS],[{'platform':'instagram',**ROW}]);self.assertRaisesRegex(ExportError,'conflicts',load,p,'facebook')
    def test_duplicate_fails(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})(),rows=[ROW,ROW]);self.assertRaisesRegex(ExportError,'duplicate',load,p,'facebook')
    def test_missing_identity_column_fails(self):
        with tempfile.TemporaryDirectory() as d:
            cols=HEADERS[1:];p=fixture(type('D',(),{'name':d})(),cols,[{k:ROW[k] for k in cols}]);self.assertRaisesRegex(ExportError,'required column',load,p,'facebook')
    def test_bad_number_fails(self):
        for v in ('bad','-1','NaN','inf','1,20','2.5'):
            with self.subTest(v=v):self.assertRaises(ExportError,parse_count,v,'count')
    def test_blank_number_is_unknown(self):self.assertIsNone(parse_count('','count'))
    def test_discord_rate_disabled(self):
        with tempfile.TemporaryDirectory() as d:
            cols=['message_id','content','timestamp','channel_members','reactions','replies']
            values={'message_id':'m1','content':'Lost 3. Which?','timestamp':'2026-11-17','channel_members':'100','reactions':'5','replies':'1'}
            p=fixture(type('D',(),{'name':d})(),cols,[values]);x=load(p,'discord')[0]
            self.assertIsNone(x.rate());self.assertIn('audience proxy',report([x]))
    def test_no_text_no_score(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})(),rows=[{**ROW,'Message':''}]);self.assertIsNone(load(p,'facebook')[0].checks())
    def test_no_text_disclosure(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})(),rows=[{**ROW,'Message':'PRIVATE_123'}]);self.assertNotIn('PRIVATE_123',report(load(p,'facebook')))
    def test_no_median_from_one_sample(self):
        with tempfile.TemporaryDirectory() as d:
            p=fixture(type('D',(),{'name':d})());self.assertIn('INCOMPLETE comparison',report(load(p,'facebook')))

if __name__=='__main__':unittest.main()
