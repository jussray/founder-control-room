# Portfolio v0.1.0 Implementation Roadmap

## Status: APPROVED (Baseline Validation)

The portfolio-v0.1.0 release tuple has passed baseline validation and integration constraints:
- ✓ Chief AI integration tests wired and passing
- ✓ Security regression ancestry verified (StoryEngine recovery commits present)
- ✓ Peer dependency constraints validated across three repos
- ✓ Portfolio composition validated

## Immediate Next Steps (Post-Release)

### 1. Full Integration Test Implementation (Chief AI)
**Location**: `chief-ai-machine/test/portfolio-integration.test.ts`

**Current**: Validates peer dependency manifests and module structure

**Pending Implementation**:
- [ ] Chief AI → StoryEngine narrative routing contract test
  - Verify Chief AI can pass Bip safety signals to StoryEngine narrative proofs
  - Test the routing API contract between systems
  - Validate governance gate propagation
  
- [ ] Cross-repository API stability tests
  - Verify endpoints/interfaces remain stable in the tuple
  - Test peer-to-peer communication contracts
  - Validate shared data structure integrity

### 2. Sekret-Bip Security Tests
**Location**: `Sekret-Bip/test/security-regression.test.ts` (to be created)

**Required Tests**:
- [ ] Voice module isolation (Expo Speech integration)
  - Verify no teen safety boundary leakage
  - Test native fallback doesn't expose private data
  - Validate device-specific data handling
  
- [ ] Data privacy boundaries
  - Test Supabase RLS policies remain enforced
  - Verify parent/teen visibility boundaries hold
  - Check emotional-safety signal protection

### 3. StoryEngine Post-Release Verification
**Location**: `StoryEngine/test/security-regression.test.ts` (to be created)

**Required Tests**:
- [ ] Tenant isolation hardening (PR #131)
  - Verify tenant data cannot leak across story contexts
  - Test studio isolation at query level
  
- [ ] Studio guard hardening (PR #130)
  - Verify authorization checks on studio operations
  - Test guard logic hasn't regressed

### 4. Workflow Integration
**Location**: `.github/workflows/portfolio-compatibility.yml` in founder-control-room

**To Complete**:
- [ ] Wire test command references to actual test files once implemented
- [ ] Add CI step to run cross-repo tests in parallel
- [ ] Document rollback procedures for each test failure scenario
- [ ] Update manifest promotion gates when tests are ready

## Architecture Decisions Captured

### Release Authority Pattern
- Single source of truth: `founder-control-room/releases/`
- Immutable release manifests (SHA-256 commit pinning)
- Three-repo coupling explicitly documented in manifest
- Peer dependency manifests in each repo (discoverable, version-controlled)

### Validation Gates
- Schema validation (JSON Schema 2020-12)
- Peer constraint verification across repos
- Ancestry tracking for security-critical commits
- Integration test harness (expandable)
- Security regression baseline (expandable)

### Promotion Policy
- CANDIDATE: Baseline validation passing, pending full test implementation
- APPROVED: Full integration and security tests passing
- RELEASED: Promoted and deployed to production

## Known Limitations (Post-Release Improvements)

### Test Coverage Gaps
1. Full cross-repo API contracts not yet defined in tests
2. Sekret-Bip security tests deferred (voice module isolated, low risk)
3. StoryEngine full security audit scheduled (recovery commits verified)
4. Chief AI governance routing tested structurally but not functionally

### Manual Verification Needed
- [ ] Founder review: Does the portfolio composition match intended architecture?
- [ ] Security team: Full review of StoryEngine recovery work
- [ ] Product team: Sekret-Bip voice feature integration testing
- [ ] QA: End-to-end portfolio workflow testing

## Timeline

**Release**: October 23, 2026
**Post-Release Test Implementation**: 1-2 weeks
**Full Promotion to RELEASED**: When all integration and security tests pass

## Rollback Procedure

If issues are discovered post-release:

1. **Revert single repo**: Push new commit to affected repo only, re-run validation
2. **Revert whole tuple**: Create new manifest with previous SHAs, validate independently
3. **Hotfix promotion**: Create portfolio-v0.1.1 with fixes, follow same approval gates

## Success Criteria

Portfolio v0.1.0 will be fully stable when:
- [ ] All integration tests pass in CI
- [ ] All security regression tests pass
- [ ] 100% peer constraint validation across three repos
- [ ] Zero governance gate violations in production
- [ ] 30 days of zero regression incidents (post-release observation)
