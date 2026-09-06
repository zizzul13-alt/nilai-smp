-- R3.5-02 Artifact Core.
-- Artifact identity is stable; versions and binary objects preserve immutable history and exact source provenance.

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  artifact_type text not null check(artifact_type in ('RPP','MODUL_AJAR','LKPD','SILABUS','ATP','OTHER')),
  title text not null check(btrim(title)<>''),
  status text not null default 'active' check(status in ('active','archived')),
  revision bigint not null default 1 check(revision>=1),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artifact_workspace_id_unique unique(workspace_id,id)
);
create index artifacts_workspace_status_updated_idx on public.artifacts(workspace_id,status,updated_at desc);

create table public.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  artifact_id uuid not null,
  version_no integer not null check(version_no>=1),
  source_kind text not null check(source_kind in ('MANUAL','LESSON_VERSION','REPORT_SNAPSHOT')),
  lesson_id uuid,
  lesson_version_id uuid,
  report_snapshot_id uuid,
  canonical_text text not null default '' check(length(canonical_text)<=200000),
  structured_content jsonb not null default '{}'::jsonb check(jsonb_typeof(structured_content)='object'),
  template_key text check(template_key is null or btrim(template_key)<>''),
  generator_provider text check(generator_provider is null or btrim(generator_provider)<>''),
  provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance)='object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint artifact_version_artifact_fk foreign key(workspace_id,artifact_id)
    references public.artifacts(workspace_id,id) on delete restrict,
  constraint artifact_version_lesson_fk foreign key(workspace_id,lesson_id)
    references public.lessons(workspace_id,id) on delete restrict,
  constraint artifact_version_lesson_version_fk foreign key(workspace_id,lesson_version_id,lesson_id)
    references public.lesson_versions(workspace_id,id,lesson_id) on delete restrict,
  constraint artifact_version_report_snapshot_fk foreign key(workspace_id,report_snapshot_id)
    references public.report_snapshots(workspace_id,id) on delete restrict,
  constraint artifact_version_source_shape check(
    (source_kind='MANUAL' and lesson_id is null and lesson_version_id is null and report_snapshot_id is null)
    or (source_kind='LESSON_VERSION' and lesson_id is not null and lesson_version_id is not null and report_snapshot_id is null)
    or (source_kind='REPORT_SNAPSHOT' and lesson_id is null and lesson_version_id is null and report_snapshot_id is not null)
  ),
  constraint artifact_version_number_unique unique(workspace_id,artifact_id,version_no),
  constraint artifact_version_workspace_id_unique unique(workspace_id,id),
  constraint artifact_version_workspace_artifact_unique unique(workspace_id,id,artifact_id)
);
create index artifact_versions_workspace_artifact_version_idx on public.artifact_versions(workspace_id,artifact_id,version_no desc);

alter table public.artifacts
  add constraint artifact_current_version_fk foreign key(workspace_id,current_version_id,id)
  references public.artifact_versions(workspace_id,id,artifact_id) on delete restrict;

create table public.artifact_objects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  artifact_id uuid not null,
  artifact_version_id uuid not null,
  object_kind text not null check(object_kind in ('DOCX','PDF','OTHER')),
  state text not null default 'PENDING_UPLOAD' check(state in ('PENDING_UPLOAD','READY')),
  storage_path text not null check(btrim(storage_path)<>''),
  mime_type text not null check(btrim(mime_type)<>'' and length(mime_type)<=200),
  byte_size bigint not null check(byte_size>=0 and byte_size<=20000000),
  sha256 text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint artifact_object_version_fk foreign key(workspace_id,artifact_version_id,artifact_id)
    references public.artifact_versions(workspace_id,id,artifact_id) on delete restrict,
  constraint artifact_object_storage_scope check(storage_path like workspace_id::text||'/'||artifact_id::text||'/'||artifact_version_id::text||'/%'),
  constraint artifact_object_hash_state check(
    (state='PENDING_UPLOAD' and sha256 is null and confirmed_at is null)
    or (state='READY' and sha256 ~ '^[0-9a-f]{64}$' and confirmed_at is not null)
  ),
  constraint artifact_object_workspace_id_unique unique(workspace_id,id),
  constraint artifact_object_version_kind_unique unique(workspace_id,artifact_version_id,object_kind)
);
create index artifact_objects_workspace_artifact_version_idx on public.artifact_objects(workspace_id,artifact_id,artifact_version_id,state);

alter table public.artifacts enable row level security;
alter table public.artifact_versions enable row level security;
alter table public.artifact_objects enable row level security;

revoke all on public.artifacts, public.artifact_versions, public.artifact_objects from anon;
grant select on public.artifacts, public.artifact_versions, public.artifact_objects to authenticated;
revoke insert,update,delete on public.artifacts, public.artifact_versions, public.artifact_objects from authenticated;

create policy artifact_owner_select on public.artifacts for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy artifact_version_owner_select on public.artifact_versions for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy artifact_object_owner_select on public.artifact_objects for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));

create or replace function public.create_artifact_operation(
  p_op_id uuid,
  p_artifact_type text,
  p_title text,
  p_source_kind text,
  p_lesson_id uuid default null,
  p_lesson_version_id uuid default null,
  p_report_snapshot_id uuid default null,
  p_canonical_text text default '',
  p_structured_content jsonb default '{}'::jsonb,
  p_template_key text default null,
  p_generator_provider text default null
)
returns table(artifact_id uuid,version_id uuid,revision bigint,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  caller_id uuid:=auth.uid(); owned_workspace_id uuid; new_artifact public.artifacts; new_version public.artifact_versions; prior public.applied_operations; request_meta jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_artifact_type not in ('RPP','MODUL_AJAR','LKPD','SILABUS','ATP','OTHER') or btrim(coalesce(p_title,''))='' then raise exception 'invalid artifact identity' using errcode='22023'; end if;
  if p_source_kind not in ('MANUAL','LESSON_VERSION','REPORT_SNAPSHOT') or jsonb_typeof(coalesce(p_structured_content,'{}'::jsonb))<>'object' or length(coalesce(p_canonical_text,''))>200000 then raise exception 'invalid artifact version' using errcode='22023'; end if;
  if not ((p_source_kind='MANUAL' and p_lesson_id is null and p_lesson_version_id is null and p_report_snapshot_id is null) or (p_source_kind='LESSON_VERSION' and p_lesson_id is not null and p_lesson_version_id is not null and p_report_snapshot_id is null) or (p_source_kind='REPORT_SNAPSHOT' and p_lesson_id is null and p_lesson_version_id is null and p_report_snapshot_id is not null)) then raise exception 'invalid artifact source shape' using errcode='22023'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3601'; end if;
  if p_source_kind='LESSON_VERSION' and not exists(select 1 from public.lesson_versions lv where lv.workspace_id=owned_workspace_id and lv.id=p_lesson_version_id and lv.lesson_id=p_lesson_id) then raise exception 'lesson source not owned or mismatched' using errcode='P3602'; end if;
  if p_source_kind='REPORT_SNAPSHOT' and not exists(select 1 from public.report_snapshots rs where rs.workspace_id=owned_workspace_id and rs.id=p_report_snapshot_id) then raise exception 'report snapshot source not owned' using errcode='P3603'; end if;
  request_meta:=jsonb_build_object('artifact_type',p_artifact_type,'title',btrim(p_title),'source_kind',p_source_kind,'lesson_id',p_lesson_id,'lesson_version_id',p_lesson_version_id,'report_snapshot_id',p_report_snapshot_id,'canonical_text',coalesce(p_canonical_text,''),'structured_content',coalesce(p_structured_content,'{}'::jsonb),'template_key',nullif(btrim(coalesce(p_template_key,'')),'') ,'generator_provider',nullif(btrim(coalesce(p_generator_provider,'')),''));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'artifact.create' or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select (prior.result_metadata->>'artifact_id')::uuid,(prior.result_metadata->>'version_id')::uuid,prior.result_revision,true; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':artifact-create:'||p_op_id::text,0));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'artifact.create' or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select (prior.result_metadata->>'artifact_id')::uuid,(prior.result_metadata->>'version_id')::uuid,prior.result_revision,true; return;
  end if;
  insert into public.artifacts(workspace_id,artifact_type,title,status,revision) values(owned_workspace_id,p_artifact_type,btrim(p_title),'active',1) returning * into new_artifact;
  insert into public.artifact_versions(workspace_id,artifact_id,version_no,source_kind,lesson_id,lesson_version_id,report_snapshot_id,canonical_text,structured_content,template_key,generator_provider,provenance,created_by)
  values(owned_workspace_id,new_artifact.id,1,p_source_kind,p_lesson_id,p_lesson_version_id,p_report_snapshot_id,coalesce(p_canonical_text,''),coalesce(p_structured_content,'{}'::jsonb),nullif(btrim(coalesce(p_template_key,'')),''),nullif(btrim(coalesce(p_generator_provider,'')),''),jsonb_build_object('source_kind',p_source_kind,'lesson_id',p_lesson_id,'lesson_version_id',p_lesson_version_id,'report_snapshot_id',p_report_snapshot_id,'captured_at',now()),caller_id) returning * into new_version;
  update public.artifacts set current_version_id=new_version.id where id=new_artifact.id;
  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(owned_workspace_id,caller_id,'artifact.created','artifact',new_artifact.id,jsonb_build_object('version_id',new_version.id,'artifact_type',p_artifact_type));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata) values(p_op_id,owned_workspace_id,'artifact.create','artifact',new_artifact.id,request_meta,1,jsonb_build_object('artifact_id',new_artifact.id,'version_id',new_version.id));
  return query select new_artifact.id,new_version.id,1::bigint,false;
end;$$;

create or replace function public.append_artifact_version_operation(
  p_op_id uuid,
  p_artifact_id uuid,
  p_expected_revision bigint,
  p_source_kind text,
  p_lesson_id uuid default null,
  p_lesson_version_id uuid default null,
  p_report_snapshot_id uuid default null,
  p_canonical_text text default '',
  p_structured_content jsonb default '{}'::jsonb,
  p_template_key text default null,
  p_generator_provider text default null
)
returns table(outcome text,version_id uuid,version_no integer,revision bigint,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  caller_id uuid:=auth.uid(); owned_workspace_id uuid; art public.artifacts; new_version public.artifact_versions; prior public.applied_operations; request_meta jsonb; next_no integer;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_artifact_id is null or p_expected_revision is null or p_expected_revision<1 then raise exception 'invalid artifact append operation' using errcode='22023'; end if;
  if p_source_kind not in ('MANUAL','LESSON_VERSION','REPORT_SNAPSHOT') or jsonb_typeof(coalesce(p_structured_content,'{}'::jsonb))<>'object' or length(coalesce(p_canonical_text,''))>200000 then raise exception 'invalid artifact version' using errcode='22023'; end if;
  if not ((p_source_kind='MANUAL' and p_lesson_id is null and p_lesson_version_id is null and p_report_snapshot_id is null) or (p_source_kind='LESSON_VERSION' and p_lesson_id is not null and p_lesson_version_id is not null and p_report_snapshot_id is null) or (p_source_kind='REPORT_SNAPSHOT' and p_lesson_id is null and p_lesson_version_id is null and p_report_snapshot_id is not null)) then raise exception 'invalid artifact source shape' using errcode='22023'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3601'; end if;
  if p_source_kind='LESSON_VERSION' and not exists(select 1 from public.lesson_versions lv where lv.workspace_id=owned_workspace_id and lv.id=p_lesson_version_id and lv.lesson_id=p_lesson_id) then raise exception 'lesson source not owned or mismatched' using errcode='P3602'; end if;
  if p_source_kind='REPORT_SNAPSHOT' and not exists(select 1 from public.report_snapshots rs where rs.workspace_id=owned_workspace_id and rs.id=p_report_snapshot_id) then raise exception 'report snapshot source not owned' using errcode='P3603'; end if;
  request_meta:=jsonb_build_object('artifact_id',p_artifact_id,'expected_revision',p_expected_revision,'source_kind',p_source_kind,'lesson_id',p_lesson_id,'lesson_version_id',p_lesson_version_id,'report_snapshot_id',p_report_snapshot_id,'canonical_text',coalesce(p_canonical_text,''),'structured_content',coalesce(p_structured_content,'{}'::jsonb),'template_key',nullif(btrim(coalesce(p_template_key,'')),''),'generator_provider',nullif(btrim(coalesce(p_generator_provider,'')),''));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'artifact.version-append' or prior.target_entity_id<>p_artifact_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'saved'::text,(prior.result_metadata->>'version_id')::uuid,(prior.result_metadata->>'version_no')::integer,prior.result_revision,true; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':artifact:'||p_artifact_id::text,0));
  select a.* into art from public.artifacts a where a.id=p_artifact_id and a.workspace_id=owned_workspace_id for update;
  if not found then raise exception 'artifact not owned' using errcode='P3604'; end if;
  if art.status<>'active' then raise exception 'artifact archived' using errcode='P3605'; end if;
  if art.revision<>p_expected_revision then return query select 'conflict'::text,art.current_version_id,null::integer,art.revision,false; return; end if;
  select coalesce(max(v.version_no),0)+1 into next_no from public.artifact_versions v where v.workspace_id=owned_workspace_id and v.artifact_id=p_artifact_id;
  insert into public.artifact_versions(workspace_id,artifact_id,version_no,source_kind,lesson_id,lesson_version_id,report_snapshot_id,canonical_text,structured_content,template_key,generator_provider,provenance,created_by)
  values(owned_workspace_id,p_artifact_id,next_no,p_source_kind,p_lesson_id,p_lesson_version_id,p_report_snapshot_id,coalesce(p_canonical_text,''),coalesce(p_structured_content,'{}'::jsonb),nullif(btrim(coalesce(p_template_key,'')),''),nullif(btrim(coalesce(p_generator_provider,'')),''),jsonb_build_object('source_kind',p_source_kind,'lesson_id',p_lesson_id,'lesson_version_id',p_lesson_version_id,'report_snapshot_id',p_report_snapshot_id,'captured_at',now()),caller_id) returning * into new_version;
  update public.artifacts set current_version_id=new_version.id,revision=revision+1,updated_at=now() where id=p_artifact_id returning * into art;
  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(owned_workspace_id,caller_id,'artifact.version.appended','artifact',p_artifact_id,jsonb_build_object('version_id',new_version.id,'version_no',next_no,'revision',art.revision));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata) values(p_op_id,owned_workspace_id,'artifact.version-append','artifact',p_artifact_id,request_meta,art.revision,jsonb_build_object('version_id',new_version.id,'version_no',next_no));
  return query select 'saved'::text,new_version.id,next_no,art.revision,false;
end;$$;

create or replace function public.archive_artifact_operation(p_op_id uuid,p_artifact_id uuid,p_expected_revision bigint)
returns table(outcome text,revision bigint,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare caller_id uuid:=auth.uid(); owned_workspace_id uuid; art public.artifacts; prior public.applied_operations; request_meta jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_artifact_id is null or p_expected_revision is null or p_expected_revision<1 then raise exception 'invalid archive operation' using errcode='22023'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3601'; end if;
  request_meta:=jsonb_build_object('artifact_id',p_artifact_id,'expected_revision',p_expected_revision);
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'artifact.archive' or prior.target_entity_id<>p_artifact_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if; return query select 'saved'::text,prior.result_revision,true; return; end if;
  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':artifact:'||p_artifact_id::text,0));
  select a.* into art from public.artifacts a where a.id=p_artifact_id and a.workspace_id=owned_workspace_id for update;
  if not found then raise exception 'artifact not owned' using errcode='P3604'; end if;
  if art.revision<>p_expected_revision then return query select 'conflict'::text,art.revision,false; return; end if;
  if art.status='archived' then raise exception 'artifact already archived' using errcode='P3605'; end if;
  update public.artifacts set status='archived',revision=revision+1,updated_at=now() where id=p_artifact_id returning * into art;
  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(owned_workspace_id,caller_id,'artifact.archived','artifact',p_artifact_id,jsonb_build_object('revision',art.revision));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata) values(p_op_id,owned_workspace_id,'artifact.archive','artifact',p_artifact_id,request_meta,art.revision,'{}'::jsonb);
  return query select 'saved'::text,art.revision,false;
end;$$;

create or replace function public.reserve_artifact_object_operation(p_op_id uuid,p_artifact_id uuid,p_artifact_version_id uuid,p_object_kind text,p_mime_type text,p_byte_size bigint)
returns table(outcome text,object_id uuid,storage_path text,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare caller_id uuid:=auth.uid(); owned_workspace_id uuid; obj public.artifact_objects; prior public.applied_operations; request_meta jsonb; extension text;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_artifact_id is null or p_artifact_version_id is null or p_object_kind not in ('DOCX','PDF','OTHER') or btrim(coalesce(p_mime_type,''))='' or p_byte_size is null or p_byte_size<0 or p_byte_size>20000000 then raise exception 'invalid artifact object reservation' using errcode='22023'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3601'; end if;
  if not exists(select 1 from public.artifact_versions v where v.workspace_id=owned_workspace_id and v.id=p_artifact_version_id and v.artifact_id=p_artifact_id) then raise exception 'artifact version not owned or mismatched' using errcode='P3606'; end if;
  request_meta:=jsonb_build_object('artifact_id',p_artifact_id,'artifact_version_id',p_artifact_version_id,'object_kind',p_object_kind,'mime_type',btrim(p_mime_type),'byte_size',p_byte_size);
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'artifact.object-reserve' or prior.target_entity_id<>p_artifact_version_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if; return query select 'saved'::text,(prior.result_metadata->>'object_id')::uuid,prior.result_metadata->>'storage_path',true; return; end if;
  if exists(select 1 from public.artifact_objects o where o.workspace_id=owned_workspace_id and o.artifact_version_id=p_artifact_version_id and o.object_kind=p_object_kind) then raise exception 'artifact object kind already reserved for this version' using errcode='P3607'; end if;
  extension:=case p_object_kind when 'DOCX' then '.docx' when 'PDF' then '.pdf' else '.bin' end;
  insert into public.artifact_objects(workspace_id,artifact_id,artifact_version_id,object_kind,state,storage_path,mime_type,byte_size,created_by)
  values(owned_workspace_id,p_artifact_id,p_artifact_version_id,p_object_kind,'PENDING_UPLOAD',owned_workspace_id::text||'/'||p_artifact_id::text||'/'||p_artifact_version_id::text||'/'||p_op_id::text||extension,btrim(p_mime_type),p_byte_size,caller_id) returning * into obj;
  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(owned_workspace_id,caller_id,'artifact.object.reserved','artifact_object',obj.id,jsonb_build_object('artifact_id',p_artifact_id,'version_id',p_artifact_version_id,'kind',p_object_kind));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata) values(p_op_id,owned_workspace_id,'artifact.object-reserve','artifact_version',p_artifact_version_id,request_meta,1,jsonb_build_object('object_id',obj.id,'storage_path',obj.storage_path));
  return query select 'saved'::text,obj.id,obj.storage_path,false;
end;$$;

create or replace function public.confirm_artifact_object_operation(p_op_id uuid,p_object_id uuid,p_sha256 text,p_byte_size bigint)
returns table(outcome text,object_id uuid,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare caller_id uuid:=auth.uid(); owned_workspace_id uuid; obj public.artifact_objects; prior public.applied_operations; request_meta jsonb; normalized_hash text:=lower(btrim(coalesce(p_sha256,'')));
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_object_id is null or normalized_hash !~ '^[0-9a-f]{64}$' or p_byte_size is null or p_byte_size<0 or p_byte_size>20000000 then raise exception 'invalid artifact object confirmation' using errcode='22023'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3601'; end if;
  request_meta:=jsonb_build_object('object_id',p_object_id,'sha256',normalized_hash,'byte_size',p_byte_size);
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'artifact.object-confirm' or prior.target_entity_id<>p_object_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if; return query select 'saved'::text,p_object_id,true; return; end if;
  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':artifact-object:'||p_object_id::text,0));
  select o.* into obj from public.artifact_objects o where o.workspace_id=owned_workspace_id and o.id=p_object_id for update;
  if not found then raise exception 'artifact object not owned' using errcode='P3608'; end if;
  if obj.state<>'PENDING_UPLOAD' then raise exception 'artifact object already confirmed' using errcode='P3609'; end if;
  if obj.byte_size<>p_byte_size then raise exception 'artifact object size mismatch' using errcode='P3610'; end if;
  update public.artifact_objects set state='READY',sha256=normalized_hash,confirmed_at=now() where id=p_object_id returning * into obj;
  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(owned_workspace_id,caller_id,'artifact.object.ready','artifact_object',obj.id,jsonb_build_object('artifact_id',obj.artifact_id,'version_id',obj.artifact_version_id,'kind',obj.object_kind,'sha256',normalized_hash,'byte_size',obj.byte_size));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata) values(p_op_id,owned_workspace_id,'artifact.object-confirm','artifact_object',p_object_id,request_meta,1,jsonb_build_object('object_id',p_object_id));
  return query select 'saved'::text,obj.id,false;
end;$$;

revoke all on function public.create_artifact_operation(uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text) from public,anon;
grant execute on function public.create_artifact_operation(uuid,text,text,text,uuid,uuid,uuid,text,jsonb,text,text) to authenticated;
revoke all on function public.append_artifact_version_operation(uuid,uuid,bigint,text,uuid,uuid,uuid,text,jsonb,text,text) from public,anon;
grant execute on function public.append_artifact_version_operation(uuid,uuid,bigint,text,uuid,uuid,uuid,text,jsonb,text,text) to authenticated;
revoke all on function public.archive_artifact_operation(uuid,uuid,bigint) from public,anon;
grant execute on function public.archive_artifact_operation(uuid,uuid,bigint) to authenticated;
revoke all on function public.reserve_artifact_object_operation(uuid,uuid,uuid,text,text,bigint) from public,anon;
grant execute on function public.reserve_artifact_object_operation(uuid,uuid,uuid,text,text,bigint) to authenticated;
revoke all on function public.confirm_artifact_object_operation(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.confirm_artifact_object_operation(uuid,uuid,text,bigint) to authenticated;

-- Supabase Storage exists in production but not in the plain PostgreSQL CI harness.
-- Configure a private bucket and ownership-derived policies when the storage schema is available.
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('artifact-files','artifact-files',false,20000000,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream']::text[])
    on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
    execute 'drop policy if exists artifact_file_owner_insert on storage.objects';
    execute 'drop policy if exists artifact_file_owner_select on storage.objects';
    execute $policy$create policy artifact_file_owner_insert on storage.objects for insert to authenticated with check(
      bucket_id='artifact-files' and exists(
        select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id
        where ao.storage_path=name and ao.state='PENDING_UPLOAD' and w.owner_user_id=auth.uid()
      )
    )$policy$;
    execute $policy$create policy artifact_file_owner_select on storage.objects for select to authenticated using(
      bucket_id='artifact-files' and exists(
        select 1 from public.artifact_objects ao join public.workspaces w on w.id=ao.workspace_id
        where ao.storage_path=name and ao.state='READY' and w.owner_user_id=auth.uid()
      )
    )$policy$;
  end if;
end;$$;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.5-artifact-core.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
