# Temporary exact patch request

Base: `baeafec20ae9547900f9dd6a4abed371e8290b01`.

In `src/founder-os-lab/projectAdapters.ts`, change only:

`SEKRET_BIP_AUDITED_HEAD`
from `467da149bad1720f87885a991a924aa143eb2ddd`
to `61f9e074d5f10a7c5aaf9ff3238a33d9e3e0207d`.

Do not modify `CHIEF_AI_AUDITED_HEAD`; it is already current at `2fd4fda0cab12e52ab5096e723884d98bcfe7d10`.

Preserve every audited contract blob SHA and every authority/role/provider/action/rule field unchanged.

After applying the one-line source patch, delete this temporary request file. Final candidate must change only `src/founder-os-lab/projectAdapters.ts`.
