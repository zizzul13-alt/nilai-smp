#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]] || fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err; then fail "$label (unexpected success)"; fi; pass "$label"; }
expect_sqlstate(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "do \$\$ begin begin $sql; exception when others then raise notice 'SAFEWORK_SQLSTATE:%', sqlstate; end; end \$\$;" 2>&1 | sed -n 's/.*SAFEWORK_SQLSTATE://p' | tail -1)"; [[ "$actual" == "$expected" ]] || fail "$label (expected SQLSTATE '$expected', got '$actual')"; pass "$label"; }
"${PSQL[@]}" -f tests/database/bootstrap_supabase_compat.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609030001_foundation_schema_version.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609040001_academic_spine.sql >/dev/null
"${PSQL[@]}" -f tests/database/seed_owned_data.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609040002_safe_work_engine.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609040003_teaching_core.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
C="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000c\",\"role\":\"authenticated\"}';"
ANON="set role anon; set request.jwt.claims = '{\"role\":\"anon\"}';"
expect_value 'A reads own students' "$A select count(*) from public.students;" '2'
expect_value 'B cannot read A students' "$B select count(*) from public.students;" '0'
expect_fail 'anonymous applied-operation read denied' "$ANON select * from public.applied_operations;"
OP="60000000-0000-0000-0000-000000000001"; STUDENT="40000000-0000-0000-0000-000000000001"
expect_value 'first rename applies revision N+1' "$A select outcome||':'||revision||':'||replayed from public.apply_student_rename_operation('$OP','$STUDENT','Budi Baru',1);" 'saved:2:false'
expect_value 'business mutation applied once' "$A select display_name||':'||revision from public.students where id='$STUDENT';" 'Budi Baru:2'
expect_value 'lost ACK retry returns prior success' "$A select outcome||':'||revision||':'||replayed from public.apply_student_rename_operation('$OP','$STUDENT','Budi Baru',1);" 'saved:2:true'
expect_value 'lost ACK retry did not increment twice' "$A select revision from public.students where id='$STUDENT';" '2'
expect_value 'ledger contains exactly one operation' "$A select count(*) from public.applied_operations where op_id='$OP';" '1'
expect_sqlstate 'same op id changed payload has stable permanent class' "$A perform * from public.apply_student_rename_operation('$OP','$STUDENT','Tampered',1)" 'P3202'
expect_value 'stale revision becomes conflict' "$A select outcome||':'||revision from public.apply_student_rename_operation('60000000-0000-0000-0000-000000000002','$STUDENT','Stale',1);" 'conflict:2'
expect_value 'conflict did not overwrite server' "$A select display_name||':'||revision from public.students where id='$STUDENT';" 'Budi Baru:2'
expect_sqlstate 'B foreign target is classified as target not owned/found' "$B perform * from public.apply_student_rename_operation('60000000-0000-0000-0000-000000000003','$STUDENT','Stolen',2)" 'P3203'
expect_sqlstate 'workspace missing has stable permanent class' "$C perform * from public.apply_student_rename_operation('60000000-0000-0000-0000-000000000004','$STUDENT','No Workspace',2)" 'P3201'
expect_sqlstate 'owned workspace missing target has stable permanent class' "$A perform * from public.apply_student_rename_operation('60000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000099','Missing',2)" 'P3203'
expect_sqlstate 'missing auth identity has stable retryable class' "set role authenticated; set request.jwt.claims = '{\"role\":\"authenticated\"}'; perform * from public.apply_student_rename_operation('60000000-0000-0000-0000-000000000006','$STUDENT','No Auth',2)" '28000'
expect_value 'B cannot see A applied ledger' "$B select count(*) from public.applied_operations;" '0'

# Teaching Core owned fixtures for A.
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"
BW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b')"
MAT="71000000-0000-0000-0000-000000000001"; LES="72000000-0000-0000-0000-000000000001"; LV1="73000000-0000-0000-0000-000000000001"; LV2="73000000-0000-0000-0000-000000000002"; M1="74000000-0000-0000-0000-000000000001"; M2="74000000-0000-0000-0000-000000000002"; ACT="76000000-0000-0000-0000-000000000001"
expect_value 'A creates owned Material' "$A insert into public.materials(id,workspace_id,title) values('$MAT',$AW,'Gerak'); select title from public.materials where id='$MAT';" 'Gerak'
expect_value 'A creates Lesson under Material' "$A insert into public.lessons(id,workspace_id,material_id,title) values('$LES',$AW,'$MAT','Gerak Lurus'); select title from public.lessons where id='$LES';" 'Gerak Lurus'
expect_value 'LessonVersion 1 allowed' "$A insert into public.lesson_versions(id,workspace_id,lesson_id,version_number,content_text) values('$LV1',$AW,'$LES',1,'v1 immutable'); select content_text from public.lesson_versions where id='$LV1';" 'v1 immutable'
expect_fail 'LessonVersion 1 canonical content cannot be updated' "$A update public.lesson_versions set content_text='rewritten history' where id='$LV1';"
expect_value 'LessonVersion 1 remains unchanged after rejected update' "$A select content_text from public.lesson_versions where id='$LV1';" 'v1 immutable'
expect_value 'LessonVersion 2 allowed' "$A insert into public.lesson_versions(id,workspace_id,lesson_id,version_number,content_text) values('$LV2',$AW,'$LES',2,'v2 revised'); select count(*) from public.lesson_versions where lesson_id='$LES';" '2'
expect_fail 'duplicate LessonVersion number rejected' "$A insert into public.lesson_versions(workspace_id,lesson_id,version_number) values($AW,'$LES',2);"
expect_value 'previous LessonVersion remains unchanged' "$A select content_text from public.lesson_versions where id='$LV1';" 'v1 immutable'
expect_value 'lessonless Meeting is valid' "$A insert into public.meetings(id,workspace_id,class_id,occurred_at) values('$M1',$AW,'30000000-0000-0000-0000-000000000001','2026-09-04T08:00:00Z'); select (lesson_id is null)::text from public.meetings where id='$M1';" 'true'
expect_value 'Meeting with matching LessonVersion context valid' "$A insert into public.meetings(id,workspace_id,class_id,lesson_id,lesson_version_id,occurred_at) values('$M2',$AW,'30000000-0000-0000-0000-000000000001','$LES','$LV2','2026-09-05T08:00:00Z'); select lesson_version_id from public.meetings where id='$M2';" "$LV2"
expect_value 'Meeting does not rewrite canonical LessonVersion' "$A select content_text from public.lesson_versions where id='$LV2';" 'v2 revised'
expect_value 'multiple Checkpoints per Meeting allowed' "$A insert into public.checkpoints(workspace_id,meeting_id,sequence_no,stopped_at,next_step,recorded_at) values($AW,'$M1',1,'halaman 10','lanjut halaman 11','2026-09-04T09:00:00Z'),($AW,'$M1',2,'halaman 14','latihan 1','2026-09-04T09:30:00Z'); select count(*) from public.checkpoints where meeting_id='$M1';" '2'
expect_value 'latest continuity distinguishable' "$A select stopped_at from public.checkpoints where meeting_id='$M1' order by recorded_at desc,sequence_no desc limit 1;" 'halaman 14'
expect_value 'Activity exists without Assessment' "$A insert into public.activities(id,workspace_id,class_id,title) values('$ACT',$AW,'30000000-0000-0000-0000-000000000001','Eksperimen GLB'); select title from public.activities where id='$ACT';" 'Eksperimen GLB'
expect_value 'Activity spans two Meetings' "$A insert into public.activity_meetings(workspace_id,class_id,activity_id,meeting_id) values($AW,'30000000-0000-0000-0000-000000000001','$ACT','$M1'),($AW,'30000000-0000-0000-0000-000000000001','$ACT','$M2'); select count(*) from public.activity_meetings where activity_id='$ACT';" '2'
expect_fail 'duplicate ActivityMeeting link rejected' "$A insert into public.activity_meetings(workspace_id,class_id,activity_id,meeting_id) values($AW,'30000000-0000-0000-0000-000000000001','$ACT','$M1');"

# B owned graph provides deterministic foreign-workspace attack targets.
BY="81000000-0000-0000-0000-000000000001"; BP="82000000-0000-0000-0000-000000000001"; BC="83000000-0000-0000-0000-000000000001"; BM="84000000-0000-0000-0000-000000000001"; BL="85000000-0000-0000-0000-000000000001"; BV="86000000-0000-0000-0000-000000000001"; BMEET="87000000-0000-0000-0000-000000000001"
run "$B insert into public.academic_years(id,workspace_id,identity_key,display_name,sort_order) values('$BY',$BW,'b-year','B Year',1); insert into public.academic_periods(id,workspace_id,academic_year_id,identity_key,display_name,sort_order) values('$BP',$BW,'$BY','b-p','B Period',1); insert into public.classes(id,workspace_id,academic_period_id,identity_key,display_name) values('$BC',$BW,'$BP','b-class','B Class'); insert into public.materials(id,workspace_id,title) values('$BM',$BW,'B Material'); insert into public.lessons(id,workspace_id,material_id,title) values('$BL',$BW,'$BM','B Lesson'); insert into public.lesson_versions(id,workspace_id,lesson_id,version_number) values('$BV',$BW,'$BL',1); insert into public.meetings(id,workspace_id,class_id,occurred_at) values('$BMEET',$BW,'$BC','2026-09-04T08:00:00Z');"
expect_fail 'Material to foreign Lesson relationship impossible' "$A insert into public.lessons(workspace_id,material_id,title) values($AW,'$BM','Attack');"
expect_fail 'LessonVersion to foreign Lesson impossible' "$A insert into public.lesson_versions(workspace_id,lesson_id,version_number) values($AW,'$BL',9);"
expect_fail 'Meeting to foreign Class impossible' "$A insert into public.meetings(workspace_id,class_id,occurred_at) values($AW,'$BC',now());"
expect_fail 'Meeting to foreign Lesson impossible' "$A insert into public.meetings(workspace_id,class_id,lesson_id,occurred_at) values($AW,'30000000-0000-0000-0000-000000000001','$BL',now());"
expect_fail 'Meeting to mismatched LessonVersion impossible' "$A insert into public.meetings(workspace_id,class_id,lesson_id,lesson_version_id,occurred_at) values($AW,'30000000-0000-0000-0000-000000000001','$LES','$BV',now());"
expect_fail 'Checkpoint to foreign Meeting impossible' "$A insert into public.checkpoints(workspace_id,meeting_id,sequence_no,stopped_at) values($AW,'$BMEET',1,'attack');"
expect_fail 'Activity to foreign Class impossible' "$A insert into public.activities(workspace_id,class_id,title) values($AW,'$BC','attack');"
expect_fail 'ActivityMeeting cross-workspace composition impossible' "$A insert into public.activity_meetings(workspace_id,class_id,activity_id,meeting_id) values($AW,'30000000-0000-0000-0000-000000000001','$ACT','$BMEET');"

# Representative RLS attack matrix.
expect_value 'B SELECT cannot see A Material' "$B select count(*) from public.materials where id='$MAT';" '0'
expect_fail 'B INSERT into A workspace denied' "$B insert into public.materials(workspace_id,title) values($AW,'attack');"
expect_value 'B UPDATE A Material affects zero' "$B update public.materials set title='stolen' where id='$MAT'; select count(*) from public.materials where id='$MAT';" '0'
expect_value 'A Material unchanged after B update' "$A select title from public.materials where id='$MAT';" 'Gerak'
expect_value 'B DELETE A Material affects zero' "$B delete from public.materials where id='$MAT'; select count(*) from public.materials where id='$MAT';" '0'
expect_fail 'anonymous Teaching Core access denied' "$ANON select * from public.materials;"
expect_value 'schema version is Teaching Core' "$A select version from public.app_schema_version where id=1;" 'r3.1-teaching-core.1'
printf '\nR3.1 Teaching Core + inherited R3.2 database contract attack matrix completed successfully.\n'
