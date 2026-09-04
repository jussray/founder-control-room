import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('linkedin_follower_cohort.py')
spec = importlib.util.spec_from_file_location('linkedin_follower_cohort', MODULE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

KEY = 'k' * 64
OTHER_KEY = 'z' * 64
EPOCH = '2026-09-v1'
NEXT_EPOCH = '2026-10-v1'


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

    def receipt(self, snapshot, previous=None, *, key=KEY, epoch=EPOCH):
        return mod.build_receipt(
            snapshot,
            previous,
            identity_key=key,
            identity_key_epoch=epoch,
        )

    def test_fingerprint_is_stable_across_tracking_noise_but_keyed(self):
        a = mod.follower_fingerprint(KEY, 'https://www.linkedin.com/in/example-person/?trk=foo')
        b = mod.follower_fingerprint(KEY, 'https://linkedin.com/in/example-person')
        c = mod.follower_fingerprint(OTHER_KEY, 'https://linkedin.com/in/example-person')
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertEqual(len(a), 32)

    def test_public_receipt_never_contains_raw_identity_or_private_key(self):
        receipt = self.receipt(self.snapshot(followers=[self.follower(
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
        self.assertNotIn(KEY, encoded)
        self.assertEqual(receipt['contract'], 'linkedin-follower-cohort@v2')
        self.assertEqual(receipt['privacy']['member_identity_scheme'], 'HMAC-SHA256/private-runtime-key/v1')
        self.assertEqual(receipt['privacy']['identity_key_epoch'], EPOCH)
        self.assertEqual(receipt['summary']['identified'], 1)
        self.assertEqual(receipt['summary']['priority_ge_5'], 1)
        self.assertFalse(receipt['privacy']['raw_identity_persisted'])

    def test_rejects_invalid_identity_key_epoch(self):
        with self.assertRaisesRegex(ValueError, 'identity_key_epoch'):
            self.receipt(self.snapshot(), epoch='bad epoch with spaces')

    def test_rejects_free_form_metadata_from_redacted_receipt(self):
        with self.assertRaisesRegex(ValueError, 'allowed redacted enum'):
            self.receipt(self.snapshot(followers=[self.follower(
                'ray-example',
                category='Ray Example at SecretCo',
            )]))

    def test_initial_snapshot_is_baseline_not_new(self):
        receipt = self.receipt(self.snapshot(followers=[self.follower('one'), self.follower('two')]))
        self.assertEqual(receipt['summary']['new'], 0)
        self.assertEqual(receipt['summary']['baseline_or_unknown_added'], 2)
        self.assertEqual(receipt['reconciliation']['baseline_reason'], 'INITIAL_OR_LEGACY_PRIVACY_BASELINE')

    def test_complete_predecessor_allows_new_and_lost_classification(self):
        prior = self.receipt(self.snapshot(followers=[self.follower('one'), self.follower('two')]))
        current = self.snapshot(
            observed_at='2026-09-10T03:30:00Z',
            followers=[self.follower('two'), self.follower('three')],
        )
        receipt = self.receipt(current, prior)
        self.assertEqual(receipt['summary']['new'], 1)
        self.assertEqual(receipt['summary']['retained'], 1)
        self.assertEqual(receipt['summary']['lost'], 1)
        self.assertEqual(receipt['summary']['baseline_or_unknown_added'], 0)
        self.assertEqual(receipt['summary']['unknown_missing'], 0)

    def test_key_epoch_rotation_resets_to_baseline_without_false_new_or_lost(self):
        prior = self.receipt(self.snapshot(followers=[self.follower('one'), self.follower('two')]))
        current = self.snapshot(
            observed_at='2026-09-10T03:30:00Z',
            followers=[self.follower('one'), self.follower('two')],
        )
        receipt = self.receipt(current, prior, key=OTHER_KEY, epoch=NEXT_EPOCH)
        self.assertEqual(receipt['privacy']['identity_key_epoch'], NEXT_EPOCH)
        self.assertEqual(receipt['summary']['new'], 0)
        self.assertEqual(receipt['summary']['lost'], 0)
        self.assertEqual(receipt['summary']['retained'], 0)
        self.assertEqual(receipt['summary']['baseline_or_unknown_added'], 2)
        self.assertEqual(receipt['reconciliation']['baseline_reason'], 'IDENTITY_KEY_EPOCH_CHANGED')

    def test_epoch_rotation_still_rejects_stale_snapshot(self):
        prior = self.receipt(self.snapshot(followers=[self.follower('one')]))
        with self.assertRaisesRegex(ValueError, 'strictly newer'):
            self.receipt(
                self.snapshot(observed_at='2026-09-02T03:30:00Z', followers=[self.follower('one')]),
                prior,
                key=OTHER_KEY,
                epoch=NEXT_EPOCH,
            )

    def test_partial_predecessor_does_not_call_new_visibility_acquisition(self):
        prior = self.receipt(self.snapshot(
            completeness='PARTIAL_VISIBLE_LIST',
            followers=[self.follower('one')],
        ))
        current = self.snapshot(
            observed_at='2026-09-10T03:30:00Z',
            completeness='PARTIAL_VISIBLE_LIST',
            followers=[self.follower('one'), self.follower('two')],
        )
        receipt = self.receipt(current, prior)
        self.assertEqual(receipt['summary']['new'], 0)
        self.assertEqual(receipt['summary']['baseline_or_unknown_added'], 1)
        self.assertEqual(receipt['reconciliation']['baseline_reason'], 'PRIOR_VISIBILITY_PARTIAL')

    def test_partial_current_snapshot_never_calls_missing_followers_lost(self):
        prior = self.receipt(self.snapshot(followers=[self.follower('one'), self.follower('two')]))
        current = self.snapshot(
            observed_at='2026-09-10T03:30:00Z',
            completeness='PARTIAL_VISIBLE_LIST',
            followers=[self.follower('two')],
        )
        receipt = self.receipt(current, prior)
        self.assertEqual(receipt['summary']['lost'], 0)
        self.assertEqual(receipt['summary']['unknown_missing'], 1)

    def test_rejects_out_of_order_or_equal_snapshot(self):
        prior = self.receipt(self.snapshot(followers=[self.follower('one')]))
        with self.assertRaisesRegex(ValueError, 'strictly newer'):
            self.receipt(self.snapshot(
                observed_at='2026-09-03T03:30:00Z',
                followers=[self.follower('one')],
            ), prior)
        with self.assertRaisesRegex(ValueError, 'strictly newer'):
            self.receipt(self.snapshot(
                observed_at='2026-09-02T03:30:00Z',
                followers=[self.follower('one')],
            ), prior)

    def test_legacy_unkeyed_receipt_forces_new_privacy_baseline(self):
        legacy = {
            'contract': 'linkedin-follower-cohort@v1',
            'observed_at': '2026-09-02T03:30:00Z',
            'followers': [{'fingerprint': 'abc'}],
        }
        receipt = self.receipt(self.snapshot(followers=[self.follower('one')]), legacy)
        self.assertEqual(receipt['summary']['new'], 0)
        self.assertEqual(receipt['summary']['baseline_or_unknown_added'], 1)

    def test_names_without_stable_profile_identity_are_unresolved(self):
        receipt = self.receipt(self.snapshot(followers=[{'name': 'Someone Visible'}]))
        self.assertEqual(receipt['summary']['identified'], 0)
        self.assertEqual(receipt['summary']['unresolved_identity_count'], 1)

    def test_workflow_separates_source_auth_from_identity_and_fails_closed(self):
        workflow = (
            Path(__file__).resolve().parents[1]
            / '.github'
            / 'workflows'
            / 'linkedin-follower-cohort.yml'
        ).read_text()
        self.assertIn(
            'LINKEDIN_FOLLOWER_ID_HMAC_KEY: ${{ secrets.LINKEDIN_FOLLOWER_ID_HMAC_KEY }}',
            workflow,
        )
        self.assertNotIn(
            'LINKEDIN_FOLLOWER_ID_HMAC_KEY: ${{ secrets.LINKEDIN_FOLLOWER_SNAPSHOT_TOKEN }}',
            workflow,
        )
        self.assertIn(
            'LINKEDIN_FOLLOWER_ID_HMAC_EPOCH: ${{ vars.LINKEDIN_FOLLOWER_ID_HMAC_EPOCH }}',
            workflow,
        )
        self.assertNotIn('} || true)', workflow)
        self.assertIn('BLOCKED_PREDECESSOR_ARTIFACT', workflow)
        job_header = workflow.split('reconcile-private-snapshot:', 1)[1].split('steps:', 1)[0]
        self.assertNotIn('\n    env:', job_header)


if __name__ == '__main__':
    unittest.main()
