import { createHash, verify } from 'node:crypto';

const gates = ['pin-revision', 'license-review', 'security-review', 'sandbox-proof', 'runtime-compatibility', 'founder-approval'];
const scopeKeys = ['skillId', 'repository', 'revision', 'destination', 'artifactSha256'];
const hex = (value, size) => typeof value === 'string' && value.length === size && /^[a-f0-9]+$/.test(value);
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const digest = data => createHash('sha256').update(data).digest('hex');

export function receiptPayload(receipt) {
  return Buffer.from(JSON.stringify(['juss/external-skill-receipt/v1', ...scopeKeys.map(key => receipt[key]), receipt.gate, receipt.evidenceSha256, receipt.keyId, receipt.issuedAt, receipt.expiresAt]));
}
export function approvalDigest(receipts) {
  return digest(JSON.stringify(gates.slice(0,-1).map(gate => {
    const receipt = receipts.find(item => item.gate === gate);
    return [gate, digest(receiptPayload(receipt)), receipt.signature];
  })));
}

// Scope, keyring and clock must come from the trusted server, not the requester.
// A complete review is not permission to execute or substitute for the kernel.
export function reviewReceipts(scope, receipts, trust, now = Date.now()) {
  const reasons = [];
  const result = () => ({ reviewComplete: reasons.length === 0, executionAllowed: false, reasons });
  if (!scope || !identifier(scope.skillId) || typeof scope.repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(scope.repository) || !hex(scope.revision,40) || !hex(scope.artifactSha256,64) || !['fcr','chief','promptos','skills-library','medusa'].includes(scope.destination) || !Number.isSafeInteger(now)) {
    reasons.push('invalid-scope'); return result();
  }
  if (!Array.isArray(receipts) || receipts.length !== gates.length || !(trust instanceof Map)) {
    reasons.push('invalid-receipts-or-trust'); return result();
  }
  for (const gate of gates) {
    const matching = receipts.filter(receipt => receipt?.gate === gate);
    if (matching.length !== 1) { reasons.push(gate+':missing-or-duplicate'); continue; }
    const receipt = matching[0];
    if (scopeKeys.some(key => receipt[key] !== scope[key]) || !hex(receipt.evidenceSha256,64)) { reasons.push(gate+':scope'); continue; }
    if (!Number.isSafeInteger(receipt.issuedAt) || !Number.isSafeInteger(receipt.expiresAt) || receipt.issuedAt > now || receipt.expiresAt <= now || receipt.expiresAt <= receipt.issuedAt) { reasons.push(gate+':time'); continue; }
    const key = trust.get(receipt.keyId);
    try {
      if (!key || !Array.isArray(key.gates) || !key.gates.includes(gate) || key.publicKey?.asymmetricKeyType !== 'ed25519' || typeof receipt.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(receipt.signature) || !verify(null, receiptPayload(receipt), key.publicKey, Buffer.from(receipt.signature,'base64'))) reasons.push(gate+':signature-or-role');
    } catch { reasons.push(gate+':signature-or-role'); }
  }
  if (!reasons.length) {
    const approval = receipts.find(receipt => receipt.gate === 'founder-approval');
    if (approval.evidenceSha256 !== approvalDigest(receipts) || receipts.some(receipt => receipt.gate !== 'founder-approval' && receipt.issuedAt > approval.issuedAt)) reasons.push('founder-approval:evidence-changed');
  }
  return result();
}
