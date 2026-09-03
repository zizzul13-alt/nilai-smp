#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
run() { "${PSQL[@]}" -qAtc "$1"; }
expect_value() {
  local label="$1" sql="$2" expected="$3" actual
  actual="$(run "$sql")"
  [[ "$actual" == "$expected" ]] || fail "$label (expected '$expected', got '$actual')"
  pass "$label"
}
expect_fail() {
  local label="$1" sql="$2"
  if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err; then
    cat /tmp/nilai-db-out >&2 || true
    fail "$label (unexpected success)"
  fi
  pass "$label"
}

"${PSQL[@]}" -f tests/database/bootstrap_supabase_compat.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609030001_foundation_schema_version.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609040001_academic_spine.sql >/dev/null
"${PSQL[@]}" -f tests/database/seed_owned_data.sql >/dev/null

A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon; set request.jwt.claims = '{\"role\":\"anon\"}';"

expect_value 'workspace bootstrap is idempotent for user A' "$A select count(*) from public.workspaces;" '1'
expect_value 'workspace bootstrap created one workspace for user B' "$B select count(*) from public.workspaces;" '1'
expect_value 'user A reads only A workspace' "$A select count(*) from public.workspaces;" '1'
expect_value 'user A reads only A students' "$A select count(*) from public.students;" '2'
expect_value 'user B cannot read A students' "$B select count(*) from public.students;" '0'
expect_fail 'anonymous protected read denied' "$ANON select * from public.students;"

expect_value 'duplicate student names are allowed' "$A select count(*) from public.students where display_name = 'Budi';" '2'
expect_value 'same class identity can recur in another period' "$A select count(*) from public.classes where identity_key = 'viii-a';" '2'
expect_fail 'duplicate student plus class enrollment denied' "$A insert into public.enrollments(workspace_id, student_id, class_id) select id, '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001' from public.workspaces;"

# Browser-forged foreign workspace writes fail or affect zero rows under RLS even when UUIDs are known.
B_WORKSPACE="$(run "$B select id from public.workspaces;")"
A_WORKSPACE="$(run "$A select id from public.workspaces;")"
expect_fail 'user A foreign workspace insert denied' "$A insert into public.students(workspace_id, display_name) values ('$B_WORKSPACE', 'Forged');"
expect_value 'user B foreign update affects zero rows' "$B with changed as (update public.students set display_name='Stolen' where id='40000000-0000-0000-0000-000000000001' returning 1) select count(*) from changed;" '0'
expect_value 'foreign update changed no data' "$A select display_name from public.students where id='40000000-0000-0000-0000-000000000001';" 'Budi'
expect_value 'user B foreign delete affects zero rows' "$B with removed as (delete from public.students where id='40000000-0000-0000-0000-000000000001' returning 1) select count(*) from removed;" '0'
expect_value 'foreign delete did not remove row' "$A select count(*) from public.students where id='40000000-0000-0000-0000-000000000001';" '1'

# Structural workspace-aware FKs are tested as postgres, deliberately bypassing RLS.
run "insert into public.academic_years(id, workspace_id, identity_key, display_name, sort_order) values ('10000000-0000-0000-0000-00000000000b', '$B_WORKSPACE', '2026-2027', '2026/2027', 1);"
expect_fail 'cross-workspace Academic Period -> Academic Year denied structurally' "insert into public.academic_periods(workspace_id, academic_year_id, identity_key, display_name, sort_order) values ('$B_WORKSPACE', '10000000-0000-0000-0000-000000000001', 'bad', 'Bad', 1);"
expect_fail 'cross-workspace Class -> Academic Period denied structurally' "insert into public.classes(workspace_id, academic_period_id, identity_key, display_name) values ('$B_WORKSPACE', '20000000-0000-0000-0000-000000000001', 'bad', 'Bad');"
run "insert into public.students(id, workspace_id, display_name) values ('40000000-0000-0000-0000-00000000000b', '$B_WORKSPACE', 'B Student');"
run "insert into public.academic_periods(id, workspace_id, academic_year_id, identity_key, display_name, sort_order) values ('20000000-0000-0000-0000-00000000000b', '$B_WORKSPACE', '10000000-0000-0000-0000-00000000000b', 's1', 'Semester 1', 1);"
run "insert into public.classes(id, workspace_id, academic_period_id, identity_key, display_name) values ('30000000-0000-0000-0000-00000000000b', '$B_WORKSPACE', '20000000-0000-0000-0000-00000000000b', 'viii-a', 'VIII A');"
expect_fail 'A-workspace cannot reference B-class in enrollment' "insert into public.enrollments(workspace_id, student_id, class_id) values ('$A_WORKSPACE', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b');"
expect_fail 'B-workspace cannot pair A-student with B-class' "insert into public.enrollments(workspace_id, student_id, class_id) values ('$B_WORKSPACE', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b');"

expect_fail 'authenticated API exposes no foreign-owner bootstrap argument' "$A select public.bootstrap_personal_workspace('00000000-0000-0000-0000-00000000000b');"
expect_fail 'anonymous workspace bootstrap denied' "$ANON select public.bootstrap_personal_workspace();"
expect_value 'schema version advances only to R3.1 migration state' "$A select version from public.app_schema_version where id=1;" 'r3.1-academic-spine.1'

run "$A update public.enrollments set status='withdrawn', ended_on=current_date where id='50000000-0000-0000-0000-000000000001';"
expect_value 'enrollment lifecycle update preserves student identity' "$A select count(*) from public.students where id='40000000-0000-0000-0000-000000000001';" '1'

printf '\nDatabase contract attack matrix completed successfully.\n'
