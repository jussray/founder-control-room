"""Founder Control Room Supabase Postgres smoke test.

This script verifies that a local/admin DATABASE_URL can reach the
Founder Control Room Supabase Postgres database without exposing secrets.

Never commit a real .env file. Use .env.example as the template.
"""

from __future__ import annotations

import os
import sys
from contextlib import closing

import psycopg2
from dotenv import load_dotenv


DEFAULT_CONNECT_TIMEOUT_SECONDS = "10"


def read_database_url() -> str | None:
    """Load the local .env file and return the configured database URL."""

    load_dotenv()
    return os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")


def main() -> int:
    database_url = read_database_url()

    if not database_url:
        print(
            "Missing DATABASE_URL or SUPABASE_DB_URL. Copy .env.example to .env "
            "and set the local/admin Postgres connection string.",
            file=sys.stderr,
        )
        return 1

    connect_timeout = os.getenv("PGCONNECT_TIMEOUT", DEFAULT_CONNECT_TIMEOUT_SECONDS)
    sslmode = os.getenv("PGSSLMODE", "require")

    try:
        with closing(
            psycopg2.connect(
                database_url,
                connect_timeout=connect_timeout,
                sslmode=sslmode,
                application_name="founder-control-room-smoke",
            )
        ) as connection:
            connection.autocommit = True

            with connection.cursor() as cursor:
                cursor.execute("select current_database(), current_user, now();")
                database, user, timestamp = cursor.fetchone()

        print("Founder Control Room database connection OK")
        print(f"database={database}")
        print(f"user={user}")
        print(f"time={timestamp}")
        return 0

    except Exception as error:  # noqa: BLE001 - smoke test should surface any connection failure.
        print("Founder Control Room database connection FAILED", file=sys.stderr)
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
