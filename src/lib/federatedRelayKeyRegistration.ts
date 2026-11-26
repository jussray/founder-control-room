import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient.js';
import type { FounderPermissionFederatedRelayKeyTarget } from './founderPermissionBroker.js';

export const FEDERATED_RELAY_KEY_REGISTRATION_RECEIPT = 'juss/fcr-federated-relay-key-registration@v1' as const;

type RelayKeyRow = {
  key_id: string;
  member: string;
  algorithm: string;
  public_key_jwk: unknown;
  state: string;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  created_at: string;
};

function canonicalJwk(target: FounderPermissionFederatedRelayKeyTarget) {
  return { kty: 'OKP' as const, crv: 'Ed25519' as const, x: target.publicKeyJwk.x };
}

function sameRegistration(row: RelayKeyRow, target: FounderPermissionFederatedRelayKeyTarget): boolean {
  return row.key_id === target.keyId
    && row.member === 'promptos'
    && row.algorithm === 'Ed25519'
    && (row.public_key_jwk as Record<string, unknown>)?.kty === 'OKP'
    && (row.public_key_jwk as Record<string, unknown>)?.crv === 'Ed25519'
    && (row.public_key_jwk as Record<string, unknown>)?.x === target.publicKeyJwk.x
    && Object.keys(row.public_key_jwk as Record<string, unknown>).length === 3
    && Date.parse(row.valid_from) === Date.parse(target.validFrom)
    && (row.valid_until === null ? target.validUntil === null : target.validUntil !== null && Date.parse(row.valid_until) === Date.parse(target.validUntil))
    && row.state === 'active'
    && row.revoked_at === null;
}

function receipt(row: RelayKeyRow, target: FounderPermissionFederatedRelayKeyTarget, disposition: 'REGISTERED' | 'ALREADY_REGISTERED') {
  return {
    contract: FEDERATED_RELAY_KEY_REGISTRATION_RECEIPT,
    member: 'promptos' as const,
    keyId: target.keyId,
    algorithm: 'Ed25519' as const,
    publicKeyHash: createHash('sha256').update(JSON.stringify(canonicalJwk(target))).digest('hex'),
    state: row.state,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    disposition,
    outcomeVerified: true as const,
    executionAuthorized: false as const,
  };
}

type RelayKeyDatabase = Pick<SupabaseClient, 'from'>;

async function readKey(db: RelayKeyDatabase, keyId: string): Promise<{ row: RelayKeyRow | null; error: unknown }> {
  const { data, error } = await db.from('federated_relay_public_keys')
    .select('key_id,member,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at,created_at')
    .eq('key_id', keyId)
    .maybeSingle();
  return { row: data as RelayKeyRow | null, error };
}

export async function registerFederatedRelayPublicKey(
  target: FounderPermissionFederatedRelayKeyTarget,
  db: RelayKeyDatabase = supabase,
) {
  const existing = await readKey(db, target.keyId);
  if (existing.error) throw new Error('FCR_RELAY_KEY_LOOKUP_FAILED');
  if (existing.row) {
    if (!sameRegistration(existing.row, target)) throw new Error('FCR_RELAY_KEY_ID_CONFLICT');
    return receipt(existing.row, target, 'ALREADY_REGISTERED');
  }

  const { data, error } = await db.from('federated_relay_public_keys').insert({
    key_id: target.keyId,
    member: 'promptos',
    algorithm: 'Ed25519',
    public_key_jwk: canonicalJwk(target),
    state: 'active',
    valid_from: target.validFrom,
    valid_until: target.validUntil,
  }).select('key_id,member,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at,created_at').single();

  if (error || !data) {
    const winner = await readKey(db, target.keyId);
    if (!winner.error && winner.row && sameRegistration(winner.row, target)) {
      return receipt(winner.row, target, 'ALREADY_REGISTERED');
    }
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === '23505' || (!winner.error && winner.row)) {
      throw new Error('FCR_RELAY_KEY_ID_CONFLICT');
    }
    throw new Error('FCR_RELAY_KEY_INSERT_FAILED');
  }

  const inserted = data as RelayKeyRow;
  if (!sameRegistration(inserted, target)) throw new Error('FCR_RELAY_KEY_READBACK_MISMATCH');
  return receipt(inserted, target, 'REGISTERED');
}
