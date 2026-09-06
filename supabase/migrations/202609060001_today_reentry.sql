-- R3.4-02 Today + Re-entry.
-- Today is a bounded dispatcher read model, not a Teaching Core history dump.
-- Re-entry baselines are append-only reconciliation facts and never rewrite Meeting/Checkpoint history.

create table public.continuity_baselines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  baseline_kind text not null check (baseline_kind in ('QUICK_UPDATE','START_FROM_TODAY')),
  stopped_at text not null check (btrim(stopped_at) <> ''),
  next_step text,
  recorded_at timestamptz not null default now(),
  constraint continuity_baseline_class_fk foreign key (workspace_id,class_id)
    references public.classes(workspace_id,id) on delete restrict,
  constraint continuity_baseline_next_nonblank check (next_step is null or btrim(next_step) <> ''),
  constraint continuity_baseline_workspace_id_unique unique (workspace_id,id)
);

create index continuity_baselines_workspace_class_recorded_idx
  on public.continuity_baselines(workspace_id,class_id,recorded_at desc,id desc);

-- Existing assessment-scoped index is not efficient for "latest active correction in this workspace".
create index correction_sessions_workspace_active_updated_idx
  on public.correction_sessions(workspace_id,updated_at desc,id desc)
  where status='active';

alter table public.continuity_baselines enable row level security;
revoke all on public.continuity_baselines from anon;
grant select on public.continuity_baselines to authenticated;
create policy continuity_baseline_owner_select on public.continuity_baselines for select to authenticated
  using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));

-- Fixed-size dispatcher context. Historical Meetings/Checkpoints are searched with indexed lateral LIMIT 1,
-- never downloaded wholesale to the browser. No caller-controlled workspace argument exists.
create or replace function public.read_today_class_contexts()
returns table(
  class_id uuid,
  class_name text,
  active_meeting_id uuid,
  active_meeting_occurred_at timestamptz,
  active_lesson_title text,
  latest_actual_meeting_id uuid,
  latest_actual_meeting_occurred_at timestamptz,
  latest_actual_meeting_status text,
  active_checkpoint_id uuid,
  active_checkpoint_stopped_at text,
  active_checkpoint_next_step text,
  active_checkpoint_recorded_at timestamptz,
  latest_checkpoint_id uuid,
  latest_checkpoint_meeting_id uuid,
  latest_checkpoint_stopped_at text,
  latest_checkpoint_next_step text,
  latest_checkpoint_recorded_at timestamptz,
  latest_baseline_id uuid,
  latest_baseline_kind text,
  latest_baseline_stopped_at text,
  latest_baseline_next_step text,
  latest_baseline_recorded_at timestamptz,
  effective_source text,
  effective_stopped_at text,
  effective_next_step text,
  effective_recorded_at timestamptz
)
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
with owned as (
  select w.id workspace_id
  from public.workspaces w
  where w.owner_user_id=auth.uid()
), contexts as (
  select
    c.id class_id,
    c.display_name class_name,
    am.id active_meeting_id,
    am.occurred_at active_meeting_occurred_at,
    al.title active_lesson_title,
    lm.id latest_actual_meeting_id,
    lm.occurred_at latest_actual_meeting_occurred_at,
    lm.status latest_actual_meeting_status,
    acp.id active_checkpoint_id,
    acp.stopped_at active_checkpoint_stopped_at,
    acp.next_step active_checkpoint_next_step,
    acp.recorded_at active_checkpoint_recorded_at,
    cp.id latest_checkpoint_id,
    cp.meeting_id latest_checkpoint_meeting_id,
    cp.stopped_at latest_checkpoint_stopped_at,
    cp.next_step latest_checkpoint_next_step,
    cp.recorded_at latest_checkpoint_recorded_at,
    bl.id latest_baseline_id,
    bl.baseline_kind latest_baseline_kind,
    bl.stopped_at latest_baseline_stopped_at,
    bl.next_step latest_baseline_next_step,
    bl.recorded_at latest_baseline_recorded_at
  from owned o
  join public.classes c on c.workspace_id=o.workspace_id and c.status='active'
  left join lateral (
    select m.id,m.occurred_at,m.lesson_id
    from public.meetings m
    where m.workspace_id=o.workspace_id and m.class_id=c.id and m.status='in_progress'
    order by m.occurred_at desc,m.id desc
    limit 1
  ) am on true
  left join public.lessons al on al.workspace_id=o.workspace_id and al.id=am.lesson_id
  left join lateral (
    select m.id,m.occurred_at,m.status
    from public.meetings m
    where m.workspace_id=o.workspace_id and m.class_id=c.id and m.status not in ('planned','archived')
    order by m.occurred_at desc,m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select p.id,p.stopped_at,p.next_step,p.recorded_at
    from public.checkpoints p
    where am.id is not null and p.workspace_id=o.workspace_id and p.meeting_id=am.id
    order by p.sequence_no desc,p.recorded_at desc,p.id desc
    limit 1
  ) acp on true
  left join lateral (
    select p.id,p.meeting_id,p.stopped_at,p.next_step,p.recorded_at
    from public.meetings m
    join public.checkpoints p on p.workspace_id=m.workspace_id and p.meeting_id=m.id
    where m.workspace_id=o.workspace_id and m.class_id=c.id and m.status not in ('planned','archived')
    order by (m.status='in_progress') desc,m.occurred_at desc,m.id desc,p.sequence_no desc,p.recorded_at desc,p.id desc
    limit 1
  ) cp on true
  left join lateral (
    select b.id,b.baseline_kind,b.stopped_at,b.next_step,b.recorded_at
    from public.continuity_baselines b
    where b.workspace_id=o.workspace_id and b.class_id=c.id
    order by b.recorded_at desc,b.id desc
    limit 1
  ) bl on true
)
select
  x.class_id,x.class_name,
  x.active_meeting_id,x.active_meeting_occurred_at,x.active_lesson_title,
  x.latest_actual_meeting_id,x.latest_actual_meeting_occurred_at,x.latest_actual_meeting_status,
  x.active_checkpoint_id,x.active_checkpoint_stopped_at,x.active_checkpoint_next_step,x.active_checkpoint_recorded_at,
  x.latest_checkpoint_id,x.latest_checkpoint_meeting_id,x.latest_checkpoint_stopped_at,x.latest_checkpoint_next_step,x.latest_checkpoint_recorded_at,
  x.latest_baseline_id,x.latest_baseline_kind,x.latest_baseline_stopped_at,x.latest_baseline_next_step,x.latest_baseline_recorded_at,
  case
    when x.latest_baseline_id is not null and (x.latest_checkpoint_id is null or x.latest_baseline_recorded_at>x.latest_checkpoint_recorded_at) then 'baseline'
    when x.latest_checkpoint_id is not null then 'checkpoint'
    else null
  end effective_source,
  case
    when x.latest_baseline_id is not null and (x.latest_checkpoint_id is null or x.latest_baseline_recorded_at>x.latest_checkpoint_recorded_at) then x.latest_baseline_stopped_at
    else x.latest_checkpoint_stopped_at
  end effective_stopped_at,
  case
    when x.latest_baseline_id is not null and (x.latest_checkpoint_id is null or x.latest_baseline_recorded_at>x.latest_checkpoint_recorded_at) then x.latest_baseline_next_step
    else x.latest_checkpoint_next_step
  end effective_next_step,
  case
    when x.latest_baseline_id is not null and (x.latest_checkpoint_id is null or x.latest_baseline_recorded_at>x.latest_checkpoint_recorded_at) then x.latest_baseline_recorded_at
    else x.latest_checkpoint_recorded_at
  end effective_recorded_at
from contexts x
order by
  (x.active_meeting_id is not null) desc,
  greatest(
    coalesce(x.active_meeting_occurred_at,'epoch'::timestamptz),
    coalesce(x.latest_baseline_recorded_at,'epoch'::timestamptz),
    coalesce(x.latest_checkpoint_recorded_at,'epoch'::timestamptz),
    coalesce(x.latest_actual_meeting_occurred_at,'epoch'::timestamptz)
  ) desc,
  x.class_name,
  x.class_id
limit 24;
$$;

create or replace function public.read_today_active_correction()
returns table(
  session_id uuid,
  assessment_id uuid,
  assessment_title text,
  class_id uuid,
  class_name text,
  current_enrollment_id uuid,
  started_at timestamptz,
  updated_at timestamptz,
  active_count bigint
)
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
with owned as (
  select w.id workspace_id
  from public.workspaces w
  where w.owner_user_id=auth.uid()
), active as (
  select cs.*,count(*) over() active_count
  from owned o
  join public.correction_sessions cs on cs.workspace_id=o.workspace_id and cs.status='active'
)
select a.id,a.assessment_id,ass.title,a.class_id,c.display_name,a.current_enrollment_id,a.started_at,a.updated_at,a.active_count
from active a
join public.assessments ass on ass.workspace_id=a.workspace_id and ass.id=a.assessment_id
join public.classes c on c.workspace_id=a.workspace_id and c.id=a.class_id
order by a.updated_at desc,a.id desc
limit 1;
$$;

create or replace function public.record_continuity_baseline_operation(
  p_op_id uuid,
  p_class_id uuid,
  p_baseline_kind text,
  p_stopped_at text,
  p_next_step text default null
)
returns table(outcome text,baseline_id uuid,recorded_at timestamptz,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  prior public.applied_operations;
  normalized_kind text:=upper(btrim(coalesce(p_baseline_kind,'')));
  normalized_stopped text:=btrim(coalesce(p_stopped_at,''));
  normalized_next text:=nullif(btrim(coalesce(p_next_step,'')),'');
  request_meta jsonb;
  new_row public.continuity_baselines;
  prior_id uuid;
  prior_recorded timestamptz;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_class_id is null or normalized_kind not in ('QUICK_UPDATE','START_FROM_TODAY') or normalized_stopped='' then
    raise exception 'invalid continuity baseline operation' using errcode='22023';
  end if;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3601'; end if;
  request_meta:=jsonb_build_object('baseline_kind',normalized_kind,'stopped_at',normalized_stopped,'next_step',normalized_next);

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'continuity.baseline' or prior.target_entity_type<>'class' or prior.target_entity_id<>p_class_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3602';
    end if;
    prior_id:=(prior.result_metadata->>'baseline_id')::uuid;
    prior_recorded:=(prior.result_metadata->>'recorded_at')::timestamptz;
    return query select 'saved'::text,prior_id,prior_recorded,true;
    return;
  end if;

  perform 1 from public.classes c where c.id=p_class_id and c.workspace_id=owned_workspace_id and c.status='active';
  if not found then raise exception 'active class not found in owned workspace' using errcode='P3603'; end if;

  perform pg_advisory_xact_lock(hashtextextended('continuity.baseline:'||owned_workspace_id::text||':'||p_class_id::text,0));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'continuity.baseline' or prior.target_entity_type<>'class' or prior.target_entity_id<>p_class_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3602';
    end if;
    prior_id:=(prior.result_metadata->>'baseline_id')::uuid;
    prior_recorded:=(prior.result_metadata->>'recorded_at')::timestamptz;
    return query select 'saved'::text,prior_id,prior_recorded,true;
    return;
  end if;

  insert into public.continuity_baselines(workspace_id,class_id,baseline_kind,stopped_at,next_step)
  values(owned_workspace_id,p_class_id,normalized_kind,normalized_stopped,normalized_next)
  returning * into new_row;

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'continuity.baseline','class',p_class_id,request_meta,1,
    jsonb_build_object('baseline_id',new_row.id,'recorded_at',new_row.recorded_at,'baseline_kind',new_row.baseline_kind));

  return query select 'saved'::text,new_row.id,new_row.recorded_at,false;
end;
$$;

revoke all on function public.read_today_class_contexts() from public,anon;
grant execute on function public.read_today_class_contexts() to authenticated;
revoke all on function public.read_today_active_correction() from public,anon;
grant execute on function public.read_today_active_correction() to authenticated;
revoke all on function public.record_continuity_baseline_operation(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.record_continuity_baseline_operation(uuid,uuid,text,text,text) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.4-today-reentry.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
