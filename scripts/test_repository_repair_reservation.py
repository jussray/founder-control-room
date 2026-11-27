#!/usr/bin/env python3
"""Real Postgres proof using checked-in schema migrations and synthetic rows."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
DB = "fcr_repair_reservation_ci"
COMMAND = ["sudo", "-n", "-u", "postgres", "psql", "-X", "-qAt",
           "-v", "ON_ERROR_STOP=1", "-h", "/var/run/postgresql", "-p", "5432", "-d", DB]
ENV = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C"}
P = "10000000-0000-4000-8000-000000000001"
Q = "10000000-0000-4000-8000-000000000002"
R = "20000000-0000-4000-8000-000000000001"
S = "20000000-0000-4000-8000-000000000002"
U = "20000000-0000-4000-8000-000000000003"
A = "30000000-0000-4000-8000-000000000001"
B = "30000000-0000-4000-8000-000000000002"
C = "30000000-0000-4000-8000-000000000003"
D = "30000000-0000-4000-8000-000000000004"


def query(sql, *, name="fcr-proof", failure=None):
    proc = subprocess.run(COMMAND, input="\\set VERBOSITY verbose\n"
                          + f"SET application_name = '{name}';\n" + sql,
                          text=True, capture_output=True, timeout=30, env=ENV)
    if failure:
        assert proc.returncode != 0 and failure in proc.stderr, (proc.returncode, proc.stderr)
        return ""
    assert proc.returncode == 0, proc.stderr
    return proc.stdout.strip()


def call(project=P, run=R, findings=(A,), user="founder-fixture", role="service_role"):
    ids = ",".join(f"'{x}'::uuid" for x in findings)
    return (f"SET ROLE {role}; SELECT public.reserve_repository_repair_mission("
            f"'{project}', '{run}', ARRAY[{ids}]::uuid[], '{user}');")


def main():
    if sys.argv[1:] != ["--disposable-ci-db"] or os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("Only run in an isolated GitHub Actions runner.")
    assert query("SELECT current_database();") == DB
    assert query("SELECT to_regclass('public.projects') IS NULL;") == "t"
    query("""
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    ALTER ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT current_user::text';
    """)
    for name in ("20260711030127_init_control_room_schema.sql",
                 "20260711211416_reconciliation.sql",
                 "20260715102916_federated_repository_verification.sql",
                 "20260715225222_enforce_free_first_repair_missions.sql",
                 "20260715230035_scope_repair_mission_policy_trigger.sql"):
        query((ROOT / "supabase" / "migrations" / name).read_text())
    query("""
    GRANT SELECT, INSERT, UPDATE ON public.projects, public.missions,
      public.repository_verification_runs, public.repository_findings,
      public.project_events, public.project_manifests TO service_role;
    ALTER TABLE public.project_events ADD CONSTRAINT fixture_rollback_failure
      CHECK (metadata->>'requested_by_user_id' <> 'rollback-test');
    """)
    # A missing reservation implementation must fail before the candidate is installed.
    query(call(), failure="42883")
    query((ROOT / "scripts/sql/repository-repair-reservation.sql").read_text())
    query(f"""
    INSERT INTO public.projects (id,slug,name,repo_identifier) VALUES
      ('{P}','fixture-p','Fixture P','fixture/p'), ('{Q}','fixture-q','Fixture Q','fixture/q');
    INSERT INTO public.repository_verification_runs
      (id,project_id,source,repository_provider,repository_identifier,signature_verified,
       overall_status,commit_sha,manifest_hash,branch,scanned_at,received_at) VALUES
      ('{R}', '{P}', 'active_scan','github','fixture/p',true,'failed',repeat('a',40),'fixture','main','2026-01-01','2026-01-01'),
      ('{S}', '{Q}', 'active_scan','github','fixture/q',true,'failed',repeat('b',40),'fixture','main','2026-01-01','2026-01-01'),
      ('{U}', '{Q}', 'active_scan','github','fixture/q',false,'failed',repeat('c',40),'fixture','main','2026-01-02','2026-01-02');
    INSERT INTO public.repository_findings
      (id,project_id,verification_run_id,mission_id,status,fingerprint,severity,category,title,detail,suggested_action) VALUES
      ('{A}','{P}','{R}',NULL,'open','check:a','high','check','Fixture A','Compiler diagnostic','Inspect A'),
      ('{B}','{P}','{R}',NULL,'open','check:b','medium','check','Fixture B','Test diagnostic','Inspect B'),
      ('{C}','{P}','{R}',NULL,'open','check:c','medium','check','Fixture C',NULL,NULL),
      ('{D}','{Q}','{U}',NULL,'open','check:d','medium','check','Fixture D',NULL,NULL);
    INSERT INTO public.project_manifests
      (project_id,commit_sha,content_hash,validation_status,parsed_manifest,observed_at) VALUES
      ('{P}',repeat('a',40),'fixture-a','valid',jsonb_build_object('buildAssist',
        jsonb_build_object('enabled',true,'preferredBuilder','codex','riskLevel','low')),'2026-01-01'),
      ('{P}',repeat('f',40),'fixture-stale','valid',jsonb_build_object('buildAssist',
        jsonb_build_object('enabled',true,'preferredBuilder','wrong-head','riskLevel','low')),'2026-01-02');
    """)
    for role in ("anon", "authenticated"):
        query(call(role=role), failure="42501")
    query(call(findings=(A,A)), failure="22023")
    query(call(findings=(D,)), failure="40001")
    query(call(project=Q, run=U, findings=(D,)), failure="22023")
    query(call(project=Q, run=S, findings=(D,)), failure="40001")
    query(call(findings=(C,), user="rollback-test"), failure="23514")
    assert query("SELECT count(*) FROM public.missions;") == "0"
    assert query(f"SELECT mission_id IS NULL FROM public.repository_findings WHERE id='{C}';") == "t"
    assert query("SELECT count(*) FROM public.project_events;") == "0"

    # Two independent database sessions: require observed contention, not just sequential calls.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(query, "BEGIN;" + call(findings=(B,A)) + "SELECT pg_sleep(6); COMMIT;",
                            name="fcr-reservation-first")
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if query("SELECT count(*) FROM pg_stat_activity WHERE application_name='fcr-reservation-first' AND wait_event='PgSleep';") == "1":
                break
            time.sleep(0.1)
        else:
            raise AssertionError("First session did not reach its lock-holding interval")
        second = pool.submit(query, call(findings=(A,B)), name="fcr-reservation-second")
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if query("SELECT count(*) FROM pg_stat_activity WHERE application_name='fcr-reservation-second' AND wait_event_type='Lock';") == "1":
                break
            time.sleep(0.1)
        else:
            raise AssertionError("Second session did not visibly contend for the lock")
        original = json.loads(first.result().splitlines()[0])
        retry = json.loads(second.result())
    assert original["created"] is True and retry["created"] is False
    assert original["mission_id"] == retry["mission_id"]
    assert original["mutation_authorized"] is False and retry["authority"] == "proposal_only"
    assert query("SELECT count(*) FROM public.missions;") == "1"
    assert query("SELECT count(*) FROM public.project_events;") == "1"
    assert query("SELECT count(*) FROM public.repository_findings WHERE mission_id IS NOT NULL;") == "2"
    query(call(findings=(A,C)), failure="40001")
    assert query(f"SELECT mission_id IS NULL FROM public.repository_findings WHERE id='{C}';") == "t"
    assert query("SELECT count(*) FROM public.missions WHERE status='proposed' AND policy_snapshot->>'authority'='proposal_only' AND policy_snapshot->'forbidden' ? 'automatic_merge';") == "1"
    assert query("SELECT count(*) FROM public.missions;") == "1"
    assert query("SELECT builder_agent FROM public.missions;") == "codex"
    assert query("SELECT risk_level FROM public.missions;") == "high"
    assert query("SELECT description LIKE '%Compiler diagnostic%' AND description LIKE '%Inspect B%' FROM public.missions;") == "t"
    assert query("SELECT required_checks = jsonb_build_array('check:a','check:b') FROM public.missions;") == "t"
    assert query("SELECT policy_snapshot->>'builder_preference_only' FROM public.missions;") == "true"
    print("PASS: real repository schema subset, role denial, rollback, contention, overlap, exact-head builder preference and risk floor")


if __name__ == "__main__":
    main()
