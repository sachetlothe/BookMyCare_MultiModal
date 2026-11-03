"""Per-patient file keys (wrapped with a password-derived key)

Revision ID: 0004
Revises: 0003
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("file_key_salt", sa.String(64), nullable=True))
        batch.add_column(sa.Column("file_key_wrapped", sa.String(200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("file_key_wrapped")
        batch.drop_column("file_key_salt")
