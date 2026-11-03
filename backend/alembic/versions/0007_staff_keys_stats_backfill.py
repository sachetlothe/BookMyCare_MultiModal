"""Support access sealed to each staff member's own key pair; flags for counting older data

* support_grants.wrapped_key (server support key) is dropped; existing grants are removed
  (patients can grant again). New table support_grant_keys holds one copy per staff member.
* users.staff_public_key / staff_private_key (sealed with the staff member's own key).
* users / medical_reports / analyses .stats_counted: whether a row is in the anonymous statistics,
  so older data can be counted once (at the owner's next sign-in) without double counting.

Revision ID: 0007
Revises: 0006
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM support_grants")
    with op.batch_alter_table("support_grants") as b:
        b.drop_column("wrapped_key")
    op.create_table(
        "support_grant_keys",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("grant_id", sa.Integer, sa.ForeignKey("support_grants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sealed_key", sa.Text, nullable=False),
        sa.UniqueConstraint("grant_id", "staff_id", name="uq_support_grant_keys"),
    )
    op.create_index("ix_support_grant_keys_grant_id", "support_grant_keys", ["grant_id"])
    with op.batch_alter_table("users") as b:
        b.add_column(sa.Column("staff_public_key", sa.Text, nullable=True))
        b.add_column(sa.Column("staff_private_key", sa.Text, nullable=True))
        b.add_column(sa.Column("stats_counted", sa.Boolean, nullable=False, server_default=sa.false()))
    for t in ("medical_reports", "analyses"):
        with op.batch_alter_table(t) as b:
            b.add_column(sa.Column("stats_counted", sa.Boolean, nullable=False, server_default=sa.false()))
    if op.get_bind().dialect.name == "postgresql":
        op.execute('ALTER TABLE "support_grant_keys" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for t in ("analyses", "medical_reports"):
        with op.batch_alter_table(t) as b:
            b.drop_column("stats_counted")
    with op.batch_alter_table("users") as b:
        b.drop_column("stats_counted")
        b.drop_column("staff_private_key")
        b.drop_column("staff_public_key")
    op.drop_index("ix_support_grant_keys_grant_id", table_name="support_grant_keys")
    op.drop_table("support_grant_keys")
    op.execute("DELETE FROM support_grants")
    with op.batch_alter_table("support_grants") as b:
        b.add_column(sa.Column("wrapped_key", sa.Text, nullable=False, server_default=""))
