#!/usr/bin/env python3
"""Fail-closed, data-only release manifest preflight. Does not promote or execute candidates."""
import hashlib
import json
import sys
from pathlib import Path
from jsonschema import Draft202012Validator

def load_unique(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key: " + key)
            result[key] = value
        return result
    raw = Path(path).read_bytes()
    if len(raw) > 65536:
        raise ValueError("input too large: " + str(path))
    return json.loads(raw, object_pairs_hook=unique), hashlib.sha256(raw).hexdigest()

def main():
    root = Path(__file__).resolve().parents[1]
    manifest, digest = load_unique(root / "releases/portfolio-v0.1.0.json")
    schema, _ = load_unique(root / "schemas/portfolio-release.schema.json")
    policy, _ = load_unique(root / "release-policy/repositories.json")
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(manifest)
    for key, expected in policy["repositories"].items():
        if manifest["repositories"][key]["repository"] != expected:
            raise ValueError("repository mismatch: " + key)
    print(json.dumps({"manifestSha256": digest, "release": manifest["release"],
        "pins": {key: value["commit"] for key, value in manifest["repositories"].items()},
        "structureValidated": True, "compatibilityTested": False}, indent=2))
    missing = [key for key, value in policy["testCommands"].items() if not value]
    if missing:
        raise ValueError("PROMOTION BLOCKED: unconfigured mandatory suites: " + ", ".join(missing))
    # Reject shell success fallbacks: a failing mandatory test must remain a failure.
    import re
    masked = [key for key, command in policy["testCommands"].items()
              if re.search(r"(?:\|\|\s*(?:true|:)|;\s*(?:true|:)\s*$)", command)]
    if masked:
        raise ValueError("PROMOTION BLOCKED: masked mandatory test failures: " + ", ".join(masked))
    raise ValueError("PROMOTION BLOCKED: executable cross-repository test runner not yet wired")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
