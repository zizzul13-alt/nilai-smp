#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]]||fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err;then fail "$label (unexpected success)";fi;pass "$label";}
expect_sqlstate(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "do \$\$ begin begin $sql; exception when others then raise notice 'REPORT_SQLSTATE:%', sqlstate; end; end \$\$;" 2>&1 | sed -n 's/.*REPORT_SQLSTATE://p' | tail -1)"; [[ "$actual" == "$expected" ]]||fail "$label (expected SQLSTATE '$expected', got '$actual')";pass "$label";}

"${PSQL[@]}" -f supabase/migrations/202609060003_reporting_core.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon;set request.jwt.claims='{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"
PERIOD="20000000-0000-0000-0000-000000000001"; CLASS="a5000000-0000-0000-0000-000000000001"; STUDENT="a5000000-0000-0000-0000-000000000002"; ENROLL="a5000000-0000-0000-0000-000000000003"; A1="a5000000-0000-0000-0000-000000000004"; A2="a5000000-0000-0000-0000-000000000005"
run "$A insert into public.classes(id,workspace_id,academic_period_id,identity_key,display_name) values('$CLASS',$AW,'$PERIOD','report-test','Reporting Test'); insert into public.students(id,workspace_id,display_name) values('$STUDENT',$AW,'Siswa Reporting'); insert into public.enrollments(id,workspace_id,student_id,class_id) values('$ENROLL',$AW,'$STUDENT','$CLASS'); insert into public.assessments(id,workspace_id,class_id,academic_period_id,title) values('$A1',$AW,'$CLASS','$PERIOD','Evidence 1'),('$A2',$AW,'$CLASS','$PERIOD','Evidence 2');"
run "$A select * from public.record_assessment_judgement('$A1','$ENROLL','GRADED',65,'REMEDIAL',80,'{\"source\":\"teacher\"}');" >/dev/null
expect_value 'raw REMEDIAL Attempt evidence remains 80 while canonical Result is 65' "$A select r.score||':'||a.raw_score from public.assessment_results r join public.assessment_attempts a on a.result_id=r.id where r.assessment_id='$A1' and r.enrollment_id='$ENROLL' and a.attempt_kind='REMEDIAL';" '65:80'

POLICY_OP="a5100000-0000-0000-0000-000000000001"
POLICY_CALL="public.create_reporting_policy_operation('$POLICY_OP','$PERIOD','Rapor Test',null,'EXCLUDE','CURRENT_RESULT','INTEGER',60)"
expect_value 'creates versioned reporting policy through idempotent RPC' "$A select version_no||':'||replayed from $POLICY_CALL;" '1:false'
POLICY="$(run "$A select id from public.reporting_policies where policy_key='$POLICY_OP';")"
expect_value 'lost ACK policy retry replays same identity' "$A select version_no||':'||replayed from $POLICY_CALL;" '1:true'
expect_value 'policy series has one row after replay' "$A select count(*) from public.reporting_policies where policy_key='$POLICY_OP';" '1'
expect_sqlstate 'same policy op id with changed payload fails closed' "$A perform * from public.create_reporting_policy_operation('$POLICY_OP','$PERIOD','Tampered',null,'ZERO','CURRENT_RESULT','INTEGER',60)" 'P3202'
expect_sqlstate 'raw Attempt cannot be promoted by unsupported BEST remedial policy' "$A perform * from public.create_reporting_policy_operation('a5100000-0000-0000-0000-000000000099','$PERIOD','Unsafe',null,'EXCLUDE','BEST_OF_CURRENT_AND_REMEDIAL','INTEGER',60)" '22023'
expect_fail 'browser cannot directly mutate reporting policy' "$A update public.reporting_policies set missing_policy='ZERO' where id='$POLICY';"
expect_value 'foreign user cannot read owner reporting policy' "$B select count(*) from public.reporting_policies where id='$POLICY';" '0'

SNAP1="a5200000-0000-0000-0000-000000000001"
expect_value 'provisional snapshot tolerates truthful UNCHECKED state' "$A select outcome||':'||revision||':'||replayed from public.calculate_report_snapshot_operation('$SNAP1','$CLASS','$POLICY',false,0);" 'saved:1:false'
CYCLE="$(run "$A select id from public.reporting_cycles where class_id='$CLASS';")"; S1="$(run "$A select current_snapshot_id from public.reporting_cycles where id='$CYCLE';")"
expect_value 'provisional row reports canonical current Result and preserves UNCHECKED count' "$A select reported_score||':'||graded_count||':'||unchecked_count from public.report_snapshot_rows where snapshot_id='$S1';" '65:1:1'
expect_value 'raw remedial 80 is not promoted over current Result 65' "$A select reported_score from public.report_snapshot_rows where snapshot_id='$S1';" '65'
expect_value 'snapshot records one-statement source consistency contract' "$A select source_summary->>'source_consistency' from public.report_snapshots where id='$S1';" 'ONE_STATEMENT_MVCC'
expect_value 'provisional snapshot is explicit, not finalized' "$A select kind from public.report_snapshots where id='$S1';" 'PROVISIONAL'
expect_value 'lost ACK snapshot retry replays without duplicate snapshot' "$A select outcome||':'||revision||':'||replayed from public.calculate_report_snapshot_operation('$SNAP1','$CLASS','$POLICY',false,0);" 'saved:1:true'
expect_value 'snapshot replay kept append-only count stable' "$A select count(*) from public.report_snapshots where cycle_id='$CYCLE';" '1'
expect_sqlstate 'finalization is blocked while UNCHECKED evidence remains' "$A perform * from public.calculate_report_snapshot_operation('a5200000-0000-0000-0000-000000000002','$CLASS','$POLICY',true,1)" 'P3506'
expect_value 'blocked finalize does not create partial snapshot' "$A select count(*) from public.report_snapshots where cycle_id='$CYCLE';" '1'

run "$A select * from public.record_assessment_judgement('$A2','$ENROLL','MISSING',null,null,null,'{}');" >/dev/null
expect_value 'finalize succeeds after every assessment has explicit state' "$A select outcome||':'||revision from public.calculate_report_snapshot_operation('a5200000-0000-0000-0000-000000000003','$CLASS','$POLICY',true,1);" 'saved:2'
FINAL1="$(run "$A select current_snapshot_id from public.reporting_cycles where id='$CYCLE';")"
expect_value 'Missing EXCLUDE keeps score based on graded evidence' "$A select reported_score||':'||missing_count||':'||unchecked_count||':'||meets_kkm from public.report_snapshot_rows where snapshot_id='$FINAL1';" '65:1:0:true'
expect_value 'final snapshot records source locking' "$A select source_summary->>'finalize_source_lock' from public.report_snapshots where id='$FINAL1';" 'true'
expect_value 'cycle closes intentionally on finalized snapshot' "$A select status||':'||revision from public.reporting_cycles where id='$CYCLE';" 'FINALIZED:2'
expect_sqlstate 'closed reporting cycle cannot silently recalculate' "$A perform * from public.calculate_report_snapshot_operation('a5200000-0000-0000-0000-000000000004','$CLASS','$POLICY',false,2)" 'P3507'

POLICY2_OP="a5100000-0000-0000-0000-000000000002"
expect_value 'new policy version preserves series identity and changes Missing policy only' "$A select version_no from public.create_reporting_policy_operation('$POLICY2_OP','$PERIOD','Rapor Test v2','$POLICY_OP','ZERO','CURRENT_RESULT','INTEGER',60);" '2'
POLICY2="$(run "$A select id from public.reporting_policies where policy_key='$POLICY_OP' and version_no=2;")"
REOPEN="a5300000-0000-0000-0000-000000000001"
expect_value 'explicit reopen increments cycle revision' "$A select outcome||':'||revision||':'||replayed from public.reopen_reporting_cycle_operation('$REOPEN','$CYCLE','Koreksi kebijakan missing',2);" 'saved:3:false'
expect_value 'reopen lost ACK returns prior success' "$A select outcome||':'||revision||':'||replayed from public.reopen_reporting_cycle_operation('$REOPEN','$CYCLE','Koreksi kebijakan missing',2);" 'saved:3:true'
expect_value 'reopen keeps previous finalized snapshot immutable' "$A select kind from public.report_snapshots where id='$FINAL1';" 'FINALIZED'
expect_value 'reopen is audited with required reason' "$A select metadata->>'reason' from public.audit_events where entity_id='$CYCLE' and event_type='reporting.cycle.reopened' order by created_at desc limit 1;" 'Koreksi kebijakan missing'

expect_value 'policy v2 preview uses current Result plus Missing ZERO explicitly' "$A select outcome||':'||revision from public.calculate_report_snapshot_operation('a5200000-0000-0000-0000-000000000005','$CLASS','$POLICY2',false,3);" 'saved:4'
S2="$(run "$A select current_snapshot_id from public.reporting_cycles where id='$CYCLE';")"
expect_value 'current Result 65 plus Missing ZERO averages 32.5 and INTEGER rounds to 33' "$A select reported_score||':'||missing_count||':'||meets_kkm from public.report_snapshot_rows where snapshot_id='$S2';" '33:1:false'
expect_value 'calculation entry preserves current Result rather than raw Attempt evidence' "$A select calculation->'entries'->0->>'current_score' from public.report_snapshot_rows where snapshot_id='$S2';" '65'

# Finalize must wait for an in-flight canonical Result writer, then capture the committed value consistently.
# The writer changes the current interpreted Result from 65 to 70 and keeps its ROW EXCLUSIVE table lock for 2 seconds.
"${PSQL[@]}" -qAtc "begin; update public.assessment_results set score=70,updated_at=now() where workspace_id=$AW and assessment_id='$A1' and enrollment_id='$ENROLL'; select pg_sleep(2); commit;" >/tmp/reporting-writer.out 2>/tmp/reporting-writer.err &
WRITER_PID=$!
for _ in $(seq 1 30); do
  if [[ "$(run "select count(*) from pg_locks where relation='public.assessment_results'::regclass and mode='RowExclusiveLock' and granted;")" != "0" ]]; then break; fi
  sleep 0.1
done
[[ "$(run "select count(*) from pg_locks where relation='public.assessment_results'::regclass and mode='RowExclusiveLock' and granted;")" != "0" ]] || fail 'writer failed to acquire Result table lock'
"${PSQL[@]}" -qAtc "$A select outcome||':'||revision from public.calculate_report_snapshot_operation('a5200000-0000-0000-0000-000000000006','$CLASS','$POLICY2',true,4);" >/tmp/reporting-finalize.out 2>/tmp/reporting-finalize.err &
FINALIZE_PID=$!
sleep 0.3
if kill -0 "$FINALIZE_PID" 2>/dev/null; then pass 'finalize waits behind concurrent canonical Result writer'; else cat /tmp/reporting-finalize.err >&2 || true; fail 'finalize did not wait for source writer'; fi
wait "$WRITER_PID" || { cat /tmp/reporting-writer.err >&2; fail 'concurrent Result writer failed'; }
wait "$FINALIZE_PID" || { cat /tmp/reporting-finalize.err >&2; fail 'finalize after source writer failed'; }
[[ "$(tail -n1 /tmp/reporting-finalize.out)" == 'saved:5' ]] || fail "finalize after source writer returned unexpected result ($(cat /tmp/reporting-finalize.out))"
pass 'finalize succeeds after source writer commits'

FINAL2="$(run "$A select current_snapshot_id from public.reporting_cycles where id='$CYCLE';")"
expect_value 'final snapshot sees committed Result 70 plus Missing ZERO consistently' "$A select reported_score||':'||missing_count||':'||meets_kkm from public.report_snapshot_rows where snapshot_id='$FINAL2';" '35:1:false'
expect_value 'new finalized snapshot does not overwrite old finalized snapshot' "$A select count(*) from public.report_snapshots where cycle_id='$CYCLE' and kind='FINALIZED';" '2'
expect_value 'final snapshot keeps policy version identity' "$A select reporting_policy_id from public.report_snapshots where id='$FINAL2';" "$POLICY2"
expect_value 'calculation is explainable with preserved per-assessment entries' "$A select jsonb_array_length(calculation->'entries') from public.report_snapshot_rows where snapshot_id='$FINAL2';" '2'
expect_value 'audit records finalization as important academic event' "$A select count(*) from public.audit_events where entity_id='$CYCLE' and event_type='reporting.cycle.finalized';" '2'
expect_fail 'browser cannot directly rewrite finalized snapshot history' "$A update public.report_snapshot_rows set reported_score=999 where snapshot_id='$FINAL2';"
expect_fail 'anonymous reporting read denied' "$ANON select * from public.report_snapshots limit 1;"
expect_value 'foreign user cannot read owner report rows' "$B select count(*) from public.report_snapshot_rows where snapshot_id='$FINAL2';" '0'
expect_value 'schema version advances to R3.5 reporting core' "$A select version from public.app_schema_version where id=1;" 'r3.5-reporting-core.1'

printf '\nR3.5-01 Reporting Core PostgreSQL matrix completed successfully.\n'
