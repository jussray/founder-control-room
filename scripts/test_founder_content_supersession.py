import copy
import hashlib
import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('founder_content_supersession.py')
spec = importlib.util.spec_from_file_location('founder_content_supersession', MODULE)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

SOURCE_BINDING_MODULE = Path(__file__).with_name('founder_content_source_binding.py')
source_binding_spec = importlib.util.spec_from_file_location('founder_content_source_binding', SOURCE_BINDING_MODULE)
source_binding = importlib.util.module_from_spec(source_binding_spec)
assert source_binding_spec.loader
source_binding_spec.loader.exec_module(source_binding)


CANONICAL = {
    'contract': 'fcr/founder-content-supersession-input@v1',
    'subject': {
        'platform': 'LinkedIn',
        'post_fingerprint': '7b307a1b3eb68ace',
    },
    'expectation': 'If the early signal is durable, engagement efficiency should remain competitive as impressions mature.',
    'prior': {
        'observed_at': '2026-08-29',
        'source_sha256': 'a' * 64,
        'impressions': 81,
        'engagements': 6,
        'claim': 'Product Design/HCI looked like the new winning architecture.',
    },
    'current': {
        'observed_at': '2026-08-30',
        'source_sha256': 'b' * 64,
        'impressions': 165,
        'engagements': 6,
        'claim': 'No format winner is verified from that snapshot. Require a maturity window before strategy mutation.',
    },
    'strategy_mutation': {
        'action': 'Do not promote Product Design/HCI as the winning content architecture from the early snapshot.',
        'next_gate': 'Require a later mature post-level read before changing the content strategy.',
    },
    'predecessor_receipt_id': 'SUP-0123456789abcdef',
}


class FounderContentSupersessionTest(unittest.TestCase):
    def test_canonical_weaker_signal_supersedes_without_deleting_history(self):
        receipt = mod.build_supersession_receipt(copy.deepcopy(CANONICAL))
        self.assertEqual(receipt['contract'], 'fcr/founder-content-supersession@v3')
        self.assertEqual(receipt['authority'], 'observation_only')
        self.assertEqual(receipt['diff'], {
            'impressions': 84,
            'engagements': 0,
            'engagement_rate_pp': -3.77,
        })
        self.assertEqual(receipt['surprise'], 'WEAKER_THAN_EXPECTED')
        self.assertEqual(receipt['evidence'][0]['metrics']['engagement_rate'], 7.41)
        self.assertEqual(receipt['evidence'][1]['metrics']['engagement_rate'], 3.64)
        self.assertEqual(receipt['evidence'][0]['evidence_state'], 'ATTESTED_HISTORICAL')
        self.assertEqual(receipt['evidence'][1]['evidence_state'], 'ATTESTED_CURRENT')
        self.assertEqual(receipt['supersession']['prior_claim_state'], 'SUPERSEDED_HISTORICAL')
        self.assertEqual(receipt['supersession']['current_claim_state'], 'ATTESTED_CURRENT')
        self.assertEqual(receipt['predecessor_receipt_id'], 'SUP-0123456789abcdef')
        self.assertEqual(receipt['provenance']['source_digest_verification'], 'UNVERIFIED_INPUT_V3')
        self.assertEqual(receipt['provenance']['claim_source_binding'], 'NOT_LOCKED_V3')

    def test_unchecked_digest_never_upgrades_to_verified_state(self):
        receipt = mod.build_supersession_receipt(copy.deepcopy(CANONICAL))
        serialized = repr(receipt)
        self.assertNotIn('VERIFIED_CURRENT', serialized)
        self.assertNotIn('VERIFIED_HISTORICAL', serialized)

    def test_source_bytes_bind_artifact_without_proving_claim_derivation(self):
        prior_bytes = b'linkedin export snapshot 2026-08-29'
        current_bytes = b'linkedin export snapshot 2026-08-30'
        payload = copy.deepcopy(CANONICAL)
        payload['prior']['source_sha256'] = hashlib.sha256(prior_bytes).hexdigest()
        payload['current']['source_sha256'] = hashlib.sha256(current_bytes).hexdigest()

        receipt = source_binding.build_source_bound_supersession_receipt(
            payload,
            prior_source_bytes=prior_bytes,
            current_source_bytes=current_bytes,
        )

        self.assertEqual(receipt['contract'], 'fcr/founder-content-supersession@v4')
        self.assertEqual(receipt['source_binding']['prior']['binding_state'], 'SOURCE_BYTES_MATCH_HISTORICAL')
        self.assertEqual(receipt['source_binding']['current']['binding_state'], 'SOURCE_BYTES_MATCH_CURRENT')
        self.assertEqual(receipt['provenance']['source_digest_verification'], 'VERIFIED_FROM_SOURCE_BYTES_V4')
        self.assertEqual(receipt['provenance']['source_artifact_binding'], 'LOCKED_TO_SOURCE_BYTES_V4')
        self.assertEqual(receipt['provenance']['claim_source_binding'], 'NOT_PROVEN_V4')
        self.assertEqual(receipt['provenance']['metric_derivation_verification'], 'NOT_PROVEN_V4')
        self.assertEqual(receipt['provenance']['independent_witness'], 'NOT_PRESENT_V4')
        self.assertEqual(receipt['provenance']['execution_environment_attestation'], 'NOT_LOCKED_V4')
        self.assertEqual(receipt['provenance']['verification_ceiling'], 'ATTESTED')
        self.assertEqual(receipt['evidence'][0]['evidence_state'], 'ATTESTED_HISTORICAL')
        self.assertEqual(receipt['evidence'][1]['evidence_state'], 'ATTESTED_CURRENT')
        self.assertEqual(receipt['supersession']['current_claim_state'], 'ATTESTED_CURRENT')
        self.assertNotIn('VERIFIED_CURRENT', repr(receipt))
        self.assertNotIn('VERIFIED_HISTORICAL', repr(receipt))

    def test_source_binding_rejects_bytes_that_do_not_match_claimed_digest(self):
        prior_bytes = b'linkedin export snapshot 2026-08-29'
        current_bytes = b'linkedin export snapshot 2026-08-30'
        payload = copy.deepcopy(CANONICAL)
        payload['prior']['source_sha256'] = hashlib.sha256(prior_bytes).hexdigest()
        payload['current']['source_sha256'] = hashlib.sha256(current_bytes).hexdigest()

        with self.assertRaisesRegex(ValueError, 'sha256 does not match'):
            source_binding.build_source_bound_supersession_receipt(
                payload,
                prior_source_bytes=prior_bytes + b'-tampered',
                current_source_bytes=current_bytes,
            )

    def test_source_bound_receipt_is_deterministic(self):
        prior_bytes = b'linkedin export snapshot 2026-08-29'
        current_bytes = b'linkedin export snapshot 2026-08-30'
        payload = copy.deepcopy(CANONICAL)
        payload['prior']['source_sha256'] = hashlib.sha256(prior_bytes).hexdigest()
        payload['current']['source_sha256'] = hashlib.sha256(current_bytes).hexdigest()

        first = source_binding.build_source_bound_supersession_receipt(
            copy.deepcopy(payload),
            prior_source_bytes=prior_bytes,
            current_source_bytes=current_bytes,
        )
        second = source_binding.build_source_bound_supersession_receipt(
            copy.deepcopy(payload),
            prior_source_bytes=prior_bytes,
            current_source_bytes=current_bytes,
        )
        self.assertEqual(first['receipt_id'], second['receipt_id'])
        self.assertEqual(first['receipt_sha256'], second['receipt_sha256'])

    def test_receipt_is_deterministic_and_mutation_is_bound_into_identity(self):
        first = mod.build_supersession_receipt(copy.deepcopy(CANONICAL))
        second = mod.build_supersession_receipt(copy.deepcopy(CANONICAL))
        self.assertEqual(first['receipt_id'], second['receipt_id'])
        self.assertEqual(first['receipt_sha256'], second['receipt_sha256'])
        changed = copy.deepcopy(CANONICAL)
        changed['strategy_mutation']['next_gate'] = 'Wait for a second mature post-level replication.'
        third = mod.build_supersession_receipt(changed)
        self.assertNotEqual(first['receipt_id'], third['receipt_id'])

    def test_rejects_out_of_order_or_equal_observation_time(self):
        payload = copy.deepcopy(CANONICAL)
        payload['current']['observed_at'] = payload['prior']['observed_at']
        with self.assertRaisesRegex(ValueError, 'must be later'):
            mod.build_supersession_receipt(payload)

    def test_rejects_decreasing_cumulative_metrics(self):
        payload = copy.deepcopy(CANONICAL)
        payload['current']['impressions'] = 80
        with self.assertRaisesRegex(ValueError, 'impressions must not decrease'):
            mod.build_supersession_receipt(payload)
        payload = copy.deepcopy(CANONICAL)
        payload['current']['engagements'] = 5
        with self.assertRaisesRegex(ValueError, 'engagements must not decrease'):
            mod.build_supersession_receipt(payload)


if __name__ == '__main__':
    unittest.main()
