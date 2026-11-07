"""tree helpers and invited_by

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-08 01:10:48.076341
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tree_helpers",
        sa.Column("tree_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("invited_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["invited_by"], ["users.id"], name=op.f("fk_tree_helpers_invited_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["tree_id"], ["trees.id"], name=op.f("fk_tree_helpers_tree_id_trees"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_tree_helpers_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("tree_id", "user_id", name=op.f("pk_tree_helpers")),
    )
    op.create_index("ix_tree_helpers_user", "tree_helpers", ["user_id"])
    op.add_column("users", sa.Column("invited_by_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_users_invited_by_id_users"), "users", "users", ["invited_by_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_users_invited_by_id_users"), "users", type_="foreignkey")
    op.drop_column("users", "invited_by_id")
    op.drop_index("ix_tree_helpers_user", table_name="tree_helpers")
    op.drop_table("tree_helpers")
