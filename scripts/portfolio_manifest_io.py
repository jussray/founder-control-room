"""Bounded duplicate-key rejecting JSON loader used by unprivileged release checks."""
import hashlib
import json
from pathlib import Path


def load_unique(path):
    def no_duplicate_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key: " + key)
            result[key] = value
        return result

    raw = Path(path).read_bytes()
    if len(raw) > 65536:
        raise ValueError("input too large: " + str(path))
    return json.loads(raw, object_pairs_hook=no_duplicate_keys), hashlib.sha256(raw).hexdigest()
