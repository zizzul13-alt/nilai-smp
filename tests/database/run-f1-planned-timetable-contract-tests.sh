#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]] || fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-f1-out 2>/tmp/nilai-f1-err; then fail "$label (unexpected success)"; fi; pass "$label"; }

# This lane runs last in the shared PostgreSQL CI suite. Keep it composable with that
# already-migrated database, while still allowing focused standalone execution.
if [[ "$(run "select to_regclass('public.workspaces') is not null")" != "t" ]]; then
  "${PSQL[@]}" -f tests/database/bootstrap_supabase_compat.sql >/dev/null
  "${PSQL[@]}" -f supabase/migrations/202609030001_foundation_schema_version.sql >/dev/null
  "${PSQL[@]}" -f supabase/migrations/202609040001_academic_spine.sql >/dev/null
  "${PSQL[@]}" -f tests/database/seed_owned_data.sql >/dev/null
fi

PRE_VERSION="$(run "select version from public.app_schema_version where id=1")"
PRE_MEETINGS="$(run "select count(*) from public.meetings")"
"${PSQL[@]}" -f supabase/migrations/202609110001_f1_planned_timetable.sql >/dev/null

A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon; set request.jwt.claims = '{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"
BW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b')"
ACLASS="30000000-0000-0000-0000-000000000001"
BY="f1a00000-0000-4000-8000-000000000001"; BP="f1a00000-0000-4000-8000-000000000002"; BCLASS="f1a00000-0000-4000-8000-000000000003"

# Test fixtures are setup as the database owner so the matrix tests only the F1 boundary,
# not whether the pre-existing Academic Spine CRUD policy can create fixture rows.
run "insert into public.academic_years(id,workspace_id,identity_key,display_name,sort_order) select '$BY',id,'f1-b-year','B Year',901 from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b' on conflict (id) do nothing; insert into public.academic_periods(id,workspace_id,academic_year_id,identity_key,display_name,sort_order) select '$BP',id,'$BY','f1-b-p','B Period',901 from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b' on conflict (id) do nothing; insert into public.classes(id,workspace_id,academic_period_id,identity_key,display_name) select '$BCLASS',id,'$BP','f1-b-class','B Class' from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b' on conflict (id) do nothing;"

expect_value 'A canonical class fixture still exists' "$A select count(*) from public.classes where id='$ACLASS';" '1'
expect_value 'B adversary class fixture exists for B only' "$B select count(*) from public.classes where id='$BCLASS';" '1'
expect_value 'A creates owned planned slot' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'08:00','08:40','2026-07-01') returning weekday||':'||local_start_time::text||':'||status;" '1:08:00:00:active'
expect_value 'A reads own planned slot' "$A select count(*) from public.planned_schedules where class_id='$ACLASS';" '1'
expect_value 'B cannot read A planned slot' "$B select count(*) from public.planned_schedules where class_id='$ACLASS';" '0'
expect_fail 'B cannot insert into A workspace' "$B insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'09:00','09:40','2026-07-01');"
expect_value 'B update of A slot affects zero rows' "$B update public.planned_schedules set local_start_time='09:00' where workspace_id=$AW; select count(*) from public.planned_schedules where workspace_id=$AW and local_start_time='09:00';" '0'
expect_value 'B delete of A slot affects zero rows' "$B delete from public.planned_schedules where workspace_id=$AW; select count(*) from public.planned_schedules where workspace_id=$AW;" '0'
expect_fail 'anonymous planned schedule access denied' "$ANON select * from public.planned_schedules;"
expect_fail 'cross-workspace class reference rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$BCLASS',2,'08:00','08:40','2026-07-01');"
expect_fail 'weekday outside ISO range rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',0,'08:00','08:40','2026-07-01');"
expect_fail 'end before start rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',2,'09:00','08:40','2026-07-01');"
expect_fail 'invalid effective date range rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from,effective_until) values($AW,'$ACLASS',2,'08:00','08:40','2026-08-01','2026-07-01');"
expect_fail 'exact duplicate active slot rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'08:00','08:40','2026-07-01');"
expect_value 'overlap remains explicit rather than auto-rewritten' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'08:20','09:00','2026-07-01'); select count(*) from public.planned_schedules where workspace_id=$AW and class_id='$ACLASS';" '2'
expect_value 'F1 schema does not fabricate meetings' "select count(*) from public.meetings;" "$PRE_MEETINGS"
expect_value 'additive F1 schema preserves previous compatibility identity' "select version from public.app_schema_version where id=1;" "$PRE_VERSION"

printf '\nF1 Planned Timetable schema + owner/adversary contract matrix completed successfully.\n'
