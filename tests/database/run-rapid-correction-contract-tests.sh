#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]]||fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err;then fail "$label (unexpected success)";fi;pass "$label";}
"${PSQL[@]}" -f supabase/migrations/202609040005_rapid_correction_safe_writes.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';";B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';";ANON="set role anon;set request.jwt.claims='{\"role\":\"anon\"}';";AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')";ENROLL="50000000-0000-0000-0000-000000000001";ASSESS="98000000-0000-0000-0000-000000000001";SESSION="99000000-0000-0000-0000-000000000001"
run "$A insert into public.assessments(id,workspace_id,class_id,academic_period_id,title) values('$ASSESS',$AW,'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Rapid Test');" >/dev/null
OP1="98100000-0000-0000-0000-000000000001";OP2="98100000-0000-0000-0000-000000000002";OP3="98100000-0000-0000-0000-000000000003";OP4="98100000-0000-0000-0000-000000000004"
expect_value 'zero is GRADED and creates revision 1 atomically' "$A select outcome||':'||revision||':'||state||':'||score from public.apply_assessment_judgement_operation('$OP1','$ASSESS','$ENROLL','GRADED',0,'ORIGINAL',0,'{}',0);" 'saved:1:GRADED:0'
expect_value 'lost ACK same op_id replays without duplicate Attempt' "$A select outcome||':'||revision||':'||replayed from public.apply_assessment_judgement_operation('$OP1','$ASSESS','$ENROLL','GRADED',0,'ORIGINAL',0,'{}',0);" 'saved:1:true'
expect_value 'lost ACK produced one Attempt only' "$A select count(*) from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL');" '1'
expect_value 'negative score preserved at next revision' "$A select outcome||':'||revision||':'||score from public.apply_assessment_judgement_operation('$OP2','$ASSESS','$ENROLL','GRADED',-5,'CORRECTION',-5,'{}',1);" 'saved:2:-5'
expect_value 'stale revision conflicts without overwrite' "$A select outcome||':'||revision from public.apply_assessment_judgement_operation('$OP3','$ASSESS','$ENROLL','GRADED',9,'CORRECTION',9,'{}',1);" 'conflict:2'
expect_value 'server truth survives stale conflict' "$A select state||':'||score||':'||revision from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL';" 'GRADED:-5:2'
expect_value 'Missing is explicit with NULL score' "$A select outcome||':'||revision||':'||state||':'||coalesce(score::text,'NULL') from public.apply_assessment_judgement_operation('$OP4','$ASSESS','$ENROLL','MISSING',null,null,null,'{}',2);" 'saved:3:MISSING:NULL'
expect_value 'academic operations recorded exactly once in ledger' "$A select count(*) from public.applied_operations where operation_type='assessment.judgement' and target_entity_id='$ENROLL';" '3'
expect_fail 'changed payload cannot reuse op_id' "$A select * from public.apply_assessment_judgement_operation('$OP4','$ASSESS','$ENROLL','EXCUSED',null,null,null,'{}',2);"

# Real PostgreSQL concurrency contract: two independent sessions race to create the same nonexistent Result.
CONC_ASSESS="98000000-0000-0000-0000-000000000002"; CONC_OP_A="98200000-0000-0000-0000-000000000001"; CONC_OP_B="98200000-0000-0000-0000-000000000002"
run "$A insert into public.assessments(id,workspace_id,class_id,academic_period_id,title) values('$CONC_ASSESS',$AW,'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Concurrent First Result');" >/dev/null
CONC_A_OUT="$(mktemp)"; CONC_B_OUT="$(mktemp)"; trap 'rm -f "$CONC_A_OUT" "$CONC_B_OUT"' EXIT
(
  "${PSQL[@]}" -qAtc "begin; $A select outcome||':'||revision||':'||state||':'||score from public.apply_assessment_judgement_operation('$CONC_OP_A','$CONC_ASSESS','$ENROLL','GRADED',7,'ORIGINAL',7,'{}',0); select pg_sleep(1); commit;" >"$CONC_A_OUT" 2>&1
) & CONC_A_PID=$!
sleep 0.2
(
  "${PSQL[@]}" -qAtc "begin; $A select outcome||':'||revision||':'||state||':'||score from public.apply_assessment_judgement_operation('$CONC_OP_B','$CONC_ASSESS','$ENROLL','GRADED',9,'ORIGINAL',9,'{}',0); commit;" >"$CONC_B_OUT" 2>&1
) & CONC_B_PID=$!
wait "$CONC_A_PID" || { cat "$CONC_A_OUT" >&2; fail 'concurrent writer A completed without database failure'; }
wait "$CONC_B_PID" || { cat "$CONC_B_OUT" >&2; fail 'concurrent writer B completed without database failure'; }
CONC_A_RESULT="$(grep -E '^(saved|conflict):' "$CONC_A_OUT" | tail -1)"; CONC_B_RESULT="$(grep -E '^(saved|conflict):' "$CONC_B_OUT" | tail -1)"
[[ "$CONC_A_RESULT" == 'saved:1:GRADED:7' ]] || fail "concurrent writer A saves revision 1 (got '$CONC_A_RESULT')"; pass 'concurrent writer A saves revision 1'
[[ "$CONC_B_RESULT" == 'conflict:1:GRADED:7' ]] || fail "concurrent writer B returns canonical conflict (got '$CONC_B_RESULT')"; pass 'concurrent writer B returns canonical conflict after serialization'
expect_value 'concurrent first creation leaves one current Result' "$A select count(*) from public.assessment_results where assessment_id='$CONC_ASSESS' and enrollment_id='$ENROLL';" '1'
expect_value 'concurrent losing write creates no duplicate Attempt' "$A select count(*) from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$CONC_ASSESS' and enrollment_id='$ENROLL');" '1'
expect_value 'concurrent winner alone records AppliedOperation' "$A select count(*) from public.applied_operations where op_id in ('$CONC_OP_A','$CONC_OP_B');" '1'
expect_value 'concurrent canonical Result reflects winner' "$A select state||':'||score||':'||revision from public.assessment_results where assessment_id='$CONC_ASSESS' and enrollment_id='$ENROLL';" 'GRADED:7:1'
if grep -Eqi 'duplicate key|unique constraint|23505' "$CONC_A_OUT" "$CONC_B_OUT"; then fail 'concurrent first creation leaked unique violation'; fi; pass 'concurrent first creation leaks no unique violation'

expect_value 'correction session is explicit active workflow progress' "$A insert into public.correction_sessions(id,workspace_id,assessment_id,class_id,status) values('$SESSION',$AW,'$ASSESS','30000000-0000-0000-0000-000000000001','active');select status||':'||(completed_at is null)::text from public.correction_sessions where id='$SESSION';" 'active:true'
expect_value 'explicit completion survives reread' "$A update public.correction_sessions set status='completed',completed_at=now(),updated_at=now() where id='$SESSION';select status||':'||(completed_at is not null)::text from public.correction_sessions where id='$SESSION';" 'completed:true'
expect_value 'foreign account cannot see correction session' "$B select count(*) from public.correction_sessions where id='$SESSION';" '0'
expect_fail 'anonymous correction session access denied' "$ANON select * from public.correction_sessions;"
expect_value 'schema version is rapid correction' "$A select version from public.app_schema_version where id=1;" 'r3.3-rapid-correction.1'
printf '\nR3.3 Rapid Correction database contract matrix completed successfully.\n'
