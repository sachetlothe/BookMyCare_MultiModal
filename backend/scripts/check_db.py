"""Check the database connection (never prints the password).

    python -m scripts.check_db
"""
from __future__ import annotations

import sys

from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.db.session import engine


def main() -> int:
    url = make_url(get_settings().database_url)
    print("Database:", url.render_as_string(hide_password=True))
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "postgresql":
                print("Server:  ", conn.execute(text("select version()")).scalar().split(",")[0])
            tables = sorted(inspect(conn).get_table_names())
            print("Tables:  ", ", ".join(tables) or "(none yet - run: python -m alembic upgrade head)")
            if "alembic_version" in tables:
                print("Migration:", conn.execute(text("select version_num from alembic_version")).scalar())
            if "users" in tables:
                print("Users:   ", conn.execute(text("select count(*) from users")).scalar())
    except Exception as exc:
        print("FAILED:", type(exc).__name__, "-", str(exc).strip().splitlines()[0])
        return 1
    print("OK: connected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
