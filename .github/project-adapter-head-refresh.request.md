# Temporary patch request

Exact base: `24a3df02849e9a8d0f0cb155e9250afb2b6a8257`.

In `src/founder-os-lab/projectAdapters.ts`, change only these two constants:

- `SEKRET_BIP_AUDITED_HEAD` from `467da149bad1720f87885a991a924aa143eb2ddd` to `61f9e074d5f10a7c5aaf9ff3238a33d9e3e0207d`
- `CHIEF_AI_AUDITED_HEAD` from `fad147d1fbcc1cafbdf6e4d570a2a565c8335ce0` to `2fd4fda0cab12e52ab5096e723884d98bcfe7d10`

Preserve every audited contract blob unchanged. Do not change authority, executionAllowed, providers, actions, roles, rules, or any other file content.

After applying the two-line patch, delete this temporary request file so the final PR contains only `src/founder-os-lab/projectAdapters.ts`.
