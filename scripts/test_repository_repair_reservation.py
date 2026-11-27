#!/usr/bin/env python3
"""Real Postgres proof using synthetic fixture tables; never targets a hosted DB."""
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
    CREATE TABLE public.projects (id uuid PRIMARY KEY);
    CREATE TABLE public.repository_verification_runs (
      id uuid PRIMARY KEY, project_id uuid REFERENCES public.projects(id),
      signature_verified boolean, overall_status text, commit_sha text, branch text, received_at timestamptz
    );
    CREATE TABLE public.missions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES public.projects(id),
      title text, description text, status text, base_ref text, risk_level text,
      required_checks text[], policy_snapshot jsonb
    );
    CREATE TABLE public.repository_findings (
      id uuid PRIMARY KEY, project_id uuid REFERENCES public.projects(id),
      verification_run_id uuid REFERENCES public.repository_verification_runs(id),
      mission_id uuid REFERENCES public.missions(id), status text, fingerprint text, severity text
    );
    CREATE TABLE public.project_events (
      project_id uuid REFERENCES public.projects(id), event_type text, severity text, decision text,
      metadata jsonb CHECK (metadata->>'requested_by_user_id' <> 'rollback-test')
    );
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
    """)
    for name in ("20260715225222_enforce_free_first_repair_missions.sql",
                 "20260715230035_scope_repair_mission_policy_trigger.sql"):
        query((ROOT / "supabase" / "migrations" / name).read_text())
    # A missing reservation implementation must fail before the candidate is installed.
    query(call(), failure="42883")
    query((ROOT / "scripts/sql/repository-repair-reservation.sql").read_text())
    query(f"""
    INSERT INTO public.projects VALUES ('{P}'), ('{Q}');
    INSERT INTO public.repository_verification_runs VALUES
      ('{R}', '{P}', true, 'failed', repeat('a',40), 'main', '2026-01-01'),
      ('{S}', '{Q}', true, 'failed', repeat('b',40), 'main', '2026-01-01'),
      ('{U}', '{Q}', false, 'failed', repeat('c',40), 'main', '2026-01-02');
    INSERT INTO public.repository_findings VALUES
      ('{A}','{P}','{R}',NULL,'open','check:a','high'),
      ('{B}','{P}','{R}',NULL,'open','check:b','medium'),
      ('{C}','{P}','{R}',NULL,'open','check:c','medium'),
      ('{D}','{Q}','{U}',NULL,'open','check:d','medium');
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
    print("PASS: synthetic real PostgreSQL reservation, role denial, stale/unsigned/cross-project rejection, rollback, concurrent retry, overlap conflict and policy trigger")


if __name__ == "__main__":
    main()
