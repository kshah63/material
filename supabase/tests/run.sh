#!/bin/bash
# Applies every migration to a scratch Postgres, the worksheet migration a second
# time (to prove it can be run twice), then runs the SQL tests. The scratch
# database is dropped however the run ends.
#   PGHOST=localhost PGUSER=postgres bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
TWICE=../migrations/20261017000009_questions.sql
DB=mv_tests_$$_$(date +%s)
# Re-running a migration prints a NOTICE for every "if not exists"; errors still show.
# Every test is an assert, so asserts are on whatever the caller or the server set.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning -c plpgsql.check_asserts=on"
psql -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f shim.sql >/dev/null
for f in ../migrations/*.sql "$TWICE"; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done
echo "applied every migration, and $(basename "$TWICE") twice"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f questions.sql
