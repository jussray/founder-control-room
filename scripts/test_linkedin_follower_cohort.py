import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('linkedin_follower_cohort.py')
spec = importlib.util.spec_from_file_location('linkedin_follower_cohort', MODULE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)


class LinkedInFollowerCohortTest(unittest.TestCase):
    def snapshot(self, *, observed_at='2026-09-03T03:30:00Z', completeness='COMPLETE_VISIBLE_LIST', followers=None):
        return {
            'contract': 'linkedin-follower-snapshot@v1',
            'observed_at': observed_at,
            'source_authority': 'USER_SUPPLIED_LINKEDIN_EVIDENCE',
            'source_digest_sha256': 'a' * 64,
            'completeness': completeness,
            'followers': followers or [],
        }

    def follower(self, slug, **extra):
        item = {'profile_url': f'https://www.linkedin.com/in/{slug}/?trk=feed'}
        item.update(extra)
        return item

    def test_fingerprint_is_stable_across_tracking_noise(self):
        a = mod.follower_fingerprint('https://www.linkedin.com/in/example-person/?trk=foo')
        b = mod.follower_fingerprint('https://linkedin.com/in/example-person')
        self.assertEqual(a, b)

    def test_public_receipt_never_contains_raw_identity(self):
        receipt = mod.build_receipt(self.snapshot(followers=[self.follower(
            'ray-example',
            name='Ray Example',
            title='Founder',
            company='Example Co',
            category='Founder/CEO',
            seniority='Owner/Founder',
            relationship_signal='Direct conversation',
            project_relevance='FCR',
            high_value=True,
        )]))
        encoded = str(receipt)
        self.assertNotIn('Ray Example', encoded)
        self.assertNotIn('Example Co', encoded)
        self.assertNotIn('ray-example', encoded)
        self.assertEqual(receipt['summary']['identified'], 1)
        self.assertEqual(receipt['summary']['priority_ge_5'], 1)
        self.assertFalse(receipt['privacy']['raw_identity_persisted'])

    def test_complete_snapshot_allows_lost_classification(self):
        prior = mod.build_receipt(self.snapshot(followers=[self.follower('one'), self.follower('two')]))
        current = self.snapshot(
            observed_at='2026-09-10T03:30:00Z',
            followers=[self.follower('two'), self.follower('three')],
        )
        receipt = mod.build_receipt(current, prior)
        self.assertEqual(receipt['summary']['new'], 1)
        self.assertEqual(receipt['summary']['retained'], 1)
        self.assertEqual(receipt['summary']['lost'], 1)
        self.assertEqual(receipt['summary']['unknown_missing'], 0)

    def test_partial_snapshot_never_calls_missing_followers_lost(self):
        prior = mod.build_receipt(self.snapshot(followers=[self.follower('one'), self.follower('two')]))
        current = self.snapshot(
            observed_at='2026-09-10T03:30:00Z',
            completeness='PARTIAL_VISIBLE_LIST',
            followers=[self.follower('two')],
        )
        receipt = mod.build_receipt(current, prior)
        self.assertEqual(receipt['summary']['lost'], 0)
        self.assertEqual(receipt['summary']['unknown_missing'], 1)

    def test_names_without_stable_profile_identity_are_unresolved(self):
        receipt = mod.build_receipt(self.snapshot(followers=[{'name': 'Someone Visible'}]))
        self.assertEqual(receipt['summary']['identified'], 0)
        self.assertEqual(receipt['summary']['unresolved_identity_count'], 1)


if __name__ == '__main__':
    unittest.main()
