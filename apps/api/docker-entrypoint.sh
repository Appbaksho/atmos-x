#!/bin/sh
# Migrate and load reference data before the API starts. The worker skips this (RUN_MIGRATIONS=0)
# so two containers never migrate at once.
set -e
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  alembic upgrade head
  python -m app.scripts.seed
fi
exec "$@"
