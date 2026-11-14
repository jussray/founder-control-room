import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyFcrEvidence, ProvenanceError } from "../scripts/actual-flow-fcr-verify.mjs";

const canon = value => {
  if (Array.isArray(value)) return "[" + value.map(canon).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+canon(value[k])).join(",") + "}";
  return JSON.stringify(value);
};
function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pin = publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("base64");
  const now = new Date("2026-10-20T12:00:00Z");
  const source = Buffer.from('{"impressions":81,"engagements":6}',"utf8");
  const manifest = {
    schema_version:"actual-flow-fcr-evidence-v1", issuer:"fcr:synthetic", key_id:"key:synthetic",
    audience:"actual-flow-agent", source_id:"src:synthetic/earlier",
    source_sha256:createHash("sha256").update(source).digest("hex"),
    origin:"https://api.foundercontrolroom.org",
    resource:"/v1/actual-flow/evidence/synthetic-1", capture_id:"capture:synthetic-1",
    captured_at:"2026-10-20T11:59:00Z", expires_at:"2026-10-20T12:10:00Z",
    record_type:"engagement-json-v1"
  };
  const payload = Buffer.concat([Buffer.from("ACTUAL-FLOW-FCR-EVIDENCE-V1\u0000","utf8"),Buffer.from(canon(manifest),"utf8")]);
  const signature_base64 = sign(null,payload,privateKey).toString("base64");
  const bundle = {manifest,source_bytes_base64:source.toString("base64"),signature_base64};
  const policy = {issuer:"fcr:synthetic",keyId:"key:synthetic",origin:"https://api.foundercontrolroom.org",
    audience:"actual-flow-agent",publicKeyBase64:pin,evidenceId:"synthetic-1",now};
  return {bundle,policy};
}
const encode = x => Buffer.from(canon(x),"utf8");
const invalid = f => assert.throws(f,ProvenanceError);
test("pinned signature + exact source verifies; does not claim runtime proof", () => {
  const {bundle,policy}=fixture();
  const result=verifyFcrEvidence(encode(bundle),policy);
  assert.equal(result.verdict,"SIGNATURE_VERIFIED_WITH_PINNED_KEY");
  assert.match(result.limitation,/no proof of execution/);
});
test("tampered exact source bytes rejected", () => {
  const {bundle,policy}=fixture();bundle.source_bytes_base64=Buffer.from('{"impressions":82,"engagements":6}').toString("base64");
  invalid(()=>verifyFcrEvidence(encode(bundle),policy));
});
test("independent key pin required", () => {
  const {bundle,policy}=fixture();policy.publicKeyBase64="";
  invalid(()=>verifyFcrEvidence(encode(bundle),policy));
});
test("issuer substitution rejected", () => {
  const {bundle,policy}=fixture();bundle.manifest.issuer="fcr:other";
  invalid(()=>verifyFcrEvidence(encode(bundle),policy));
});
test("resource substitution rejected", () => {
  const {bundle,policy}=fixture();policy.evidenceId="different";
  invalid(()=>verifyFcrEvidence(encode(bundle),policy));
});
test("noncanonical envelope bytes rejected", () => {
  const {bundle,policy}=fixture();
  invalid(()=>verifyFcrEvidence(Buffer.from(JSON.stringify(bundle,null,2)),policy));
});
test("expired evidence rejected", () => {
  const {bundle,policy}=fixture();policy.now=new Date("2026-10-21T12:00:00Z");
  invalid(()=>verifyFcrEvidence(encode(bundle),policy));
});
test("altered signature rejected", () => {
  const {bundle,policy}=fixture();bundle.signature_base64=Buffer.alloc(64,99).toString("base64");
  invalid(()=>verifyFcrEvidence(encode(bundle),policy));
});
test("extra manifest fields rejected", () => {
  const {bundle,policy}=fixture();bundle.manifest.untrusted="unexpected";
  invalid(()=>verifyFcrEvidence(encode(bundle),policy));
});
