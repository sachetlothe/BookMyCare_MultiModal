"""Lab history for trends: lab_test_catalog + lab_results (backfilled from existing reports)

Revision ID: 0003
Revises: 0002
"""
from datetime import date, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    catalog = op.create_table(
        "lab_test_catalog",
        sa.Column("code", sa.String(40), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("unit", sa.String(30), nullable=False),
        sa.Column("loinc", sa.String(20), nullable=True),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("ref_low", sa.Float, nullable=True),
        sa.Column("ref_high", sa.Float, nullable=True),
        sa.Column("min_change", sa.Float, nullable=True),
    )
    results = op.create_table(
        "lab_results",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_id", sa.Integer, sa.ForeignKey("medical_reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("test_code", sa.String(40), sa.ForeignKey("lab_test_catalog.code"), nullable=False),
        sa.Column("value", sa.Float, nullable=False),
        sa.Column("unit", sa.String(30), nullable=False),
        sa.Column("ref_low", sa.Float, nullable=True),
        sa.Column("ref_high", sa.Float, nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("test_date", sa.Date, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("report_id", "test_code", name="uq_lab_results_report_test"),
    )
    op.create_index("ix_lab_results_report_id", "lab_results", ["report_id"])
    op.create_index("ix_lab_results_user_test_date", "lab_results", ["user_id", "test_code", "test_date"])

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute('ALTER TABLE "lab_test_catalog" ENABLE ROW LEVEL SECURITY')
        op.execute('ALTER TABLE "lab_results" ENABLE ROW LEVEL SECURITY')

    # Catalog rows come from the parser's test definitions (the app keeps them in sync on start-up).
    from app.services.lab_catalog import catalog_rows

    rows = catalog_rows()
    op.bulk_insert(catalog, rows)
    codes = {r["code"]: r["unit"] for r in rows}

    reports = sa.table(
        "medical_reports",
        sa.column("id", sa.Integer), sa.column("user_id", sa.Integer), sa.column("kind", sa.String),
        sa.column("report_date", sa.Date), sa.column("created_at", sa.DateTime(timezone=True)), sa.column("lab_values", sa.JSON),
    )
    now = datetime.now()
    out = []
    for rid, uid, kind, rdate, created, labs in bind.execute(sa.select(
        reports.c.id, reports.c.user_id, reports.c.kind, reports.c.report_date, reports.c.created_at, reports.c.lab_values,
    )):
        if kind != "report" or not labs:
            continue
        when = rdate or (created.date() if isinstance(created, datetime) else date.today())
        seen = set()
        for v in labs:
            key = v.get("key")
            if key not in codes or key in seen or not isinstance(v.get("value"), (int, float)):
                continue
            seen.add(key)
            out.append({
                "user_id": uid, "report_id": rid, "test_code": key, "value": float(v["value"]),
                "unit": v.get("unit") or codes[key], "ref_low": v.get("ref_low"), "ref_high": v.get("ref_high"),
                "status": v.get("status") or "normal", "test_date": when, "created_at": now,
            })
    if out:
        op.bulk_insert(results, out)


def downgrade() -> None:
    op.drop_index("ix_lab_results_user_test_date", table_name="lab_results")
    op.drop_index("ix_lab_results_report_id", table_name="lab_results")
    op.drop_table("lab_results")
    op.drop_table("lab_test_catalog")
