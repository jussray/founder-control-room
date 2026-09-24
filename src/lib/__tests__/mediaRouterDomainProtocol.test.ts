import { describe, expect, it } from 'vitest';

import {
  MEDIA_REQUEST_V1,
  MEDIA_RIGHTS_CHANGE_V1,
  MEDIA_ROUTER_DOMAIN_PROTOCOL_V1,
  MEDIA_ROUTER_OUTPUT_V1,
  parseDomainApprovalReferenceV1,
  parseDomainMediaContextV1,
  parseMediaRequestV1,
  parseMediaRightsChangeV1,
  parseMediaRouterOutputV1,
} from '../mediaRouterDomainProtocol.js';

describe('Media Router ↔ Domain Protocol v1', () => {
  it('requires a release receipt for published_release context', () => {
    expect(() =>
      parseDomainMediaContextV1({
        schema: MEDIA_ROUTER_DOMAIN_PROTOCOL_V1,
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        releaseState: 'published_release',
        approvalReferences: [],
        identityReferenceAssetIds: [],
      }),
    ).toThrow(/releaseReceiptId is required/);

    expect(
      parseDomainMediaContextV1({
        schema: MEDIA_ROUTER_DOMAIN_PROTOCOL_V1,
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        releaseState: 'published_release',
        releaseReceiptId: 'release-receipt-1',
        approvalReferences: [],
        identityReferenceAssetIds: [],
      }).releaseReceiptId,
    ).toBe('release-receipt-1');
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

  it('keeps publication and approval authority literal-false at the router output boundary', () => {
    const valid = {
      schema: MEDIA_ROUTER_OUTPUT_V1,
      requestId: 'request-1',
      assetIds: ['asset-1'],
      publicationAuthorized: false,
      releasePermitted: false,
      commercialRightsCleared: false,
      factualClaimsApproved: false,
      regulatedClaimsApproved: false,
      crossProjectReuseApproved: false,
      upstreamAuthorityReferences: ['release-receipt-1'],
    } as const;

    expect(parseMediaRouterOutputV1(valid)).toEqual(valid);

    expect(() =>
      parseMediaRouterOutputV1({
        ...valid,
        publicationAuthorized: true,
      }),
    ).toThrow(/publicationAuthorized must be literal false/);

    expect(() =>
      parseMediaRouterOutputV1({
        ...valid,
        releasePermitted: true,
      }),
    ).toThrow(/releasePermitted must be literal false/);
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

  it('requires upstream authority for rights-sensitive changes', () => {
    expect(() =>
      parseMediaRightsChangeV1({
        schema: MEDIA_RIGHTS_CHANGE_V1,
        assetId: 'asset-1',
        change: 'commercial_rights',
      }),
    ).toThrow(/upstreamAuthorityReference must be a non-empty string/);

    expect(
      parseMediaRightsChangeV1({
        schema: MEDIA_RIGHTS_CHANGE_V1,
        assetId: 'asset-1',
        change: 'cross_project_reuse',
        upstreamAuthorityReference: 'domain-approval-22',
      }).upstreamAuthorityReference,
    ).toBe('domain-approval-22');
  });

  it('rejects unknown fields so authority cannot expand without a contract version change', () => {
    expect(() =>
      parseMediaRouterOutputV1({
        schema: MEDIA_ROUTER_OUTPUT_V1,
        requestId: 'request-1',
        assetIds: [],
        publicationAuthorized: false,
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
