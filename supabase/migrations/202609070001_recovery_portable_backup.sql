-- R3.6 Recovery: portable canonical backup + restore-to-empty.
-- The server owns canonical row export/import; binary Storage bytes are attached and
-- verified by the browser layer before object metadata is confirmed READY again.
-- AppliedOperation is retry metadata, not academic history, and is intentionally not
-- transported: restore creates fresh idempotency records in the target workspace.

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
    'artifacts','artifact_versions','artifact_objects'
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

  -- One portable backup must describe one canonical point in time. SHARE locks block
  -- concurrent INSERT/UPDATE/DELETE while this short metadata export is assembled.
  lock table public.workspaces,public.app_schema_version,
    public.academic_years,public.academic_periods,public.classes,public.students,public.enrollments,
    public.materials,public.lessons,public.lesson_versions,public.meetings,public.checkpoints,public.activities,public.activity_meetings,
    public.scoring_profiles,public.assessments,public.assessment_results,public.assessment_attempts,public.correction_sessions,
    public.continuity_baselines,public.lesson_pacing_plans,
    public.reporting_policies,public.reporting_cycles,public.report_snapshots,public.report_snapshot_rows,public.audit_events,
    public.artifacts,public.artifact_versions,public.artifact_objects
  in share mode;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace missing' using errcode='P3201'; end if;
  select version into schema_version from public.app_schema_version where id=1;
  if schema_version<>'r3.6-recovery.1' then raise exception 'portable export schema mismatch: %',schema_version using errcode='P3702'; end if;

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
  affected_rows bigint:=0;
  total_rows bigint:=0;
  prior public.applied_operations%rowtype;
  request_meta jsonb;
  source_schema text;
  manifest_checksum text;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_op_id is null then raise exception 'op_id required' using errcode='22023'; end if;
  if coalesce(p_manifest->>'format','')<>'nilai-smp-portable-backup' or coalesce((p_manifest->>'format_version')::integer,0)<>1 then
    raise exception 'unsupported portable backup format' using errcode='22023';
  end if;
  if jsonb_typeof(p_manifest->'tables')<>'object' then raise exception 'backup tables missing' using errcode='22023'; end if;
  source_schema:=coalesce(p_manifest->>'source_schema_version','');
  if source_schema<>'r3.6-recovery.1' then raise exception 'unsupported source schema: %',source_schema using errcode='P3702'; end if;
  manifest_checksum:=coalesce(p_manifest->>'checksum_sha256','');
  if manifest_checksum!~'^[0-9a-f]{64}$' then raise exception 'manifest checksum missing or invalid' using errcode='22023'; end if;
  foreach table_name in array public.portable_backup_table_names() loop
    if not ((p_manifest->'tables') ? table_name) or jsonb_typeof(p_manifest->'tables'->table_name)<>'array' then
      raise exception 'backup table missing or invalid: %',table_name using errcode='22023';
    end if;
  end loop;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace missing' using errcode='P3201'; end if;

  request_meta:=jsonb_build_object('format_version',1,'source_schema_version',source_schema,'manifest_sha256',manifest_checksum);
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'recovery.restore' or prior.target_entity_type<>'workspace' or prior.target_entity_id<>owned_workspace_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3202';
    end if;
    return query select 'restored'::text,coalesce((prior.result_metadata->>'restored_rows')::bigint,0),true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':portable-restore',0));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'recovery.restore' or prior.target_entity_type<>'workspace' or prior.target_entity_id<>owned_workspace_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'restored'::text,coalesce((prior.result_metadata->>'restored_rows')::bigint,0),true;
    return;
  end if;

  -- Restore is intentionally all-or-nothing and only into an empty canonical workspace.
  foreach table_name in array public.portable_backup_table_names() loop
    execute format('select count(*) from public.%I where workspace_id=$1',table_name) into affected_rows using owned_workspace_id;
    if affected_rows<>0 then raise exception 'restore target is not empty: %',table_name using errcode='P3701'; end if;
  end loop;

  foreach table_name in array public.portable_backup_table_names() loop
    if table_name in ('report_snapshots','report_snapshot_rows','artifact_versions','artifact_objects') then continue; end if;
    table_rows:=p_manifest->'tables'->table_name;
    select coalesce(jsonb_agg(
      value
      ||jsonb_build_object('workspace_id',owned_workspace_id)
      ||jsonb_build_object('created_by',caller_id,'recorded_by',caller_id,'actor_user_id',caller_id,'owner_user_id',caller_id)
      ||case when table_name='reporting_cycles' then jsonb_build_object('current_snapshot_id',null) else '{}'::jsonb end
      ||case when table_name='artifacts' then jsonb_build_object('current_version_id',null) else '{}'::jsonb end
    ),'[]'::jsonb) into normalized_rows from jsonb_array_elements(table_rows);
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',table_name,table_name) using normalized_rows;
    get diagnostics affected_rows=row_count; total_rows:=total_rows+affected_rows;
  end loop;

  -- Report history depends on cycle identities created above.
  foreach table_name in array array['report_snapshots','report_snapshot_rows']::text[] loop
    table_rows:=p_manifest->'tables'->table_name;
    select coalesce(jsonb_agg(value||jsonb_build_object('workspace_id',owned_workspace_id,'created_by',caller_id,'recorded_by',caller_id,'actor_user_id',caller_id)),'[]'::jsonb)
      into normalized_rows from jsonb_array_elements(table_rows);
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',table_name,table_name) using normalized_rows;
    get diagnostics affected_rows=row_count; total_rows:=total_rows+affected_rows;
  end loop;
  update public.reporting_cycles c set current_snapshot_id=(x.value->>'current_snapshot_id')::uuid
    from jsonb_array_elements(p_manifest->'tables'->'reporting_cycles') x(value)
    where c.workspace_id=owned_workspace_id and c.id=(x.value->>'id')::uuid and nullif(x.value->>'current_snapshot_id','') is not null;

  -- Artifact metadata restores READY binaries as PENDING until exact bytes are uploaded and checksum-confirmed.
  table_rows:=p_manifest->'tables'->'artifact_versions';
  select coalesce(jsonb_agg(value||jsonb_build_object('workspace_id',owned_workspace_id,'created_by',caller_id)),'[]'::jsonb)
    into normalized_rows from jsonb_array_elements(table_rows);
  insert into public.artifact_versions select * from jsonb_populate_recordset(null::public.artifact_versions,normalized_rows);
  get diagnostics affected_rows=row_count; total_rows:=total_rows+affected_rows;

  table_rows:=p_manifest->'tables'->'artifact_objects';
  select coalesce(jsonb_agg(
    value
    ||jsonb_build_object(
      'workspace_id',owned_workspace_id,
      'created_by',caller_id,
      'state','PENDING_UPLOAD',
      'sha256',null,
      'confirmed_at',null,
      'storage_path',
        owned_workspace_id::text||'/'||(value->>'artifact_id')||'/'||(value->>'artifact_version_id')||'/'||(value->>'id')||
        case value->>'object_kind' when 'PDF' then '.pdf' when 'DOCX' then '.docx' else '.bin' end
    )
  ),'[]'::jsonb) into normalized_rows from jsonb_array_elements(table_rows);
  insert into public.artifact_objects select * from jsonb_populate_recordset(null::public.artifact_objects,normalized_rows);
  get diagnostics affected_rows=row_count; total_rows:=total_rows+affected_rows;
  update public.artifacts a set current_version_id=(x.value->>'current_version_id')::uuid
    from jsonb_array_elements(p_manifest->'tables'->'artifacts') x(value)
    where a.workspace_id=owned_workspace_id and a.id=(x.value->>'id')::uuid and nullif(x.value->>'current_version_id','') is not null;

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'recovery.restore','workspace',owned_workspace_id,request_meta,1,jsonb_build_object('restored_rows',total_rows));
  return query select 'restored'::text,total_rows,false;
end;
$$;
revoke all on function public.restore_portable_backup_operation(uuid,jsonb) from public,anon;
grant execute on function public.restore_portable_backup_operation(uuid,jsonb) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.6-recovery.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
