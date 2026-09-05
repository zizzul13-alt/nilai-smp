-- R3.4 Teaching Continuity Core.
-- Canonical chain remains Class -> actual Meeting -> optional Lesson/LessonVersion -> Checkpoint(s).
-- Browser/UI sessions are never canonical Meetings.

do $$
begin
  if exists (
    select 1
    from public.meetings
    where status='in_progress'
    group by workspace_id,class_id
    having count(*) > 1
  ) then
    raise exception 'continuity migration requires at most one in-progress meeting per class' using errcode='P3509';
  end if;
end $$;

create unique index meetings_one_in_progress_per_class_idx
  on public.meetings(workspace_id,class_id)
  where status='in_progress';

create or replace function public.start_teaching_meeting_operation(
  p_op_id uuid,
  p_class_id uuid,
  p_lesson_id uuid default null,
  p_lesson_version_id uuid default null
)
returns table(outcome text,meeting_id uuid,meeting_status text,occurred_at timestamptz,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  prior public.applied_operations;
  request_meta jsonb;
  current_meeting public.meetings;
  new_meeting public.meetings;
  prior_meeting_id uuid;
  prior_occurred_at timestamptz;
begin
  -- 28000 auth unavailable; P3501 workspace; P3502 op mismatch;
  -- P3503 Class/Meeting not owned; P3504 Lesson context not owned/invalid.
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_class_id is null or (p_lesson_version_id is not null and p_lesson_id is null) then
    raise exception 'invalid start operation' using errcode='22023';
  end if;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3501'; end if;

  request_meta:=jsonb_build_object('class_id',p_class_id,'lesson_id',p_lesson_id,'lesson_version_id',p_lesson_version_id);

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'meeting.start' or prior.target_entity_type<>'class' or prior.target_entity_id<>p_class_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3502';
    end if;
    prior_meeting_id:=(prior.result_metadata->>'meeting_id')::uuid;
    prior_occurred_at:=(prior.result_metadata->>'occurred_at')::timestamptz;
    return query select coalesce(prior.result_metadata->>'outcome','started'),prior_meeting_id,coalesce(prior.result_metadata->>'status','in_progress'),prior_occurred_at,true;
    return;
  end if;

  perform 1 from public.classes c where c.id=p_class_id and c.workspace_id=owned_workspace_id and c.status='active';
  if not found then raise exception 'active class not found in owned workspace' using errcode='P3503'; end if;

  if p_lesson_id is not null then
    perform 1 from public.lessons l where l.id=p_lesson_id and l.workspace_id=owned_workspace_id and l.status='active';
    if not found then raise exception 'lesson not found in owned workspace' using errcode='P3504'; end if;
  end if;
  if p_lesson_version_id is not null then
    perform 1 from public.lesson_versions lv where lv.id=p_lesson_version_id and lv.workspace_id=owned_workspace_id and lv.lesson_id=p_lesson_id;
    if not found then raise exception 'lesson version does not belong to owned lesson' using errcode='P3504'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('meeting.start:'||owned_workspace_id::text||':'||p_class_id::text,0));

  -- Lost-ACK concurrent retry can arrive while the first transaction is still committing.
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'meeting.start' or prior.target_entity_type<>'class' or prior.target_entity_id<>p_class_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3502';
    end if;
    prior_meeting_id:=(prior.result_metadata->>'meeting_id')::uuid;
    prior_occurred_at:=(prior.result_metadata->>'occurred_at')::timestamptz;
    return query select coalesce(prior.result_metadata->>'outcome','started'),prior_meeting_id,coalesce(prior.result_metadata->>'status','in_progress'),prior_occurred_at,true;
    return;
  end if;

  select m.* into current_meeting
  from public.meetings m
  where m.workspace_id=owned_workspace_id and m.class_id=p_class_id and m.status='in_progress'
  order by m.occurred_at desc,m.id
  limit 1
  for update;

  if found then
    insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
    values(p_op_id,owned_workspace_id,'meeting.start','class',p_class_id,request_meta,1,
      jsonb_build_object('outcome','continued','meeting_id',current_meeting.id,'status',current_meeting.status,'occurred_at',current_meeting.occurred_at));
    return query select 'continued'::text,current_meeting.id,current_meeting.status,current_meeting.occurred_at,false;
    return;
  end if;

  insert into public.meetings(workspace_id,class_id,lesson_id,lesson_version_id,occurred_at,status)
  values(owned_workspace_id,p_class_id,p_lesson_id,p_lesson_version_id,now(),'in_progress')
  returning * into new_meeting;

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'meeting.start','class',p_class_id,request_meta,1,
    jsonb_build_object('outcome','started','meeting_id',new_meeting.id,'status',new_meeting.status,'occurred_at',new_meeting.occurred_at));

  return query select 'started'::text,new_meeting.id,new_meeting.status,new_meeting.occurred_at,false;
end;
$$;

create or replace function public.set_teaching_meeting_status_operation(
  p_op_id uuid,
  p_meeting_id uuid,
  p_status text
)
returns table(outcome text,meeting_status text,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  prior public.applied_operations;
  request_meta jsonb;
  current_status text;
  normalized_status text:=lower(btrim(p_status));
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_meeting_id is null or normalized_status not in ('completed','cancelled') then
    raise exception 'invalid lifecycle operation' using errcode='22023';
  end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3501'; end if;
  request_meta:=jsonb_build_object('status',normalized_status);

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'meeting.status' or prior.target_entity_type<>'meeting' or prior.target_entity_id<>p_meeting_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3502';
    end if;
    return query select 'saved'::text,coalesce(prior.result_metadata->>'status',normalized_status),true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('meeting.status:'||owned_workspace_id::text||':'||p_meeting_id::text,0));
  select m.status into current_status from public.meetings m where m.id=p_meeting_id and m.workspace_id=owned_workspace_id for update;
  if current_status is null then raise exception 'meeting not found in owned workspace' using errcode='P3503'; end if;

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'meeting.status' or prior.target_entity_type<>'meeting' or prior.target_entity_id<>p_meeting_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3502';
    end if;
    return query select 'saved'::text,coalesce(prior.result_metadata->>'status',normalized_status),true;
    return;
  end if;

  if current_status<>normalized_status then
    if current_status<>'in_progress' then raise exception 'meeting is not in progress' using errcode='P3505'; end if;
    update public.meetings set status=normalized_status,updated_at=now() where id=p_meeting_id and workspace_id=owned_workspace_id;
  end if;

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'meeting.status','meeting',p_meeting_id,request_meta,1,jsonb_build_object('status',normalized_status));
  return query select 'saved'::text,normalized_status,false;
end;
$$;

create or replace function public.apply_meeting_checkpoint_operation(
  p_op_id uuid,
  p_meeting_id uuid,
  p_stopped_at text,
  p_next_step text default null
)
returns table(outcome text,checkpoint_id uuid,sequence_no integer,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  prior public.applied_operations;
  request_meta jsonb;
  normalized_stopped text:=btrim(coalesce(p_stopped_at,''));
  normalized_next text:=nullif(btrim(coalesce(p_next_step,'')),'');
  current_status text;
  next_sequence integer;
  new_checkpoint_id uuid;
  prior_checkpoint_id uuid;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_meeting_id is null or normalized_stopped='' then
    raise exception 'stopped_at is required' using errcode='22023';
  end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3501'; end if;
  request_meta:=jsonb_build_object('stopped_at',normalized_stopped,'next_step',normalized_next);

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'meeting.checkpoint' or prior.target_entity_type<>'meeting' or prior.target_entity_id<>p_meeting_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3502';
    end if;
    prior_checkpoint_id:=(prior.result_metadata->>'checkpoint_id')::uuid;
    return query select 'saved'::text,prior_checkpoint_id,prior.result_revision::integer,true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('meeting.checkpoint:'||owned_workspace_id::text||':'||p_meeting_id::text,0));
  select m.status into current_status from public.meetings m where m.id=p_meeting_id and m.workspace_id=owned_workspace_id for update;
  if current_status is null then raise exception 'meeting not found in owned workspace' using errcode='P3503'; end if;

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'meeting.checkpoint' or prior.target_entity_type<>'meeting' or prior.target_entity_id<>p_meeting_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3502';
    end if;
    prior_checkpoint_id:=(prior.result_metadata->>'checkpoint_id')::uuid;
    return query select 'saved'::text,prior_checkpoint_id,prior.result_revision::integer,true;
    return;
  end if;

  if current_status<>'in_progress' then raise exception 'meeting is not in progress' using errcode='P3505'; end if;
  select coalesce(max(c.sequence_no),0)+1 into next_sequence from public.checkpoints c where c.workspace_id=owned_workspace_id and c.meeting_id=p_meeting_id;
  new_checkpoint_id:=gen_random_uuid();
  insert into public.checkpoints(id,workspace_id,meeting_id,sequence_no,stopped_at,next_step,recorded_at)
  values(new_checkpoint_id,owned_workspace_id,p_meeting_id,next_sequence,normalized_stopped,normalized_next,now());

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'meeting.checkpoint','meeting',p_meeting_id,request_meta,next_sequence,
    jsonb_build_object('checkpoint_id',new_checkpoint_id,'sequence_no',next_sequence,'stopped_at',normalized_stopped,'next_step',normalized_next));
  return query select 'saved'::text,new_checkpoint_id,next_sequence,false;
end;
$$;

revoke all on function public.start_teaching_meeting_operation(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.start_teaching_meeting_operation(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.set_teaching_meeting_status_operation(uuid,uuid,text) from public,anon;
grant execute on function public.set_teaching_meeting_status_operation(uuid,uuid,text) to authenticated;
revoke all on function public.apply_meeting_checkpoint_operation(uuid,uuid,text,text) from public,anon;
grant execute on function public.apply_meeting_checkpoint_operation(uuid,uuid,text,text) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.4-continuity-core.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
