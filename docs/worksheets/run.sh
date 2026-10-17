#!/bin/bash
# Applies every migration plus the draft worksheet migration (twice, to prove it
# can be run twice) to a scratch Postgres, then runs the draft RLS test.
#   PGPASSWORD=postgres PGHOST=localhost PGUSER=postgres bash docs/worksheets/run.sh
set -e
cd "$(dirname "$0")"
DB=ws_draft_$$
psql -q -c "create database $DB" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d $DB -f shim.sql >/dev/null
for f in ../../supabase/migrations/*.sql questions.migration.sql questions.migration.sql; do
  psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f" >/dev/null
done
echo "applied every migration, and the draft twice"
psql -v ON_ERROR_STOP=1 -d $DB -f questions.test.sql
psql -q -c "drop database $DB" >/dev/null
