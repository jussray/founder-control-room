// Immutable v1 catalog witness. No network, execution hooks, or application imports.
const fs = require('node:fs');
const path = require('node:path');
const reference = {
  "schema_version": 1,
  "kind": "external_skill_catalog",
  "scope": "read-only documentation and provenance; not an execution registry",
  "execution_enabled": false,
  "auto_fetch": false,
  "auto_handoff": false,
  "owner_approval_required_for_disclosure": true,
  "records": [
    {
      "id": "aegis",
      "version": "1.1",
      "repository": "jussray/aegis",
      "commit": "1ae4dfea8198e374b4370044aa58c047b8cd4ad2",
      "path": "skill v1",
      "blob": "64ad1ca2a26a6582dbcce8a299a20692276daec3",
      "purpose": "defensive review",
      "ci": {
        "run_id": 45334331047,
        "conclusion": "success"
      }
    },
    {
      "id": "sarissa",
      "version": "1.0",
      "repository": "jussray/sarissa",
      "commit": "5177bf86c290a0d6800544085c42b6e34f58d54e",
      "path": "skill v1",
      "blob": "b4d322071a8461d3da71f1996fa2a50588ec5a97",
      "purpose": "offline assessment planning and reporting",
      "ci": {
        "run_id": 45334342596,
        "conclusion": "success"
      }
    },
    {
      "id": "medusa",
      "version": "1.1",
      "repository": "jussray/medusa",
      "commit": "07b67222b28cc824c6da5b91b6f56b13da43e125",
      "path": "medusa-v1_1-SKILL.md",
      "blob": "e83d073902930b68415561b6e9ffc953467a6506",
      "purpose": "offline decision review",
      "ci": {
        "run_id": 45334344621,
        "conclusion": "success"
      }
    }
  ],
  "historical": [
    {
      "id": "aegis-v1.0",
      "repository": "jussray/aegis",
      "commit": "1ae4dfea8198e374b4370044aa58c047b8cd4ad2",
      "path": "archive/aegis-v1.0.md",
      "blob": "0c99cc28450776880a09728807b0d9c0d1bf1c6f"
    }
  ],
  "evidence_scope": "previously observed exact-head CI and source identities; no runtime or production claim",
  "observed_on": "2026-11-24"
};
function validateCatalog(input,reference){
 function equal(a,b,path){
  if(b===null||typeof b!=="object"){if(a!==b)throw Error("mismatch: "+path);return}
  if(a===null||typeof a!=="object"||Array.isArray(a)!==Array.isArray(b))throw Error("invalid type: "+path);
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  if(JSON.stringify(ak)!==JSON.stringify(bk))throw Error("unexpected or missing keys: "+path);
  for(const key of bk)equal(a[key],b[key],path+"."+key);
 }
 equal(input,reference,"catalog");
}
function tests(validate,catalog){
 const clone=()=>JSON.parse(JSON.stringify(catalog));
 const mutations=[
 ["execution enabled",x=>x.execution_enabled=true],["automatic fetch",x=>x.auto_fetch=true],["automatic handoff",x=>x.auto_handoff=true],["missing approval",x=>delete x.owner_approval_required_for_disclosure],["duplicate id",x=>x.records.push(x.records[0])],["wrong repository",x=>x.records[2].repository="jussray/juss-protect-me-2"],["invalid commit",x=>x.records[0].commit="main"],["changed blob",x=>x.records[0].blob="0".repeat(40)],["missing history",x=>x.historical=[]],["unrecognized field",x=>x.records[0].command="unexpected"],["false CI claim",x=>x.records[0].ci.run_id=1],["unsafe path",x=>x.records[1].path="../skill"]];
 let failures=[];
 try{validate(clone())}catch(e){failures.push("valid catalog rejected: "+e.message)}
 for(const [name,change] of mutations){const x=clone();change(x);let rejected=false;try{validate(x)}catch(e){rejected=true}if(!rejected)failures.push(name)}
 return {total:mutations.length+1,failures};
}
const input = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'security-skill-catalog.v1.json'), 'utf8'));
validateCatalog(input,reference);
const result = tests(x=>validateCatalog(x,reference),input);
if(result.failures.length) throw Error(JSON.stringify(result));
console.log(JSON.stringify({scope:'immutable catalog only; external CI and runtime not rechecked',...result}));
