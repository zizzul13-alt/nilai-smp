#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]]||fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err;then fail "$label (unexpected success)";fi;pass "$label";}
expect_sqlstate(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "do \$\$ begin begin $sql; exception when others then raise notice 'CONTINUITY_SQLSTATE:%', sqlstate; end; end \$\$;" 2>&1 | sed -n 's/.*CONTINUITY_SQLSTATE://p' | tail -1)"; [[ "$actual" == "$expected" ]]||fail "$label (expected SQLSTATE '$expected', got '$actual')";pass "$label";}

"${PSQL[@]}" -f supabase/migrations/202609050001_continuity_core.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon;set request.jwt.claims='{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"
CLASS="30000000-0000-0000-0000-000000000001"; BC="83000000-0000-0000-0000-000000000001"; BMEET="87000000-0000-0000-0000-000000000001"
LES="72000000-0000-0000-0000-000000000001"; LV2="73000000-0000-0000-0000-000000000002"; BL="85000000-0000-0000-0000-000000000001"
START1="91000000-0000-0000-0000-000000000001"; START_RETRY="91000000-0000-0000-0000-000000000002"
CP1="92000000-0000-0000-0000-000000000001"; CP2="92000000-0000-0000-0000-000000000002"
FINISH1="93000000-0000-0000-0000-000000000001"; START2="91000000-0000-0000-0000-000000000003"; CANCEL2="93000000-0000-0000-0000-000000000002"; START3="91000000-0000-0000-0000-000000000004"

expect_value 'Start Class creates one in-progress Meeting' "$A select outcome||':'||meeting_status||':'||replayed from public.start_teaching_meeting_operation('$START1','$CLASS',null,null);" 'started:in_progress:false'
M1="$(run "$A select id from public.meetings where class_id='$CLASS' and status='in_progress' order by occurred_at desc limit 1;")"
[[ -n "$M1" ]]||fail 'Start Class returned no canonical Meeting'; pass 'canonical Meeting id exists'
expect_value 'lost ACK retry replays same Start operation' "$A select outcome||':'||meeting_id||':'||replayed from public.start_teaching_meeting_operation('$START1','$CLASS',null,null);" "started:$M1:true"
expect_value 'different double-tap op reuses existing active Meeting' "$A select outcome||':'||meeting_id||':'||replayed from public.start_teaching_meeting_operation('$START_RETRY','$CLASS',null,null);" "continued:$M1:false"
expect_value 'only one current Meeting exists for Class' "$A select count(*) from public.meetings where class_id='$CLASS' and status='in_progress';" '1'
expect_fail 'database invariant rejects a second direct in-progress Meeting' "$A insert into public.meetings(workspace_id,class_id,occurred_at,status) values($AW,'$CLASS',now(),'in_progress');"

expect_value 'checkpoint sequence starts at one' "$A select outcome||':'||sequence_no||':'||replayed from public.apply_meeting_checkpoint_operation('$CP1','$M1','Halaman 37, contoh gaya gesek nomor 2','Bahas nomor 3 lalu latihan mandiri');" 'saved:1:false'
expect_value 'latest checkpoint reconstructs stopped and next' "$A select stopped_at||':'||next_step from public.checkpoints where meeting_id='$M1' order by sequence_no desc limit 1;" 'Halaman 37, contoh gaya gesek nomor 2:Bahas nomor 3 lalu latihan mandiri'
expect_value 'lost ACK checkpoint retry replays without duplicate' "$A select outcome||':'||sequence_no||':'||replayed from public.apply_meeting_checkpoint_operation('$CP1','$M1','Halaman 37, contoh gaya gesek nomor 2','Bahas nomor 3 lalu latihan mandiri');" 'saved:1:true'
expect_value 'checkpoint retry created exactly one row' "$A select count(*) from public.checkpoints where meeting_id='$M1';" '1'
expect_value 'second checkpoint gets deterministic next sequence' "$A select sequence_no from public.apply_meeting_checkpoint_operation('$CP2','$M1','Halaman 39','Latihan 4');" '2'
expect_value 'latest sequence is deterministic' "$A select sequence_no||':'||stopped_at from public.checkpoints where meeting_id='$M1' order by sequence_no desc limit 1;" '2:Halaman 39'
expect_sqlstate 'blank stopped_at rejected' "$A perform * from public.apply_meeting_checkpoint_operation('92000000-0000-0000-0000-000000000099','$M1','   ',null)" '22023'
expect_value 'browser disappearance has no implicit completion effect' "$A select status from public.meetings where id='$M1';" 'in_progress'

expect_value 'explicit Complete Meeting changes lifecycle' "$A select outcome||':'||meeting_status||':'||replayed from public.set_teaching_meeting_status_operation('$FINISH1','$M1','completed');" 'saved:completed:false'
expect_value 'completion preserves historical checkpoints' "$A select status||':'||(select count(*) from public.checkpoints c where c.meeting_id=m.id) from public.meetings m where m.id='$M1';" 'completed:2'
expect_value 'lost ACK completion retry is idempotent' "$A select meeting_status||':'||replayed from public.set_teaching_meeting_status_operation('$FINISH1','$M1','completed');" 'completed:true'
expect_sqlstate 'new checkpoint cannot mutate completed Meeting history' "$A perform * from public.apply_meeting_checkpoint_operation('92000000-0000-0000-0000-000000000098','$M1','late write',null)" 'P3505'

expect_value 'Start after completion creates a new actual Meeting' "$A select outcome||':'||replayed from public.start_teaching_meeting_operation('$START2','$CLASS',null,null);" 'started:false'
M2="$(run "$A select id from public.meetings where class_id='$CLASS' and status='in_progress' order by occurred_at desc limit 1;")"
expect_value 'completed Meeting is not reused as current active Meeting' "$A select ('$M1'::uuid<> '$M2'::uuid)::text;" 'true'
expect_value 'explicit Cancel Meeting is preserved as history' "$A select meeting_status from public.set_teaching_meeting_status_operation('$CANCEL2','$M2','cancelled');" 'cancelled'
expect_value 'cancelled Meeting remains historical truth' "$A select status from public.meetings where id='$M2';" 'cancelled'

expect_value 'Start can pin canonical Lesson and exact LessonVersion' "$A select outcome from public.start_teaching_meeting_operation('$START3','$CLASS','$LES','$LV2');" 'started'
M3="$(run "$A select id from public.meetings where class_id='$CLASS' and status='in_progress' order by occurred_at desc limit 1;")"
expect_value 'Meeting retains exact LessonVersion context' "$A select lesson_id||':'||lesson_version_id from public.meetings where id='$M3';" "$LES:$LV2"
expect_fail 'single-active invariant remains enforced after restarts' "$A insert into public.meetings(workspace_id,class_id,occurred_at,status) values($AW,'$CLASS',now(),'in_progress');"

expect_sqlstate 'foreign Class Start denied' "$A perform * from public.start_teaching_meeting_operation('91000000-0000-0000-0000-000000000090','$BC',null,null)" 'P3503'
expect_sqlstate 'foreign Lesson context denied' "$A perform * from public.start_teaching_meeting_operation('91000000-0000-0000-0000-000000000091','$CLASS','$BL',null)" 'P3504'
expect_sqlstate 'foreign Meeting checkpoint denied' "$A perform * from public.apply_meeting_checkpoint_operation('92000000-0000-0000-0000-000000000090','$BMEET','attack',null)" 'P3503'
expect_fail 'anonymous Start RPC denied' "$ANON select * from public.start_teaching_meeting_operation('91000000-0000-0000-0000-000000000092','$CLASS',null,null);"
expect_fail 'anonymous checkpoint RPC denied' "$ANON select * from public.apply_meeting_checkpoint_operation('92000000-0000-0000-0000-000000000092','$M3','attack',null);"
expect_value 'B cannot see A continuity ledger' "$B select count(*) from public.applied_operations where operation_type like 'meeting.%';" '0'
expect_value 'schema version is continuity core' "$A select version from public.app_schema_version where id=1;" 'r3.4-continuity-core.1'

printf '\nR3.4 Teaching Continuity PostgreSQL contract matrix completed successfully.\n'
