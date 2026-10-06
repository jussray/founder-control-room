import { describe, expect, it } from 'vitest';

import {
  MEDIA_DOMAIN_AUTHORITY_GRANT_V1,
  MEDIA_REQUEST_V1,
  MEDIA_RIGHTS_CHANGE_V1,
  MEDIA_ROUTER_DOMAIN_PROTOCOL_V1,
  MEDIA_ROUTER_OUTPUT_V1,
  assertDomainAuthorityGrantResolvable,
  assertMediaRouterOutputAuthority,
  parseDomainApprovalReferenceV1,
  parseDomainAuthorityGrantV1,
  parseDomainMediaContextV1,
  parseMediaRequestV1,
  parseMediaRightsChangeV1,
  parseMediaRouterOutputV1,
} from '../mediaRouterDomainProtocol.js';

const releaseGrant = {
  schema: MEDIA_DOMAIN_AUTHORITY_GRANT_V1,
  kind: 'release',
  sourceProtocol: 'MAKEVIDEO',
  sourceRecordId: 'makevideo-release-1',
  assertedAt: '2026-09-24T03:00:00.000Z',
  approvalLevel: 'release_approved',
  authorityGranted: true,
} as const;

const releaseContext = {
  schema: MEDIA_ROUTER_DOMAIN_PROTOCOL_V1,
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  releaseState: 'published_release',
  releaseReceiptId: 'release-receipt-1',
  approvalReferences: [],
  authorityGrants: [releaseGrant],
  identityReferenceAssetIds: [],
} as const;

describe('Media Router ↔ Domain Protocol v1', () => {
  it('requires a release receipt for published_release context', () => {
    expect(() =>
      parseDomainMediaContextV1({
        schema: MEDIA_ROUTER_DOMAIN_PROTOCOL_V1,
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        releaseState: 'published_release',
        approvalReferences: [],
        authorityGrants: [],
        identityReferenceAssetIds: [],
      }),
    ).toThrow(/releaseReceiptId is required/);

    expect(parseDomainMediaContextV1(releaseContext).releaseReceiptId).toBe('release-receipt-1');
  });

  it('requires a reason for manual authority', () => {
    expect(() =>
      parseDomainApprovalReferenceV1({
        kind: 'manual',
        authorityId: 'founder-approval-1',
        issuedAt: '2026-09-24T03:00:00.000Z',
      }),
    ).toThrow(/reason is required for manual authority/);

    expect(
      parseDomainApprovalReferenceV1({
        kind: 'manual',
        authorityId: 'founder-approval-1',
        issuedAt: '2026-09-24T03:00:00.000Z',
        reason: 'Founder explicitly cleared this exact release scope.',
      }).reason,
    ).toMatch(/exact release scope/);
  });

  it('allows a real domain protocol to issue authorityGranted=true', () => {
    expect(parseDomainAuthorityGrantV1(releaseGrant)).toEqual(releaseGrant);
    expect(assertDomainAuthorityGrantResolvable(releaseGrant, (id) => id === 'makevideo-release-1')).toBe(true);
    expect(() => assertDomainAuthorityGrantResolvable(releaseGrant, () => false)).toThrow(/source record not found/);

    expect(() =>
      parseDomainAuthorityGrantV1({ ...releaseGrant, approvalLevel: 'none' }),
    ).toThrow(/cannot be none/);
  });

  it('keeps router publication false while allowing bounded domain approvals to be true', () => {
    const valid = {
      schema: MEDIA_ROUTER_OUTPUT_V1,
      requestId: 'request-1',
      assetIds: ['asset-1'],
      publicationAuthorized: false,
      domainAuthorityGranted: true,
      releasePermitted: true,
      commercialRightsCleared: false,
      factualClaimsApproved: false,
      regulatedClaimsApproved: false,
      crossProjectReuseApproved: false,
      upstreamAuthorityReferences: ['makevideo-release-1'],
    } as const;

    expect(parseMediaRouterOutputV1(valid)).toEqual(valid);
    expect(assertMediaRouterOutputAuthority(valid, releaseContext)).toEqual(valid);

    expect(() =>
      parseMediaRouterOutputV1({ ...valid, publicationAuthorized: true }),
    ).toThrow(/publicationAuthorized must be literal false/);

    expect(() =>
      parseMediaRouterOutputV1({ ...valid, domainAuthorityGranted: false }),
    ).toThrow(/domainAuthorityGranted must be true/);
  });

  it('refuses true approvals without matching upstream domain authority', () => {
    const output = {
      schema: MEDIA_ROUTER_OUTPUT_V1,
      requestId: 'request-1',
      assetIds: ['asset-1'],
      publicationAuthorized: false,
      domainAuthorityGranted: true,
      releasePermitted: true,
      commercialRightsCleared: false,
      factualClaimsApproved: false,
      regulatedClaimsApproved: false,
      crossProjectReuseApproved: false,
      upstreamAuthorityReferences: ['missing-release-record'],
    } as const;
    expect(() => assertMediaRouterOutputAuthority(output, releaseContext)).toThrow(/unresolved domain authority/);
  });

  it('accepts compose, transcode, and overlay as first-class intents and rejects unknown intent additions', () => {
    const base = {
      schema: MEDIA_REQUEST_V1,
      requestId: 'request-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      sourceAssetIds: ['asset-1'],
      requestedAssetKind: 'video',
    } as const;

    for (const intent of ['compose', 'transcode', 'overlay'] as const) {
      expect(parseMediaRequestV1({ ...base, intent }).intent).toBe(intent);
    }

    expect(() => parseMediaRequestV1({ ...base, intent: 'magic_upscale_plus' })).toThrow(
      /intent must be one of/,
    );
  });

  it('requires a true upstream authority grant for rights-sensitive changes', () => {
    expect(() =>
      parseMediaRightsChangeV1({
        schema: MEDIA_RIGHTS_CHANGE_V1,
        assetId: 'asset-1',
        change: 'commercial_rights',
        upstreamAuthorityReference: 'domain-approval-22',
        authorityGranted: false,
      }),
    ).toThrow(/authorityGranted must be literal true/);

    expect(
      parseMediaRightsChangeV1({
        schema: MEDIA_RIGHTS_CHANGE_V1,
        assetId: 'asset-1',
        change: 'cross_project_reuse',
        upstreamAuthorityReference: 'domain-approval-22',
        authorityGranted: true,
      }).authorityGranted,
    ).toBe(true);
  });

  it('rejects unknown fields so authority cannot expand without a contract version change', () => {
    expect(() =>
      parseMediaRouterOutputV1({
        schema: MEDIA_ROUTER_OUTPUT_V1,
        requestId: 'request-1',
        assetIds: [],
        publicationAuthorized: false,
        domainAuthorityGranted: false,
        releasePermitted: false,
        commercialRightsCleared: false,
        factualClaimsApproved: false,
        regulatedClaimsApproved: false,
        crossProjectReuseApproved: false,
        upstreamAuthorityReferences: [],
        secretlyPublishNow: true,
      }),
    ).toThrow(/unsupported field\(s\): secretlyPublishNow/);
  });
});
