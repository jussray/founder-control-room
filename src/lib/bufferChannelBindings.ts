export const BUFFER_CHANNEL_BINDINGS = Object.freeze({
  juss_and_co_facebook: Object.freeze({
    providerChannelId: '6a5f0c94e2638b94d7a79168',
    service: 'facebook',
  }),
  juss_fn_ray_instagram: Object.freeze({
    providerChannelId: '6a6d04b94b2d03035f78b40f',
    service: 'instagram',
  }),
  juss_rayy_linkedin: Object.freeze({
    providerChannelId: '6a5f01cce2638b94d7a74f4c',
    service: 'linkedin',
  }),
} as const);

export type BufferLogicalChannel = keyof typeof BUFFER_CHANNEL_BINDINGS;

export function resolveBufferChannelBinding(channel: string) {
  const normalized = channel.trim() as BufferLogicalChannel;
  const binding = BUFFER_CHANNEL_BINDINGS[normalized];
  if (!binding) throw new Error(`BUFFER_CHANNEL_BINDING_UNKNOWN:${channel.trim() || '<empty>'}`);
  return {
    logicalChannel: normalized,
    providerChannelId: binding.providerChannelId,
    service: binding.service,
  };
}
