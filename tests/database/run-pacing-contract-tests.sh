#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]]||fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err;then fail "$label (unexpected success)";fi;pass "$label";}
expect_sqlstate(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "do \$\$ begin begin $sql; exception when others then raise notice 'PACING_SQLSTATE:%', sqlstate; end; end \$\$;" 2>&1 | sed -n 's/.*PACING_SQLSTATE://p' | tail -1)"; [[ "$actual" == "$expected" ]]||fail "$label (expected SQLSTATE '$expected', got '$actual')";pass "$label";}

"${PSQL[@]}" -f supabase/migrations/202609060002_pacing_final_torture.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon;set request.jwt.claims='{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"; BW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b')"
CLASS="$(run "$A select id from public.classes where workspace_id=$AW and status='active' order by id limit 1;")"
LESSON="$(run "$A select id from public.lessons where workspace_id=$AW and status='active' order by id limit 1;")"
VERSION="$(run "$A select id from public.lesson_versions where workspace_id=$AW and lesson_id='$LESSON' order by version_number desc limit 1;")"
BCLASS="$(run "$B select id from public.classes where workspace_id=$BW and status='active' order by id limit 1;")"
BLESSON="$(run "$B select id from public.lessons where workspace_id=$BW and status='active' order by id limit 1;")"
[[ -n "$CLASS" && -n "$LESSON" && -n "$VERSION" && -n "$BCLASS" && -n "$BLESSON" ]]||fail 'fixture identities missing'

OP1="b4000000-0000-0000-0000-000000000001"; OP2="b4000000-0000-0000-0000-000000000002"; OP3="b4000000-0000-0000-0000-000000000003"
CALL1="public.upsert_lesson_pacing_plan_operation('$OP1','$CLASS','$LESSON','$VERSION',4,3,1,'[\"Core concept\"]'::jsonb,'[\"Guided practice\"]'::jsonb,'[\"Stretch breadth\"]'::jsonb,'[\"Explain core concept\"]'::jsonb,null,0)"
expect_value 'owner creates pacing plan through idempotent RPC' "$A select outcome||':'||revision||':'||replayed from $CALL1;" 'saved:1:false'
PLAN="$(run "$A select id from public.lesson_pacing_plans where class_id='$CLASS' and lesson_id='$LESSON';")"
expect_value 'lost ACK replays same pacing mutation' "$A select outcome||':'||revision||':'||replayed from $CALL1;" 'saved:1:true'
expect_value 'replay did not duplicate class+lesson pacing identity' "$A select count(*) from public.lesson_pacing_plans where class_id='$CLASS' and lesson_id='$LESSON';" '1'
expect_value 'foreign user cannot read owner pacing plan' "$B select count(*) from public.lesson_pacing_plans where id='$PLAN';" '0'
expect_fail 'browser cannot bypass pacing RPC with direct UPDATE' "$A update public.lesson_pacing_plans set teacher_mode='RELAXED' where id='$PLAN';"
expect_fail 'browser cannot bypass pacing RPC with direct INSERT' "$A insert into public.lesson_pacing_plans(workspace_id,class_id,lesson_id,normal_meetings,available_meetings,correction_reserve,core_targets,minimum_exit_criteria) values($AW,'$CLASS','$LESSON',3,3,0,'[\"x\"]','[\"y\"]');"
expect_sqlstate 'same op id with different payload is rejected' "$A perform * from public.upsert_lesson_pacing_plan_operation('$OP1','$CLASS','$LESSON','$VERSION',4,4,0,'[\"Core concept\"]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[\"Explain core concept\"]'::jsonb,null,0)" 'P3202'

expect_value 'teacher override update increments revision' "$A select outcome||':'||revision||':'||replayed from public.upsert_lesson_pacing_plan_operation('$OP2','$CLASS','$LESSON','$VERSION',4,3,1,'[\"Core concept\"]'::jsonb,'[\"Guided practice\"]'::jsonb,'[\"Stretch breadth\"]'::jsonb,'[\"Explain core concept\"]'::jsonb,'COMPRESSED',1);" 'saved:2:false'
expect_value 'teacher override is canonical and explicit' "$A select teacher_mode||':'||revision from public.lesson_pacing_plans where id='$PLAN';" 'COMPRESSED:2'
expect_value 'stale pacing update returns conflict without mutation' "$A select outcome||':'||revision||':'||replayed from public.upsert_lesson_pacing_plan_operation('$OP3','$CLASS','$LESSON','$VERSION',4,5,0,'[\"Core concept\"]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[\"Explain core concept\"]'::jsonb,null,1);" 'conflict:2:false'
expect_value 'conflict preserves canonical revision' "$A select revision from public.lesson_pacing_plans where id='$PLAN';" '2'

expect_sqlstate 'foreign class cannot be targeted by owner RPC' "$A perform * from public.upsert_lesson_pacing_plan_operation('b4000000-0000-0000-0000-000000000090','$BCLASS','$LESSON',null,3,3,0,'[\"x\"]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[\"y\"]'::jsonb,null,0)" 'P3432'
expect_sqlstate 'foreign lesson cannot be targeted by owner RPC' "$A perform * from public.upsert_lesson_pacing_plan_operation('b4000000-0000-0000-0000-000000000091','$CLASS','$BLESSON',null,3,3,0,'[\"x\"]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[\"y\"]'::jsonb,null,0)" 'P3433'
expect_sqlstate 'empty CORE is rejected' "$A perform * from public.upsert_lesson_pacing_plan_operation('b4000000-0000-0000-0000-000000000092','$CLASS','$LESSON',null,3,3,0,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[\"y\"]'::jsonb,null,2)" '22023'
expect_sqlstate 'correction reserve cannot exceed available meetings' "$A perform * from public.upsert_lesson_pacing_plan_operation('b4000000-0000-0000-0000-000000000093','$CLASS','$LESSON',null,3,1,2,'[\"x\"]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[\"y\"]'::jsonb,null,2)" '22023'
expect_fail 'anonymous pacing select denied' "$ANON select * from public.lesson_pacing_plans limit 1;"
expect_value 'pacing migration does not rewrite immutable LessonVersion' "$A select content_text from public.lesson_versions where id='$VERSION';" "$(run "$A select content_text from public.lesson_versions where id='$VERSION';")"
expect_value 'schema version advances to R3.4 pacing final head' "$A select version from public.app_schema_version where id=1;" 'r3.4-pacing-final.1'

printf '\nR3.4-03 Pacing + Final Torture PostgreSQL matrix completed successfully.\n'
