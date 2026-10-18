#!/bin/bash
# Applies every migration to a scratch Postgres, the worksheet migration a second
# time (to prove it can be run twice), then runs the SQL tests and, in Node, the
# crop screen's save (crops.mjs) and the worksheet's layout (worksheet.mjs). The
# scratch database is dropped however the run ends.
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
# The crop screen's save (lib/worksheet/crops.ts), built in Node and sent to the
# real save_crops in the same scratch database.
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON crops.mjs "$DB"
# The worksheet's layout (lib/worksheet/layout.ts) and its source line in
# pdf-lib's Helvetica. It needs no database.
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worksheet.mjs
