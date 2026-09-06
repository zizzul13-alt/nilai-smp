#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]]||fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-artifact-out 2>/tmp/nilai-artifact-err;then fail "$label (unexpected success)";fi;pass "$label";}
expect_sqlstate(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "do \$\$ begin begin $sql; exception when others then raise notice 'ARTIFACT_SQLSTATE:%', sqlstate; end; end \$\$;" 2>&1 | sed -n 's/.*ARTIFACT_SQLSTATE://p' | tail -1)"; [[ "$actual" == "$expected" ]]||fail "$label (expected SQLSTATE '$expected', got '$actual')";pass "$label";}

"${PSQL[@]}" -f supabase/migrations/202609060004_artifact_core.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon;set request.jwt.claims='{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"
LES="72000000-0000-0000-0000-000000000001"; LV2="73000000-0000-0000-0000-000000000002"; BV="86000000-0000-0000-0000-000000000001"
REPORT="$(run "$A select id from public.report_snapshots where kind='FINALIZED' order by created_at desc limit 1;")"
[[ -n "$REPORT" ]]||fail 'reporting fixture missing before artifact tests'

CREATE_OP="a6100000-0000-0000-0000-000000000001"
CREATE_CALL="public.create_artifact_operation('$CREATE_OP','RPP','RPP Gerak','LESSON_VERSION','$LES','$LV2',null,'Tujuan dan kegiatan v1','{\"core\":[\"GLB\"]}',null,null)"
expect_value 'creates stable artifact plus version one through RPC' "$A select revision||':'||replayed from $CREATE_CALL;" '1:false'
ART="$(run "$A select id from public.artifacts where title='RPP Gerak';")"; V1="$(run "$A select current_version_id from public.artifacts where id='$ART';")"
expect_value 'lost ACK create replays same artifact/version' "$A select artifact_id||':'||version_id||':'||replayed from $CREATE_CALL;" "$ART:$V1:true"
expect_value 'create replay does not duplicate artifact' "$A select count(*) from public.artifacts where title='RPP Gerak';" '1'
expect_sqlstate 'same create op id with changed content fails closed' "$A perform * from public.create_artifact_operation('$CREATE_OP','RPP','RPP Gerak','LESSON_VERSION','$LES','$LV2',null,'tampered','{}',null,null)" 'P3202'
expect_value 'version one preserves exact LessonVersion provenance' "$A select source_kind||':'||lesson_id||':'||lesson_version_id from public.artifact_versions where id='$V1';" "LESSON_VERSION:$LES:$LV2"
expect_fail 'browser cannot rewrite artifact canonical version' "$A update public.artifact_versions set canonical_text='rewritten history' where id='$V1';"
expect_value 'old version remains immutable after denied rewrite' "$A select canonical_text from public.artifact_versions where id='$V1';" 'Tujuan dan kegiatan v1'
expect_value 'foreign user cannot read artifact metadata' "$B select count(*) from public.artifacts where id='$ART';" '0'
expect_sqlstate 'foreign or mismatched LessonVersion source fails closed' "$A perform * from public.append_artifact_version_operation('a6100000-0000-0000-0000-000000000099','$ART',1,'LESSON_VERSION','$LES','$BV',null,'attack','{}',null,null)" 'P3602'

APPEND_OP="a6200000-0000-0000-0000-000000000001"
APPEND_CALL="public.append_artifact_version_operation('$APPEND_OP','$ART',1,'REPORT_SNAPSHOT',null,null,'$REPORT','RPP revisi dari snapshot','{\"note\":\"factual revision\"}',null,null)"
expect_value 'append creates version two and advances artifact revision' "$A select outcome||':'||version_no||':'||revision||':'||replayed from $APPEND_CALL;" 'saved:2:2:false'
V2="$(run "$A select current_version_id from public.artifacts where id='$ART';")"
expect_value 'append lost ACK replays exact version' "$A select version_id||':'||replayed from $APPEND_CALL;" "$V2:true"
expect_value 'version history remains append-only' "$A select count(*) from public.artifact_versions where artifact_id='$ART';" '2'
expect_value 'version one content still intact after version two' "$A select canonical_text from public.artifact_versions where id='$V1';" 'Tujuan dan kegiatan v1'
expect_value 'current_version belongs exact stable artifact' "$A select (v.artifact_id=a.id)::text from public.artifacts a join public.artifact_versions v on v.id=a.current_version_id where a.id='$ART';" 'true'
expect_value 'version two preserves exact report snapshot source' "$A select source_kind||':'||report_snapshot_id from public.artifact_versions where id='$V2';" "REPORT_SNAPSHOT:$REPORT"
expect_value 'stale expected revision returns conflict not overwrite' "$A select outcome||':'||revision from public.append_artifact_version_operation('a6200000-0000-0000-0000-000000000002','$ART',1,'MANUAL',null,null,null,'stale','{}',null,null);" 'conflict:2'

RESERVE_OP="a6300000-0000-0000-0000-000000000001"
RESERVE_CALL="public.reserve_artifact_object_operation('$RESERVE_OP','$ART','$V2','PDF','application/pdf',1234)"
expect_value 'reserve creates durable PENDING_UPLOAD metadata' "$A select outcome||':'||replayed from $RESERVE_CALL;" 'saved:false'
OBJ="$(run "$A select id from public.artifact_objects where artifact_version_id='$V2' and object_kind='PDF';")"; PATH="$(run "$A select storage_path from public.artifact_objects where id='$OBJ';")"
expect_value 'reservation lost ACK replays exact object' "$A select object_id||':'||storage_path||':'||replayed from $RESERVE_CALL;" "$OBJ:$PATH:true"
expect_value 'opaque storage path is workspace/artifact/version scoped' "$A select (storage_path like workspace_id::text||'/'||artifact_id::text||'/'||artifact_version_id::text||'/%')::text from public.artifact_objects where id='$OBJ';" 'true'
expect_value 'reserved object is visibly pending without fake checksum' "$A select state||':'||(sha256 is null)::text from public.artifact_objects where id='$OBJ';" 'PENDING_UPLOAD:true'
expect_sqlstate 'duplicate object kind cannot silently overwrite same artifact version' "$A perform * from public.reserve_artifact_object_operation('a6300000-0000-0000-0000-000000000002','$ART','$V2','PDF','application/pdf',1234)" 'P3607'
HASH="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; CONFIRM_OP="a6400000-0000-0000-0000-000000000001"
CONFIRM_CALL="public.confirm_artifact_object_operation('$CONFIRM_OP','$OBJ','$HASH',1234)"
expect_value 'confirm makes object READY only with checksum and exact size' "$A select outcome||':'||replayed from $CONFIRM_CALL;" 'saved:false'
expect_value 'confirm lost ACK replays prior success' "$A select outcome||':'||replayed from $CONFIRM_CALL;" 'saved:true'
expect_value 'READY object preserves SHA-256 size MIME and confirmed timestamp' "$A select state||':'||sha256||':'||byte_size||':'||mime_type||':'||(confirmed_at is not null)::text from public.artifact_objects where id='$OBJ';" "READY:$HASH:1234:application/pdf:true"
expect_sqlstate 'confirmation with invalid SHA fails closed' "$A perform * from public.confirm_artifact_object_operation('a6400000-0000-0000-0000-000000000099','$OBJ','bad',1234)" '22023'
expect_fail 'browser cannot directly rewrite object metadata' "$A update public.artifact_objects set sha256=repeat('f',64) where id='$OBJ';"

ARCHIVE_OP="a6500000-0000-0000-0000-000000000001"
expect_value 'archive is explicit revisioned lifecycle change' "$A select outcome||':'||revision||':'||replayed from public.archive_artifact_operation('$ARCHIVE_OP','$ART',2);" 'saved:3:false'
expect_value 'archive lost ACK replays exact result' "$A select outcome||':'||revision||':'||replayed from public.archive_artifact_operation('$ARCHIVE_OP','$ART',2);" 'saved:3:true'
expect_value 'archive preserves versions and READY object' "$A select a.status||':'||(select count(*) from public.artifact_versions v where v.artifact_id=a.id)||':'||(select count(*) from public.artifact_objects o where o.artifact_id=a.id and o.state='READY') from public.artifacts a where a.id='$ART';" 'archived:2:1'
expect_sqlstate 'archived artifact cannot append new history' "$A perform * from public.append_artifact_version_operation('a6200000-0000-0000-0000-000000000099','$ART',3,'MANUAL',null,null,null,'nope','{}',null,null)" 'P3605'
expect_fail 'anonymous artifact read denied' "$ANON select * from public.artifacts limit 1;"
expect_value 'foreign user cannot read artifact object' "$B select count(*) from public.artifact_objects where id='$OBJ';" '0'
expect_value 'important artifact workflow is audited' "$A select count(*) from public.audit_events where entity_id='$ART' and event_type in('artifact.created','artifact.version.appended','artifact.archived');" '3'
expect_value 'plain PostgreSQL CI safely lacks Supabase storage schema' "select (to_regclass('storage.objects') is null)::text;" 'true'
expect_value 'schema version advances to R3.5 artifact core' "$A select version from public.app_schema_version where id=1;" 'r3.5-artifact-core.1'

printf '\nR3.5-02 Artifact Core PostgreSQL matrix completed successfully.\n'
