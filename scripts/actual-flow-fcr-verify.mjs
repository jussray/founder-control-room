// ACTUAL-FLOW V5.2: offline FCR evidence verification ONLY.
// No network calls, cookies, credential discovery, publishing, or mutation authority.
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";

export class ProvenanceError extends Error {
  constructor(message) { super(message); this.name = "ProvenanceError"; }
}
const MANIFEST = ["schema_version","issuer","key_id","audience","source_id","source_sha256","origin","resource","capture_id","captured_at","expires_at","record_type"];
const BUNDLE = ["manifest","source_bytes_base64","signature_base64"];
const DOMAIN = Buffer.from("ACTUAL-FLOW-FCR-EVIDENCE-V1\u0000", "utf8");
const SHA = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9._-]{1,128}$/;
const CAPTURE = /^capture:[a-z0-9][a-z0-9._-]{0,127}$/;
const SOURCE = /^src:[a-z0-9][a-z0-9._/-]*$/;
const KEY = /^key:[a-z0-9][a-z0-9._-]{0,127}$/;
const ISSUER = /^fcr:[a-z0-9][a-z0-9._-]{0,127}$/;

function fail(message) { throw new ProvenanceError(message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, expected) {
  return object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}
function canonical(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    if (value !== value.normalize("NFC")) fail("noncanonical Unicode");
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).sort().map(k => {
    if (k !== k.normalize("NFC")) fail("noncanonical key");
    return JSON.stringify(k) + ":" + canonical(value[k]);
  }).join(",") + "}";
  return fail("unsupported canonical value");
}
function decode64(value, max) {
  if (typeof value !== "string" || !value.length || value.length > 2_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail("invalid base64");
  const b = Buffer.from(value, "base64");
  if (b.length > max || b.toString("base64") !== value) fail("noncanonical or oversized base64");
  return b;
}
function stamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) fail("invalid timestamp");
  const t = Date.parse(value);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== value.replace("Z", ".000Z")) fail("noncanonical timestamp");
  return t;
}
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function verifyFcrEvidence(bundleBytes, policy) {
  if (!Buffer.isBuffer(bundleBytes) || bundleBytes.length > 1_500_000 || !object(policy)) fail("invalid input");
  if (!ISSUER.test(policy.issuer || "") || !KEY.test(policy.keyId || "") ||
      typeof policy.origin !== "string" || !/^https:\/\/[a-z0-9.-]+$/.test(policy.origin) ||
      policy.audience !== "actual-flow-agent") fail("invalid independently configured trust policy");
  const pin = decode64(policy.publicKeyBase64, 32);
  if (pin.length !== 32) fail("invalid public key pin");
  let b;
  try { b = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bundleBytes)); }
  catch { fail("invalid evidence JSON"); }
  if (!exactKeys(b, BUNDLE) || !exactKeys(b.manifest, MANIFEST)) fail("wrong schema");
  if (!Buffer.from(canonical(b), "utf8").equals(bundleBytes)) fail("noncanonical evidence bytes");
  const m = b.manifest;
  if (Object.values(m).some(x => typeof x !== "string") ||
      m.schema_version !== "actual-flow-fcr-evidence-v1" ||
      m.record_type !== "engagement-json-v1" || m.audience !== policy.audience ||
      m.issuer !== policy.issuer || m.key_id !== policy.keyId || m.origin !== policy.origin ||
      !SOURCE.test(m.source_id) || !SHA.test(m.source_sha256) ||
      !/^\/v1\/actual-flow\/evidence\/([A-Za-z0-9._-]{1,128})$/.test(m.resource) ||
      !CAPTURE.test(m.capture_id)) fail("manifest does not match pinned trust scope");
  if (policy.evidenceId && (!ID.test(policy.evidenceId) || m.resource !== "/v1/actual-flow/evidence/" + policy.evidenceId))
    fail("requested resource mismatch");
  const now = policy.now instanceof Date ? policy.now.getTime() : Date.now();
  if (!Number.isFinite(now)) fail("invalid verification clock");
  const from = stamp(m.captured_at), until = stamp(m.expires_at);
  if (from > now + 60_000 || now >= until || until <= from ||
      until - from > 86_400_000 || now - from > 86_400_000) fail("invalid evidence lifetime");
  const source = decode64(b.source_bytes_base64, 524_288);
  if (sha(source) !== m.source_sha256) fail("source digest mismatch");
  let metrics;
  try { metrics = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(source)); }
  catch { fail("invalid metric source"); }
  if (!exactKeys(metrics, ["impressions", "engagements"]) ||
      !Number.isSafeInteger(metrics.impressions) || metrics.impressions <= 0 ||
      !Number.isSafeInteger(metrics.engagements) || metrics.engagements < 0 ||
      metrics.engagements > metrics.impressions) fail("unsupported metric source");
  const sig = decode64(b.signature_base64, 64);
  if (sig.length !== 64) fail("invalid Ed25519 signature");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100","hex"), pin]);
  const publicKey = createPublicKey({ key:spki, format:"der", type:"spki" });
  const signed = Buffer.concat([DOMAIN, Buffer.from(canonical(m),"utf8")]);
  if (!verifySignature(null, signed, publicKey, sig)) fail("signature mismatch");
  return Object.freeze({
    verdict: "SIGNATURE_VERIFIED_WITH_PINNED_KEY",
    source_id: m.source_id,
    source_sha256: m.source_sha256,
    manifest_sha256: sha(Buffer.from(canonical(m),"utf8")),
    issuer: m.issuer, capture_id: m.capture_id, expires_at: m.expires_at,
    limitation: "Signed source evidence only; no proof of execution, deployment, runtime, or founder approval."
  });
}
