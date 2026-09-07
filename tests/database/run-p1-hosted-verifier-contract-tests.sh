#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }
fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }
run(){ "${PSQL[@]}" -qAtc "$1"; }
verify_pass(){
  local out
  out="$("${PSQL[@]}" -f supabase/verification/p1_hosted_truth.sql 2>&1)" || { printf '%s\n' "$out" >&2; fail "$1 (verifier rejected clean hosted-shape fixture)"; }
  [[ "$out" == *"P1_HOSTED_TRUTH"* ]] || { printf '%s\n' "$out" >&2; fail "$1 (PASS marker missing)"; }
  pass "$1"
}
verify_fail(){
  local label="$1" out
  if out="$("${PSQL[@]}" -f supabase/verification/p1_hosted_truth.sql 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$label (unexpected verifier success)"
  fi
  [[ "$out" == *"P1_FAIL"* ]] || { printf '%s\n' "$out" >&2; fail "$label (expected P1_FAIL evidence missing)"; }
  pass "$label"
}

"${PSQL[@]}" -f supabase/migrations/202609070918_p1_authenticated_privilege_hardening.sql >/dev/null

"${PSQL[@]}" -q <<'SQL'
create or replace function public.p1_future_acl_probe() returns integer language sql as $$select 1$$;
SQL
future_exec="$(run "select has_function_privilege('anon','public.p1_future_acl_probe()','EXECUTE');")"
[[ "$future_exec" == 'f' ]] || fail 'P1 hardening did not close future function PUBLIC EXECUTE'
run "drop function public.p1_future_acl_probe();"
pass 'P1 hardening closes PUBLIC EXECUTE on functions created after hardening'

"${PSQL[@]}" -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key,name text);
alter table supabase_migrations.schema_migrations add column if not exists name text;
truncate supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations(version,name) values
('202609030001','foundation_schema_version'),
('202609040001','academic_spine'),('202609040002','safe_work_engine'),('202609040003','teaching_core'),('202609040004','assessment_core'),('202609040005','rapid_correction_safe_writes'),('202609040006','bulk_assessment'),
('202609050001','continuity_core'),('202609050002','continuity_lifecycle_guard'),('202609050003','continuity_write_boundary'),
('202609060001','today_reentry'),('202609060002','pacing_final_torture'),('202609060003','reporting_core'),('202609060004','artifact_core'),('202609060005','artifact_integrity_hardening'),('202609060006','artifact_governor_repairs'),
('202609070001','recovery_portable_backup'),('202609070918','p1_authenticated_privilege_hardening');

create schema if not exists storage;
create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null);
alter table storage.objects enable row level security;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('artifact-files','artifact-files',false,20000000,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream']::text[])
on conflict(id) do update set name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists artifact_file_owner_insert on storage.objects;
drop policy if exists artifact_file_owner_select on storage.objects;
create policy artifact_file_owner_insert on storage.objects for insert to authenticated with check(
  bucket_id='artifact-files' and exists(select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id where ao.storage_path=name and ao.state='PENDING_UPLOAD' and w.owner_user_id=auth.uid())
);
create policy artifact_file_owner_select on storage.objects for select to authenticated using(
  bucket_id='artifact-files' and exists(select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id where ao.storage_path=name and ao.state='READY' and w.owner_user_id=auth.uid())
);
SQL

verify_pass 'P1 hosted verifier accepts exact CLI migration provenance and hardened privileges'

"${PSQL[@]}" -q <<'SQL'
truncate supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations(version,name) values
('20260907090001','202609030001_foundation_schema_version'),
('20260907090002','202609040001_academic_spine'),('20260907090003','202609040002_safe_work_engine'),('20260907090004','202609040003_teaching_core'),('20260907090005','202609040004_assessment_core'),('20260907090006','202609040005_rapid_correction_safe_writes'),('20260907090007','202609040006_bulk_assessment'),
('20260907090008','202609050001_continuity_core'),('20260907090009','202609050002_continuity_lifecycle_guard'),('20260907090010','202609050003_continuity_write_boundary'),
('20260907090011','202609060001_today_reentry'),('20260907090012','202609060002_pacing_final_torture'),('20260907090013','202609060003_reporting_core'),('20260907090014','202609060004_artifact_core'),('20260907090015','202609060005_artifact_integrity_hardening'),('20260907090016','202609060006_artifact_governor_repairs'),
('20260907090017','202609070001_recovery_portable_backup'),('20260907090018','202609070918_p1_authenticated_privilege_hardening');
SQL
verify_pass 'P1 hosted verifier accepts exact MCP execution-version provenance'

run "update supabase_migrations.schema_migrations set name='202609060006_tampered' where name='202609060006_artifact_governor_repairs';"
verify_fail 'P1 hosted verifier rejects tampered MCP canonical migration name'
run "update supabase_migrations.schema_migrations set name='202609060006_artifact_governor_repairs' where name='202609060006_tampered';"

run "alter function public.pacing_text_array_valid(jsonb,boolean) owner to authenticated;"
verify_fail 'P1 hosted verifier rejects canonical function ownership drift'
run "alter function public.pacing_text_array_valid(jsonb,boolean) owner to postgres;"

run "grant truncate on table public.students to authenticated;"
verify_fail 'P1 hosted verifier rejects authenticated TRUNCATE on canonical table'
run "revoke truncate on table public.students from authenticated;"

run "alter default privileges for role postgres in schema public grant select on tables to authenticated;"
verify_fail 'P1 hosted verifier rejects future-table authenticated default ACL exposure'
run "alter default privileges for role postgres in schema public revoke select on tables from authenticated;"

run "alter default privileges for role postgres grant execute on functions to public;"
verify_fail 'P1 hosted verifier rejects global future-function PUBLIC EXECUTE exposure'
run "alter default privileges for role postgres revoke execute on functions from public;"

run "update storage.buckets set public=true where id='artifact-files';"
verify_fail 'P1 hosted verifier rejects public artifact bucket drift'
run "update storage.buckets set public=false where id='artifact-files';"

"${PSQL[@]}" -q <<'SQL'
drop policy artifact_file_owner_select on storage.objects;
create policy artifact_file_owner_select on storage.objects for select to authenticated using(bucket_id='artifact-files');
SQL
verify_fail 'P1 hosted verifier rejects permissive named policy with wrong ownership body'
"${PSQL[@]}" -q <<'SQL'
drop policy artifact_file_owner_select on storage.objects;
create policy artifact_file_owner_select on storage.objects for select to authenticated using(
  bucket_id='artifact-files' and exists(select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id where ao.storage_path=name and ao.state='READY' and w.owner_user_id=auth.uid())
);
SQL

affected="$(run "delete from supabase_migrations.schema_migrations where name='202609070918_p1_authenticated_privilege_hardening' returning version;")"
[[ -n "$affected" ]] || fail 'migration drift fixture was not created'
verify_fail 'P1 hosted verifier rejects missing migration-history entry'
run "insert into supabase_migrations.schema_migrations(version,name) values('20260907090018','202609070918_p1_authenticated_privilege_hardening');"

verify_pass 'P1 hosted verifier returns to PASS after negative fixtures are repaired'
printf '\nP1 hosted Supabase truth verifier PostgreSQL contract completed successfully.\n'
