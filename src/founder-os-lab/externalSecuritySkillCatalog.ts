// Generated from docs/security-skill-catalog.v1.json; pinned metadata only.
export const externalSecuritySkillCatalog = {
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
} as const;
