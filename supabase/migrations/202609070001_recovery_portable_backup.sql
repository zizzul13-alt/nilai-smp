-- R3.6 Recovery: portable canonical backup + restore-to-empty.
-- The server owns canonical row export/import; binary Storage bytes are attached and
-- verified by the browser layer before object metadata is confirmed READY again.

create or replace function public.portable_backup_table_names()
returns text[]
language sql
immutable
set search_path=pg_catalog,public
as $$
  select array[
    'academic_years','academic_periods','classes','students','enrollments',
    'materials','lessons','lesson_versions','meetings','checkpoints','activities','activity_meetings',
    'scoring_profiles','assessments','assessment_results','assessment_attempts','correction_sessions',
    'continuity_baselines','lesson_pacing_plans',
    'reporting_policies','reporting_cycles','report_snapshots','report_snapshot_rows','audit_events',
    'artifacts','artifact_versions','artifact_objects','applied_operations'
  ]::text[];
$$;
revoke all on function public.portable_backup_table_names() from public,anon,authenticated;

create or replace function public.export_portable_backup()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  schema_version text;
  table_name text;
  table_rows jsonb;
  all_tables jsonb:='{}'::jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace missing'; end if;
  select version into schema_version from public.app_schema_version where id=1;

  foreach table_name in array public.portable_backup_table_names() loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where workspace_id=$1',
      table_name
    ) into table_rows using owned_workspace_id;
    all_tables:=all_tables||jsonb_build_object(table_name,table_rows);
  end loop;

  return jsonb_build_object(
    'format','nilai-smp-portable-backup',
    'format_version',1,
    'source_schema_version',schema_version,
    'exported_at',clock_timestamp(),
    'source_workspace_id',owned_workspace_id,
    'tables',all_tables
  );
end;
$$;
revoke all on function public.export_portable_backup() from public,anon;
grant execute on function public.export_portable_backup() to authenticated;

create or replace function public.restore_portable_backup_operation(p_op_id uuid,p_manifest jsonb)
returns table(outcome text,restored_rows bigint,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  table_name text;
  table_rows jsonb;
  normalized_rows jsonb;
  row_count bigint:=0;
  total_rows bigint:=0;
  prior public.applied_operations%rowtype;
  request_meta jsonb;
  source_schema text;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_op_id is null then raise exception 'op_id required'; end if;
  if coalesce(p_manifest->>'format','')<>'nilai-smp-portable-backup' or coalesce((p_manifest->>'format_version')::integer,0)<>1 then
    raise exception 'unsupported portable backup format';
  end if;
  if jsonb_typeof(p_manifest->'tables')<>'object' then raise exception 'backup tables missing'; end if;
  source_schema:=coalesce(p_manifest->>'source_schema_version','');
  if source_schema='' then raise exception 'source schema version missing'; end if;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace missing'; end if;

  request_meta:=jsonb_build_object('format_version',1,'source_schema_version',source_schema,'manifest_sha256',coalesce(p_manifest->>'checksum_sha256',''));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.operation_kind<>'recovery.restore' or prior.target_id<>owned_workspace_id or prior.request_meta<>request_meta then
      raise exception 'op_id scope or payload mismatch';
    end if;
    return query select 'restored'::text,coalesce((prior.result_meta->>'restored_rows')::bigint,0),true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':portable-restore',0));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.operation_kind<>'recovery.restore' or prior.target_id<>owned_workspace_id or prior.request_meta<>request_meta then raise exception 'op_id scope or payload mismatch'; end if;
    return query select 'restored'::text,coalesce((prior.result_meta->>'restored_rows')::bigint,0),true;
    return;
  end if;

  -- Restore is intentionally all-or-nothing and only into an empty canonical workspace.
  foreach table_name in array public.portable_backup_table_names() loop
    if table_name='applied_operations' then continue; end if;
    execute format('select count(*) from public.%I where workspace_id=$1',table_name) into row_count using owned_workspace_id;
    if row_count<>0 then raise exception 'restore target is not empty: %',table_name; end if;
  end loop;

  foreach table_name in array public.portable_backup_table_names() loop
    if table_name in ('applied_operations','report_snapshots','report_snapshot_rows','artifact_versions','artifact_objects') then continue; end if;
    table_rows:=coalesce(p_manifest->'tables'->table_name,'[]'::jsonb);
    if jsonb_typeof(table_rows)<>'array' then raise exception 'invalid table payload: %',table_name; end if;
    select coalesce(jsonb_agg(
      value
      ||jsonb_build_object('workspace_id',owned_workspace_id)
      ||jsonb_build_object('created_by',caller_id,'recorded_by',caller_id,'actor_user_id',caller_id,'owner_user_id',caller_id)
      ||case when table_name='reporting_cycles' then jsonb_build_object('current_snapshot_id',null) else '{}'::jsonb end
      ||case when table_name='artifacts' then jsonb_build_object('current_version_id',null) else '{}'::jsonb end
    ),'[]'::jsonb) into normalized_rows from jsonb_array_elements(table_rows);
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',table_name,table_name) using normalized_rows;
    get diagnostics row_count=row_count; total_rows:=total_rows+row_count;
  end loop;

  -- Report history depends on cycle identities created above.
  foreach table_name in array array['report_snapshots','report_snapshot_rows']::text[] loop
    table_rows:=coalesce(p_manifest->'tables'->table_name,'[]'::jsonb);
    select coalesce(jsonb_agg(value||jsonb_build_object('workspace_id',owned_workspace_id,'created_by',caller_id,'recorded_by',caller_id,'actor_user_id',caller_id)),'[]'::jsonb)
      into normalized_rows from jsonb_array_elements(table_rows);
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',table_name,table_name) using normalized_rows;
    get diagnostics row_count=row_count; total_rows:=total_rows+row_count;
  end loop;
  update public.reporting_cycles c set current_snapshot_id=(x.value->>'current_snapshot_id')::uuid
    from jsonb_array_elements(coalesce(p_manifest->'tables'->'reporting_cycles','[]'::jsonb)) x(value)
    where c.workspace_id=owned_workspace_id and c.id=(x.value->>'id')::uuid and nullif(x.value->>'current_snapshot_id','') is not null;

  -- Artifact metadata restores READY binaries as PENDING until exact bytes are uploaded and checksum-confirmed.
  table_rows:=coalesce(p_manifest->'tables'->'artifact_versions','[]'::jsonb);
  select coalesce(jsonb_agg(value||jsonb_build_object('workspace_id',owned_workspace_id,'created_by',caller_id)),'[]'::jsonb)
    into normalized_rows from jsonb_array_elements(table_rows);
  insert into public.artifact_versions select * from jsonb_populate_recordset(null::public.artifact_versions,normalized_rows);
  get diagnostics row_count=row_count; total_rows:=total_rows+row_count;

  table_rows:=coalesce(p_manifest->'tables'->'artifact_objects','[]'::jsonb);
  select coalesce(jsonb_agg(value||jsonb_build_object('workspace_id',owned_workspace_id,'created_by',caller_id,'state','PENDING_UPLOAD','sha256',null,'confirmed_at',null)),'[]'::jsonb)
    into normalized_rows from jsonb_array_elements(table_rows);
  insert into public.artifact_objects select * from jsonb_populate_recordset(null::public.artifact_objects,normalized_rows);
  get diagnostics row_count=row_count; total_rows:=total_rows+row_count;
  update public.artifacts a set current_version_id=(x.value->>'current_version_id')::uuid
    from jsonb_array_elements(coalesce(p_manifest->'tables'->'artifacts','[]'::jsonb)) x(value)
    where a.workspace_id=owned_workspace_id and a.id=(x.value->>'id')::uuid and nullif(x.value->>'current_version_id','') is not null;

  -- AppliedOperation history is recovery metadata. Preserve old operation IDs after all academic rows exist,
  -- remapping ownership to this personal workspace; the restore operation itself is inserted last.
  table_rows:=coalesce(p_manifest->'tables'->'applied_operations','[]'::jsonb);
  select coalesce(jsonb_agg(value||jsonb_build_object('workspace_id',owned_workspace_id)),'[]'::jsonb)
    into normalized_rows from jsonb_array_elements(table_rows);
  insert into public.applied_operations select * from jsonb_populate_recordset(null::public.applied_operations,normalized_rows)
    on conflict(op_id) do nothing;
  get diagnostics row_count=row_count; total_rows:=total_rows+row_count;

  insert into public.applied_operations(op_id,workspace_id,operation_kind,target_id,request_meta,result_meta)
  values(p_op_id,owned_workspace_id,'recovery.restore',owned_workspace_id,request_meta,jsonb_build_object('restored_rows',total_rows));
  return query select 'restored'::text,total_rows,false;
end;
$$;
revoke all on function public.restore_portable_backup_operation(uuid,jsonb) from public,anon;
grant execute on function public.restore_portable_backup_operation(uuid,jsonb) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.6-recovery.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
