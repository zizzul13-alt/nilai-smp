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

# Plain PostgreSQL CI intentionally lacks Supabase's managed Storage and migration-history
# schemas. Build only the catalog surface needed to execute the committed read-only P1
# verifier. The policy definitions below mirror the repository migration contract exactly;
# they are verifier test fixtures, not a second migration path.
"${PSQL[@]}" -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key);
truncate supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations(version) values
('202609030001'),
('202609040001'),('202609040002'),('202609040003'),('202609040004'),('202609040005'),('202609040006'),
('202609050001'),('202609050002'),('202609050003'),
('202609060001'),('202609060002'),('202609060003'),('202609060004'),('202609060005'),('202609060006'),
('202609070001');

create schema if not exists storage;
create table if not exists storage.buckets(
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects(
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'artifact-files','artifact-files',false,20000000,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]::text[]
)
on conflict(id) do update set
  name=excluded.name,
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists artifact_file_owner_insert on storage.objects;
drop policy if exists artifact_file_owner_select on storage.objects;
create policy artifact_file_owner_insert on storage.objects for insert to authenticated with check(
  bucket_id='artifact-files' and exists(
    select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id
    where ao.storage_path=name and ao.state='PENDING_UPLOAD' and w.owner_user_id=auth.uid()
  )
);
create policy artifact_file_owner_select on storage.objects for select to authenticated using(
  bucket_id='artifact-files' and exists(
    select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id
    where ao.storage_path=name and ao.state='READY' and w.owner_user_id=auth.uid()
  )
);
SQL

verify_pass 'P1 hosted verifier executes and passes exact clean schema fixture'

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
  bucket_id='artifact-files' and exists(
    select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id
    where ao.storage_path=name and ao.state='READY' and w.owner_user_id=auth.uid()
  )
);
SQL

affected="$(run "delete from supabase_migrations.schema_migrations where version='202609070001' returning version;")"
[[ "$affected" == '202609070001' ]] || fail 'migration drift fixture was not created'
verify_fail 'P1 hosted verifier rejects missing migration-history entry'
run "insert into supabase_migrations.schema_migrations(version) values('202609070001');"

verify_pass 'P1 hosted verifier returns to PASS after negative fixtures are repaired'
printf '\nP1 hosted Supabase truth verifier PostgreSQL contract completed successfully.\n'
