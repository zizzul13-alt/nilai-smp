#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]] || fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-f1-out 2>/tmp/nilai-f1-err; then fail "$label (unexpected success)"; fi; pass "$label"; }

"${PSQL[@]}" -f tests/database/bootstrap_supabase_compat.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609030001_foundation_schema_version.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609040001_academic_spine.sql >/dev/null
"${PSQL[@]}" -f tests/database/seed_owned_data.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609110001_f1_planned_timetable.sql >/dev/null

A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon; set request.jwt.claims = '{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"
BW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b')"
ACLASS="30000000-0000-0000-0000-000000000001"
BY="91000000-0000-0000-0000-000000000001"; BP="92000000-0000-0000-0000-000000000001"; BCLASS="93000000-0000-0000-0000-000000000001"

run "$B insert into public.academic_years(id,workspace_id,identity_key,display_name,sort_order) values('$BY',$BW,'f1-b-year','B Year',1); insert into public.academic_periods(id,workspace_id,academic_year_id,identity_key,display_name,sort_order) values('$BP',$BW,'$BY','f1-b-p','B Period',1); insert into public.classes(id,workspace_id,academic_period_id,identity_key,display_name) values('$BCLASS',$BW,'$BP','f1-b-class','B Class');"

expect_value 'A creates owned planned slot' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'08:00','08:40','2026-07-01') returning weekday||':'||local_start_time::text||':'||status;" '1:08:00:00:active'
expect_value 'A reads own planned slot' "$A select count(*) from public.planned_schedules;" '1'
expect_value 'B cannot read A planned slot' "$B select count(*) from public.planned_schedules;" '0'
expect_fail 'B cannot insert into A workspace' "$B insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'09:00','09:40','2026-07-01');"
expect_value 'B update of A slot affects zero rows' "$B update public.planned_schedules set local_start_time='09:00' where workspace_id=$AW; select count(*) from public.planned_schedules;" '0'
expect_value 'B delete of A slot affects zero rows' "$B delete from public.planned_schedules where workspace_id=$AW; select count(*) from public.planned_schedules;" '0'
expect_fail 'anonymous planned schedule access denied' "$ANON select * from public.planned_schedules;"
expect_fail 'cross-workspace class reference rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$BCLASS',2,'08:00','08:40','2026-07-01');"
expect_fail 'weekday outside ISO range rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',0,'08:00','08:40','2026-07-01');"
expect_fail 'end before start rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',2,'09:00','08:40','2026-07-01');"
expect_fail 'invalid effective date range rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from,effective_until) values($AW,'$ACLASS',2,'08:00','08:40','2026-08-01','2026-07-01');"
expect_fail 'exact duplicate active slot rejected' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'08:00','08:40','2026-07-01');"
expect_value 'overlap remains explicit rather than auto-rewritten' "$A insert into public.planned_schedules(workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from) values($AW,'$ACLASS',1,'08:20','09:00','2026-07-01'); select count(*) from public.planned_schedules where workspace_id=$AW;" '2'
expect_value 'F1 schema does not fabricate meetings' "$A select count(*) from pg_catalog.pg_class where relnamespace='public'::regnamespace and relname='meetings';" '0'
expect_value 'additive F1 schema preserves previous compatibility identity' "$A select version from public.app_schema_version where id=1;" 'r3.1-academic-spine.1'

printf '\nF1 Planned Timetable schema + owner/adversary contract matrix completed successfully.\n'
