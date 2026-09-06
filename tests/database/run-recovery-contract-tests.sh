#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"

"${PSQL[@]}" -f supabase/migrations/202609070001_recovery_portable_backup.sql >/dev/null
BEFORE="$(run "$A select count(*) from public.assessment_results;")"
run "$A select public.export_portable_backup()::text;" > /tmp/nilai-portable-backup.json
[[ -s /tmp/nilai-portable-backup.json ]]||fail 'portable export produced empty file'
AFTER="$(run "$A select count(*) from public.assessment_results;")"
[[ "$BEFORE" == "$AFTER" ]]||fail 'export mutated canonical source';pass 'portable export leaves old source untouched'
FORMAT="$(python3 -c 'import json;print(json.load(open("/tmp/nilai-portable-backup.json"))["format"])')"
[[ "$FORMAT" == 'nilai-smp-portable-backup' ]]||fail 'portable format identity missing';pass 'portable export has explicit format identity'
python3 - <<'PY'
import json
p='/tmp/nilai-portable-backup.json'
x=json.load(open(p)); x['checksum_sha256']='a'*64
open('/tmp/nilai-portable-backup-with-checksum.json','w').write(json.dumps(x,separators=(',',':')))
assert 'artifact_objects' in x['tables'] and 'assessment_results' in x['tables'] and 'report_snapshots' in x['tables']
PY
pass 'portable manifest includes academic, reporting and artifact metadata'

RESTORE_DB="nilai_smp_restore_test"
"${PSQL[@]}" -qc "drop database if exists $RESTORE_DB with (force);"
"${PSQL[@]}" -qc "create database $RESTORE_DB;"
RESTORE_URL="${DB_URL%/*}/$RESTORE_DB"; RPSQL=(psql "$RESTORE_URL" -X -v ON_ERROR_STOP=1)
"${RPSQL[@]}" -f tests/database/bootstrap_supabase_existing_roles.sql >/dev/null
for migration in $(find supabase/migrations -maxdepth 1 -name '*.sql'|sort);do "${RPSQL[@]}" -f "$migration" >/dev/null;done
RA="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
"${RPSQL[@]}" -qAtc "$RA select id from public.bootstrap_personal_workspace();" >/dev/null

restore_from_file(){
  local op_id="$1"
  "${RPSQL[@]}" -qAt <<SQL
create temporary table portable_input(payload text);
\copy portable_input(payload) from '/tmp/nilai-portable-backup-with-checksum.json'
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select outcome||':'||restored_rows||':'||replayed from public.restore_portable_backup_operation('$op_id',(select payload::jsonb from portable_input));
SQL
}
RESULT="$(restore_from_file 'a7000000-0000-4000-8000-000000000001' | tail -1 | tr -d '[:space:]')"
[[ "$RESULT" == restored:*:false ]]||fail "restore-to-empty failed ($RESULT)";pass 'restore-to-empty applies portable manifest atomically'

TABLES=(academic_years academic_periods classes students enrollments materials lessons lesson_versions meetings checkpoints activities activity_meetings scoring_profiles assessments assessment_results assessment_attempts correction_sessions continuity_baselines lesson_pacing_plans reporting_policies reporting_cycles report_snapshots report_snapshot_rows audit_events artifacts artifact_versions artifact_objects)
for table in "${TABLES[@]}";do
  SRC="$(run "$A select count(*) from public.$table;")"; DST="$("${RPSQL[@]}" -qAtc "$RA select count(*) from public.$table;")"
  [[ "$SRC" == "$DST" ]]||fail "$table restore count mismatch source=$SRC target=$DST"
done
pass 'restore preserves canonical row cardinality across full graph'
SRC_IDS="$(run "$A select string_agg(id::text,',' order by id) from public.students;")";DST_IDS="$("${RPSQL[@]}" -qAtc "$RA select string_agg(id::text,',' order by id) from public.students;")"
[[ "$SRC_IDS" == "$DST_IDS" ]]||fail 'stable Student IDs changed during restore';pass 'restore preserves stable domain IDs'
READY_SRC="$(run "$A select count(*) from public.artifact_objects where state='READY';")";PENDING_DST="$("${RPSQL[@]}" -qAtc "$RA select count(*) from public.artifact_objects where state='PENDING_UPLOAD';")"
[[ "$READY_SRC" -le "$PENDING_DST" ]]||fail 'restored artifact metadata falsely remained READY';pass 'restored artifact bytes require re-confirmation before READY'
CURRENT_LINKS="$("${RPSQL[@]}" -qAtc "$RA select count(*) from public.artifacts a join public.artifact_versions v on v.id=a.current_version_id and v.artifact_id=a.id;")";ARTS="$("${RPSQL[@]}" -qAtc "$RA select count(*) from public.artifacts;")"
[[ "$CURRENT_LINKS" == "$ARTS" ]]||fail 'artifact current-version links not reconstructed';pass 'artifact current-version links reconstructed after version restore'
REPORT_LINKS="$("${RPSQL[@]}" -qAtc "$RA select count(*) from public.reporting_cycles c where current_snapshot_id is null or exists(select 1 from public.report_snapshots s where s.id=c.current_snapshot_id and s.cycle_id=c.id);")";CYCLES="$("${RPSQL[@]}" -qAtc "$RA select count(*) from public.reporting_cycles;")"
[[ "$REPORT_LINKS" == "$CYCLES" ]]||fail 'report current snapshot links invalid';pass 'report cycle current-snapshot links reconstructed'
REPLAY="$(restore_from_file 'a7000000-0000-4000-8000-000000000001' | tail -1 | tr -d '[:space:]')"
[[ "$REPLAY" == restored:*:true ]]||fail 'restore lost-ACK replay not idempotent';pass 'restore operation replays after lost acknowledgement'
if restore_from_file 'a7000000-0000-4000-8000-000000000002' >/tmp/recovery-out 2>/tmp/recovery-err;then fail 'second independent restore unexpectedly merged into non-empty target';fi
pass 'restore refuses non-empty target instead of merging histories'
B_VISIBLE="$("${RPSQL[@]}" -qAtc "$B select count(*) from public.students;")";[[ "$B_VISIBLE" == '0' ]]||fail 'foreign account can see restored rows';pass 'restored graph remains RLS-owned'
SCHEMA="$("${RPSQL[@]}" -qAtc "$RA select version from public.app_schema_version where id=1;")";[[ "$SCHEMA" == 'r3.6-recovery.1' ]]||fail 'schema identity not advanced';pass 'schema identity advances to r3.6-recovery.1'
"${PSQL[@]}" -qc "drop database if exists $RESTORE_DB with (force);"
printf '\nR3.6-01 portable backup/restore PostgreSQL acceptance completed successfully.\n'
