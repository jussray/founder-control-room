# Founder Control Room database smoke test

This is a local/admin-only connectivity check for the Founder Control Room Supabase Postgres database.

## Scope

- Project ref: `oojzfmmywbvficgybaxd`
- Host: `db.oojzfmmywbvficgybaxd.supabase.co`
- Port: `5432`
- Database: `postgres`
- User: `postgres`

This is **not** a frontend Supabase client setup. Do not put the raw Postgres connection string, database password, service role key, or `DATABASE_URL` in browser-exposed code or `NEXT_PUBLIC_*` variables.

## Install

```bash
python -m pip install -r requirements-control-room-db.txt
```

The requirement file pins `python-dotenv` and `psycopg2-binary` for local smoke testing. `psycopg2-binary` avoids local source-build friction on developer machines and ephemeral agent environments.

## Configure

Copy the example env file locally:

```bash
cp .env.example .env
```

Then set:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.oojzfmmywbvficgybaxd.supabase.co:5432/postgres?sslmode=require
```

If the database password contains special characters, percent-encode the password in the connection string.

The committed `.gitignore` already excludes `.env`, so the real password should stay local or in a deployment secret store.

## Run

```bash
python main.py
```

Expected success output:

```text
Founder Control Room database connection OK
database=postgres
user=postgres
time=<timestamp>
```

## Failure classification

- Missing `DATABASE_URL` or `SUPABASE_DB_URL`: local configuration error.
- Password/authentication failure: secret mismatch or password encoding issue.
- Network/IPv6 failure: environment cannot reach the direct database host; use the Supabase pooler connection string instead.
- Any failure here is a database-connectivity bootstrap issue, not evidence of a frontend regression.
