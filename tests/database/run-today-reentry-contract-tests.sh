#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]]||fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err;then fail "$label (unexpected success)";fi;pass "$label";}
expect_sqlstate(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "do \$\$ begin begin $sql; exception when others then raise notice 'TODAY_SQLSTATE:%', sqlstate; end; end \$\$;" 2>&1 | sed -n 's/.*TODAY_SQLSTATE://p' | tail -1)"; [[ "$actual" == "$expected" ]]||fail "$label (expected SQLSTATE '$expected', got '$actual')";pass "$label";}

"${PSQL[@]}" -f supabase/migrations/202609060001_today_reentry.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon;set request.jwt.claims='{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"; BW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b')"
CLASS="30000000-0000-0000-0000-000000000001"; BCLASS="83000000-0000-0000-0000-000000000001"

expect_value 'Today own Class visible' "$A select count(*) from public.read_today_class_contexts() where class_id='$CLASS';" '1'
expect_value 'Today foreign Class invisible' "$B select count(*) from public.read_today_class_contexts() where class_id='$CLASS';" '0'
expect_value 'A cannot receive B Class from ownership-derived Today RPC' "$A select count(*) from public.read_today_class_contexts() where class_id='$BCLASS';" '0'
expect_value 'active Meeting selected for owned Class' "$A select (active_meeting_id is not null)::text from public.read_today_class_contexts() where class_id='$CLASS';" 'true'
expect_value 'latest meaningful checkpoint survives active Meeting boundary' "$A select latest_checkpoint_stopped_at||':'||latest_checkpoint_next_step from public.read_today_class_contexts() where class_id='$CLASS';" 'Halaman 39:Latihan 4'
RECOVERY_MEETING="$(run "$A select active_meeting_id from public.read_today_class_contexts() where class_id='$CLASS';")"
expect_value 'owner exact Meeting recovery lookup returns Class identity' "$A select class_id from public.meetings where id='$RECOVERY_MEETING';" "$CLASS"
expect_value 'foreign exact Meeting recovery lookup discloses no Class identity' "$B select count(*) from public.meetings where id='$RECOVERY_MEETING';" '0'

# A fixed-size class window remains bounded even when Meeting history grows by 1,000 rows.
run "insert into public.meetings(workspace_id,class_id,occurred_at,status) select $AW,'$CLASS','2020-01-01T00:00:00Z'::timestamptz+(g||' hours')::interval,'completed' from generate_series(1,1000) g;"
expect_value 'historical volume does not expand Today response beyond fixed bound' "$A select (count(*)<=24)::text from public.read_today_class_contexts();" 'true'
expect_value 'historical volume does not displace active Meeting selection' "$A select (active_meeting_id is not null)::text from public.read_today_class_contexts() where class_id='$CLASS';" 'true'
expect_value 'historical volume does not break cross-Meeting checkpoint selection' "$A select latest_checkpoint_stopped_at from public.read_today_class_contexts() where class_id='$CLASS';" 'Halaman 39'

ASS="a6000000-0000-0000-0000-000000000001"; SES="a7000000-0000-0000-0000-000000000001"; PERIOD="$(run "select academic_period_id from public.classes where id='$CLASS';")"
run "insert into public.assessments(id,workspace_id,class_id,academic_period_id,title,status) values('$ASS',$AW,'$CLASS','$PERIOD','Today Resume Assessment','active') on conflict(id) do nothing; insert into public.correction_sessions(id,workspace_id,assessment_id,class_id,status,started_at,updated_at) values('$SES',$AW,'$ASS','$CLASS','active','2099-01-01T00:00:00Z','2099-01-01T00:00:00Z') on conflict(id) do nothing;"
expect_value 'active CorrectionSession appears with Assessment and Class identity' "$A select assessment_id||':'||assessment_title||':'||class_id from public.read_today_active_correction();" "$ASS:Today Resume Assessment:$CLASS"
expect_value 'foreign user cannot see A correction session' "$B select count(*) from public.read_today_active_correction() where assessment_id='$ASS';" '0'
expect_value 'Today correction read never creates Attempt evidence' "$A select count(*) from public.assessment_attempts where recorded_at>='2099-01-01T00:00:00Z';" '0'

MEETINGS_BEFORE="$(run "select count(*) from public.meetings where workspace_id=$AW;")"; CHECKPOINTS_BEFORE="$(run "select count(*) from public.checkpoints where workspace_id=$AW;")"; CORRECTIONS_BEFORE="$(run "select count(*) from public.correction_sessions where workspace_id=$AW;")"
QOP="a8000000-0000-0000-0000-000000000001"; SOP="a8000000-0000-0000-0000-000000000002"
expect_value 'Quick Update appends a baseline' "$A select outcome||':'||replayed from public.record_continuity_baseline_operation('$QOP','$CLASS','QUICK_UPDATE','Bab 5 setelah review','Latihan 2');" 'saved:false'
QID="$(run "$A select id from public.continuity_baselines where class_id='$CLASS' and baseline_kind='QUICK_UPDATE' order by recorded_at desc limit 1;")"
expect_value 'lost ACK Quick Update replays same baseline' "$A select baseline_id||':'||replayed from public.record_continuity_baseline_operation('$QOP','$CLASS','QUICK_UPDATE','Bab 5 setelah review','Latihan 2');" "$QID:true"
expect_value 'Quick Update retry did not duplicate history' "$A select count(*) from public.continuity_baselines where class_id='$CLASS' and baseline_kind='QUICK_UPDATE';" '1'
expect_value 'Start From Today appends a new forward baseline' "$A select outcome||':'||replayed from public.record_continuity_baseline_operation('$SOP','$CLASS','START_FROM_TODAY','Mulai dari kondisi hari ini','Lanjut topik baru');" 'saved:false'
expect_value 'new baseline becomes current dispatcher context' "$A select effective_source||':'||effective_stopped_at||':'||effective_next_step from public.read_today_class_contexts() where class_id='$CLASS';" 'baseline:Mulai dari kondisi hari ini:Lanjut topik baru'
expect_value 'baseline actions preserve all historical Meetings' "select (count(*)=$MEETINGS_BEFORE)::text from public.meetings where workspace_id=$AW;" 'true'
expect_value 'baseline actions preserve all historical Checkpoints' "select (count(*)=$CHECKPOINTS_BEFORE)::text from public.checkpoints where workspace_id=$AW;" 'true'
expect_value 'baseline actions preserve unfinished CorrectionSession state' "select (count(*)=$CORRECTIONS_BEFORE)::text from public.correction_sessions where workspace_id=$AW;" 'true'
expect_fail 'authenticated browser cannot direct INSERT a continuity baseline' "$A insert into public.continuity_baselines(workspace_id,class_id,baseline_kind,stopped_at) values($AW,'$CLASS','QUICK_UPDATE','bypass');"
expect_value 'B cannot SELECT A continuity baseline' "$B select count(*) from public.continuity_baselines where id='$QID';" '0'
expect_sqlstate 'foreign Class re-entry write denied' "$A perform * from public.record_continuity_baseline_operation('a8000000-0000-0000-0000-000000000090','$BCLASS','QUICK_UPDATE','attack',null)" 'P3603'
expect_fail 'anonymous Today dispatcher denied' "$ANON select * from public.read_today_class_contexts();"
expect_fail 'anonymous re-entry write denied' "$ANON select * from public.record_continuity_baseline_operation('a8000000-0000-0000-0000-000000000091','$CLASS','QUICK_UPDATE','attack',null);"
expect_value 'schema version advances to Today re-entry head' "$A select version from public.app_schema_version where id=1;" 'r3.4-today-reentry.1'

printf '\nR3.4-02 Today + Re-entry PostgreSQL matrix completed successfully.\n'
