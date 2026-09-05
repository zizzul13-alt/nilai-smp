-- R3.4 continuity lifecycle input hardening.
-- Keeps schema identity r3.4-continuity-core.1; this migration only tightens the same RPC contract.

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
  if p_op_id is null or p_meeting_id is null or normalized_status is null or normalized_status not in ('completed','cancelled') then
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

revoke all on function public.set_teaching_meeting_status_operation(uuid,uuid,text) from public,anon;
grant execute on function public.set_teaching_meeting_status_operation(uuid,uuid,text) to authenticated;
