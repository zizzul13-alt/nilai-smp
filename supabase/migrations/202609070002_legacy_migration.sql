-- R3.6-02 Legacy Migration.
-- Raw Streamlit/Supabase rows are normalized and dry-run in the browser first.
-- This RPC accepts only the normalized v1 bundle, derives ownership from auth.uid(),
-- requires an empty target academic/document workspace, and commits the graph atomically.
-- Legacy schedule rows never become Meetings; legacy retry metadata is never imported.

create or replace function public.migrate_legacy_bundle_operation(p_op_id uuid,p_bundle jsonb)
returns table(outcome text,migrated_rows bigint,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  prior public.applied_operations%rowtype;
  request_meta jsonb;
  affected bigint:=0;
  total bigint:=0;
  bundle_checksum text;
  report jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_bundle is null or jsonb_typeof(p_bundle)<>'object' then raise exception 'invalid legacy migration request' using errcode='22023'; end if;
  if coalesce(p_bundle->>'format','')<>'nilai-smp-legacy-normalized' or coalesce((p_bundle->>'format_version')::integer,0)<>1 then raise exception 'unsupported normalized legacy format' using errcode='22023'; end if;
  if jsonb_typeof(p_bundle->'tables')<>'object' or jsonb_typeof(p_bundle->'report')<>'object' then raise exception 'normalized legacy bundle incomplete' using errcode='22023'; end if;
  if coalesce((p_bundle->'report'->>'blocker_count')::integer,-1)<>0 then raise exception 'legacy migration has unresolved blockers' using errcode='P3801'; end if;
  bundle_checksum:=coalesce(p_bundle->>'source_checksum_sha256','');
  if bundle_checksum !~ '^[0-9a-f]{64}$' then raise exception 'legacy source checksum missing or invalid' using errcode='22023'; end if;
  report:=p_bundle->'report';

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3201'; end if;

  request_meta:=jsonb_build_object(
    'format_version',1,
    'source_checksum_sha256',bundle_checksum,
    'normalized_checksum_sha256',coalesce(p_bundle->>'normalized_checksum_sha256',''),
    'source_counts',coalesce(report->'source_counts','{}'::jsonb),
    'target_counts',coalesce(report->'target_counts','{}'::jsonb)
  );

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'legacy.migrate' or prior.target_entity_type<>'workspace' or prior.target_entity_id<>owned_workspace_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'migrated'::text,coalesce((prior.result_metadata->>'migrated_rows')::bigint,0),true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':legacy-migrate',0));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'legacy.migrate' or prior.target_entity_id<>owned_workspace_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'migrated'::text,coalesce((prior.result_metadata->>'migrated_rows')::bigint,0),true;
    return;
  end if;

  -- No merge-by-accident. Metadata ledgers may exist, but academic/document truth must be empty.
  if exists(select 1 from public.academic_years where workspace_id=owned_workspace_id)
    or exists(select 1 from public.students where workspace_id=owned_workspace_id)
    or exists(select 1 from public.materials where workspace_id=owned_workspace_id)
    or exists(select 1 from public.assessments where workspace_id=owned_workspace_id)
    or exists(select 1 from public.reporting_policies where workspace_id=owned_workspace_id)
    or exists(select 1 from public.artifacts where workspace_id=owned_workspace_id)
    or exists(select 1 from public.meetings where workspace_id=owned_workspace_id)
  then raise exception 'legacy migration target is not empty' using errcode='P3802'; end if;

  -- Academic Year
  insert into public.academic_years(id,workspace_id,identity_key,display_name,sort_order,status,starts_on,ends_on)
  select x.id,owned_workspace_id,x.identity_key,x.display_name,x.sort_order,'active',x.starts_on,x.ends_on
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'academic_years','[]'::jsonb))
    as x(id uuid,identity_key text,display_name text,sort_order integer,starts_on date,ends_on date);
  get diagnostics affected=row_count; total:=total+affected;

  -- Academic Period
  insert into public.academic_periods(id,workspace_id,academic_year_id,identity_key,display_name,sort_order,status,starts_on,ends_on)
  select x.id,owned_workspace_id,x.academic_year_id,x.identity_key,x.display_name,x.sort_order,'active',x.starts_on,x.ends_on
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'academic_periods','[]'::jsonb))
    as x(id uuid,academic_year_id uuid,identity_key text,display_name text,sort_order integer,starts_on date,ends_on date);
  get diagnostics affected=row_count; total:=total+affected;

  -- A legacy Class row is periodless; normalization creates one target Class identity per explicit derived period.
  insert into public.classes(id,workspace_id,academic_period_id,identity_key,display_name,status)
  select x.id,owned_workspace_id,x.academic_period_id,x.identity_key,x.display_name,'active'
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'classes','[]'::jsonb))
    as x(id uuid,academic_period_id uuid,identity_key text,display_name text);
  get diagnostics affected=row_count; total:=total+affected;

  -- Legacy siswa is class-owned and has no globally reliable person key. Stable legacy row identity is preserved; names are never merged.
  insert into public.students(id,workspace_id,display_name,nis,nisn,status)
  select x.id,owned_workspace_id,x.display_name,x.nis,x.nisn,'active'
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'students','[]'::jsonb))
    as x(id uuid,display_name text,nis text,nisn text);
  get diagnostics affected=row_count; total:=total+affected;

  insert into public.enrollments(id,workspace_id,student_id,class_id,status,started_on,ended_on)
  select x.id,owned_workspace_id,x.student_id,x.class_id,'active',x.started_on,x.ended_on
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'enrollments','[]'::jsonb))
    as x(id uuid,student_id uuid,class_id uuid,started_on date,ended_on date);
  get diagnostics affected=row_count; total:=total+affected;

  -- Legacy nilai becomes explicit canonical current Result. No Attempt kind is fabricated.
  insert into public.assessments(id,workspace_id,class_id,academic_period_id,activity_id,scoring_profile_id,title,description,instructions,status)
  select x.id,owned_workspace_id,x.class_id,x.academic_period_id,null,null,x.title,x.description,null,'active'
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'assessments','[]'::jsonb))
    as x(id uuid,class_id uuid,academic_period_id uuid,title text,description text);
  get diagnostics affected=row_count; total:=total+affected;

  insert into public.assessment_results(id,workspace_id,assessment_id,enrollment_id,class_id,scoring_profile_id,state,score)
  select x.id,owned_workspace_id,x.assessment_id,x.enrollment_id,x.class_id,null,'GRADED',x.score
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'assessment_results','[]'::jsonb))
    as x(id uuid,assessment_id uuid,enrollment_id uuid,class_id uuid,score numeric);
  get diagnostics affected=row_count; total:=total+affected;

  -- Only unambiguous class-level KKM is normalized into a policy. Mixed category KKM stays preserved in the source export/report.
  insert into public.reporting_policies(id,workspace_id,academic_period_id,policy_key,version_no,name,aggregation,missing_policy,excused_policy,remedial_policy,rounding_mode,kkm,status)
  select x.id,owned_workspace_id,x.academic_period_id,x.policy_key,1,x.name,'SIMPLE_MEAN','EXCLUDE','EXCLUDE','CURRENT_RESULT','NONE',x.kkm,'active'
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'reporting_policies','[]'::jsonb))
    as x(id uuid,academic_period_id uuid,policy_key uuid,name text,kkm numeric);
  get diagnostics affected=row_count; total:=total+affected;

  -- Legacy documents become MANUAL Artifact history. Missing/oversize binaries never become fake READY objects.
  insert into public.artifacts(id,workspace_id,artifact_type,title,status,revision,current_version_id)
  select x.id,owned_workspace_id,x.artifact_type,x.title,'active',1,null
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'artifacts','[]'::jsonb))
    as x(id uuid,artifact_type text,title text);
  get diagnostics affected=row_count; total:=total+affected;

  insert into public.artifact_versions(id,workspace_id,artifact_id,version_no,source_kind,lesson_id,lesson_version_id,report_snapshot_id,canonical_text,structured_content,template_key,generator_provider,provenance,created_by)
  select x.id,owned_workspace_id,x.artifact_id,1,'MANUAL',null,null,null,x.canonical_text,x.structured_content,null,null,x.provenance,caller_id
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'artifact_versions','[]'::jsonb))
    as x(id uuid,artifact_id uuid,canonical_text text,structured_content jsonb,provenance jsonb);
  get diagnostics affected=row_count; total:=total+affected;

  insert into public.artifact_objects(id,workspace_id,artifact_id,artifact_version_id,object_kind,state,storage_path,mime_type,byte_size,sha256,confirmed_at,created_by)
  select x.id,owned_workspace_id,x.artifact_id,x.artifact_version_id,x.object_kind,'PENDING_UPLOAD',
    owned_workspace_id::text||'/'||x.artifact_id::text||'/'||x.artifact_version_id::text||'/'||x.id::text||
      case x.object_kind when 'PDF' then '.pdf' when 'DOCX' then '.docx' else '.bin' end,
    x.mime_type,x.byte_size,null,null,caller_id
  from jsonb_to_recordset(coalesce(p_bundle->'tables'->'artifact_objects','[]'::jsonb))
    as x(id uuid,artifact_id uuid,artifact_version_id uuid,object_kind text,mime_type text,byte_size bigint);
  get diagnostics affected=row_count; total:=total+affected;

  update public.artifacts a set current_version_id=v.id
  from public.artifact_versions v
  where a.workspace_id=owned_workspace_id and v.workspace_id=owned_workspace_id and v.artifact_id=a.id and v.version_no=1;

  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(owned_workspace_id,caller_id,'legacy.migration.completed','workspace',owned_workspace_id,
    jsonb_build_object('source_checksum_sha256',bundle_checksum,'source_counts',coalesce(report->'source_counts','{}'::jsonb),'target_counts',coalesce(report->'target_counts','{}'::jsonb),'warnings',coalesce(report->'warnings','[]'::jsonb),'unmapped_preserved',coalesce(report->'unmapped_preserved','{}'::jsonb)));

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'legacy.migrate','workspace',owned_workspace_id,request_meta,1,jsonb_build_object('migrated_rows',total));

  return query select 'migrated'::text,total,false;
end;
$$;

revoke all on function public.migrate_legacy_bundle_operation(uuid,jsonb) from public,anon;
grant execute on function public.migrate_legacy_bundle_operation(uuid,jsonb) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.6-legacy-migration.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
