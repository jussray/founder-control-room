export function relayStopReason(input: { verified: boolean; blocked: boolean; expired: boolean }): 'verified' | 'blocked' | 'expired' | 'continue' {
  if (input.verified) return 'verified';
  if (input.blocked) return 'blocked';
  if (input.expired) return 'expired';
  return 'continue';
}
