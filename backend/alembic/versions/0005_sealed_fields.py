"""Sealed (per-patient encrypted) fields, recovery codes and session versions

* Text columns that now hold ciphertext are widened to TEXT.
* lab_results: value/unit/ref_low/ref_high/status move into one JSON column ``data``
  (sealed with the patient's key at their next sign-in).
* users: recovery-code wrapped key, session_version.

Revision ID: 0005
Revises: 0004
"""
import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as b:
        b.alter_column("full_name", type_=sa.Text(), existing_type=sa.String(200), existing_nullable=False)
        b.add_column(sa.Column("recovery_key_salt", sa.String(64), nullable=True))
        b.add_column(sa.Column("recovery_key_wrapped", sa.String(200), nullable=True))
        b.add_column(sa.Column("recovery_created_at", sa.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"))
    with op.batch_alter_table("patient_profiles") as b:
        b.alter_column("emergency_contact", type_=sa.Text(), existing_type=sa.String(200), existing_nullable=True)
    with op.batch_alter_table("medical_history") as b:
        b.alter_column("title", type_=sa.Text(), existing_type=sa.String(200), existing_nullable=False)
    with op.batch_alter_table("medical_reports") as b:
        b.alter_column("title", type_=sa.Text(), existing_type=sa.String(200), existing_nullable=False)
        b.alter_column("original_filename", type_=sa.Text(), existing_type=sa.String(255), existing_nullable=False)

    with op.batch_alter_table("lab_results") as b:
        b.add_column(sa.Column("data", sa.JSON(), nullable=True))
    bind = op.get_bind()
    lr = sa.table("lab_results", sa.column("id", sa.Integer), sa.column("value", sa.Float), sa.column("unit", sa.String),
                  sa.column("ref_low", sa.Float), sa.column("ref_high", sa.Float), sa.column("status", sa.String),
                  sa.column("data", sa.JSON))
    for rid, value, unit, lo, hi, st in bind.execute(sa.select(lr.c.id, lr.c.value, lr.c.unit, lr.c.ref_low, lr.c.ref_high, lr.c.status)).all():
        bind.execute(lr.update().where(lr.c.id == rid).values(data={"value": value, "unit": unit, "ref_low": lo, "ref_high": hi, "status": st}))
    with op.batch_alter_table("lab_results") as b:
        b.alter_column("data", existing_type=sa.JSON(), nullable=False)
        for col in ("value", "unit", "ref_low", "ref_high", "status"):
            b.drop_column(col)


def downgrade() -> None:
    with op.batch_alter_table("lab_results") as b:
        b.add_column(sa.Column("value", sa.Float(), nullable=True))
        b.add_column(sa.Column("unit", sa.String(30), nullable=True))
        b.add_column(sa.Column("ref_low", sa.Float(), nullable=True))
        b.add_column(sa.Column("ref_high", sa.Float(), nullable=True))
        b.add_column(sa.Column("status", sa.String(20), nullable=True))
    bind = op.get_bind()
    lr = sa.table("lab_results", sa.column("id", sa.Integer), sa.column("data", sa.JSON), sa.column("value", sa.Float),
                  sa.column("unit", sa.String), sa.column("ref_low", sa.Float), sa.column("ref_high", sa.Float), sa.column("status", sa.String))
    for rid, data in bind.execute(sa.select(lr.c.id, lr.c.data)).all():
        d = json.loads(data) if isinstance(data, str) else data
        if isinstance(d, dict) and "value" in d:  # sealed rows cannot be opened here and stay empty
            bind.execute(lr.update().where(lr.c.id == rid).values(value=d["value"], unit=d.get("unit"), ref_low=d.get("ref_low"),
                                                                    ref_high=d.get("ref_high"), status=d.get("status")))
    with op.batch_alter_table("lab_results") as b:
        b.drop_column("data")
    with op.batch_alter_table("users") as b:
        b.drop_column("session_version")
        b.drop_column("recovery_created_at")
        b.drop_column("recovery_key_wrapped")
        b.drop_column("recovery_key_salt")
