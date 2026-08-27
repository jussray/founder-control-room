Exact patch contract for current-main successor.

Target file: src/founder-os-lab/projectAdapters.ts
Target base: baeafec20ae9547900f9dd6a4abed371e8290b01

Change only:
SEKRET_BIP_AUDITED_HEAD
from 467da149bad1720f87885a991a924aa143eb2ddd
to 050d8a7119df6184945d2768f31bb12117be6ea1

Preserve CHIEF_AI_AUDITED_HEAD at 2fd4fda0cab12e52ab5096e723884d98bcfe7d10.
Preserve every audited contract blob SHA and all authority/action/provider/rule fields unchanged.
Delete this request file in the same patch.
Final PR diff must contain only src/founder-os-lab/projectAdapters.ts with one head-value replacement.
Run focused project-adapter, Founder↔Chief pairing, CI/typecheck, and required Playwright/control-room verification. Do not merge.
