/**
 * FCR-owned Sprite inventory. Names are provider locators, never authorization.
 *
 * Each runtime is private and separately gated. The public customer MCP must
 * not expose either backend or treat a successful tool reply as release proof.
 */
export const FCR_SPRITES = Object.freeze({
  readOnlyExecutor: Object.freeze({
    name: 'fcr-governed-exec',
    role: 'bounded-read-only-terminal',
    activatedByDefault: false,
    publicMcpAccessible: false,
    canMerge: false,
    canDeploy: false,
  }),
  productionVerifier: Object.freeze({
    name: 'fcr-production-proof',
    role: 'isolated-browser-and-runtime-verification',
    activatedByDefault: false,
    publicMcpAccessible: false,
    canMerge: false,
    canDeploy: false,
  }),
} as const);
