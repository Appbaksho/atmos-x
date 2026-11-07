"""Alembic environment (async, asyncpg). URL comes from app settings, never from alembic.ini."""

import asyncio

from geoalchemy2 import alembic_helpers
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401  (registers every table)
from alembic import context
from app.config import settings
from app.db import Base

target_metadata = Base.metadata

IGNORE_TABLES = {"spatial_ref_sys"}


def include_object(obj, name, type_, reflected, compare_to):
    # Only manage our own tables: PostGIS ships tiger/topology tables we must never touch.
    if type_ == "table" and (name in IGNORE_TABLES or (reflected and compare_to is None)):
        return False
    if type_ == "index" and reflected and compare_to is None:
        table = getattr(getattr(obj, "table", None), "name", None)
        if table not in target_metadata.tables:
            return False
    return alembic_helpers.include_object(obj, name, type_, reflected, compare_to)


GEO = dict(process_revision_directives=alembic_helpers.writer, render_item=alembic_helpers.render_item)


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
        **GEO,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run(connection):
    context.configure(
        connection=connection, target_metadata=target_metadata, include_object=include_object, compare_type=True, **GEO
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        await conn.run_sync(do_run)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
