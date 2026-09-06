-- R3.4-03 Pacing + Final Torture.
-- Pacing is class+lesson working intent. It never rewrites immutable LessonVersion content,
-- never fabricates schedule Meetings, and never turns correction workflow into academic evidence.

create or replace function public.pacing_text_array_valid(p_value jsonb,p_require_nonempty boolean)
returns boolean
language sql immutable
set search_path=pg_catalog
as $$
  select jsonb_typeof(p_value)='array'
    and (not p_require_nonempty or jsonb_array_length(p_value)>0)
    and not exists(
      select 1
      from jsonb_array_elements(p_value) as elem(value)
      where jsonb_typeof(value)<>'string' or btrim(value #>> '{}')=''
    );
$$;
revoke all on function public.pacing_text_array_valid(jsonb,boolean) from public,anon,authenticated;

create table public.lesson_pacing_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  lesson_id uuid not null,
  lesson_version_id uuid,
  normal_meetings integer not null check(normal_meetings between 1 and 20),
  available_meetings integer not null check(available_meetings between 0 and 20),
  correction_reserve integer not null default 0 check(correction_reserve between 0 and 20 and correction_reserve<=available_meetings),
  core_targets jsonb not null check(public.pacing_text_array_valid(core_targets,true)),
  practice_targets jsonb not null default '[]'::jsonb check(public.pacing_text_array_valid(practice_targets,false)),
  stretch_targets jsonb not null default '[]'::jsonb check(public.pacing_text_array_valid(stretch_targets,false)),
  minimum_exit_criteria jsonb not null check(public.pacing_text_array_valid(minimum_exit_criteria,true)),
  teacher_mode text check(teacher_mode is null or teacher_mode in ('RELAXED','NORMAL','COMPRESSED')),
  revision bigint not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_pacing_class_fk foreign key(workspace_id,class_id)
    references public.classes(workspace_id,id) on delete restrict,
  constraint lesson_pacing_lesson_fk foreign key(workspace_id,lesson_id)
    references public.lessons(workspace_id,id) on delete restrict,
  constraint lesson_pacing_version_requires_lesson check(lesson_version_id is null or lesson_id is not null),
  constraint lesson_pacing_version_fk foreign key(workspace_id,lesson_version_id,lesson_id)
    references public.lesson_versions(workspace_id,id,lesson_id) on delete restrict,
  constraint lesson_pacing_workspace_id_unique unique(workspace_id,id),
  constraint lesson_pacing_class_lesson_unique unique(workspace_id,class_id,lesson_id)
);
create index lesson_pacing_workspace_class_idx on public.lesson_pacing_plans(workspace_id,class_id,updated_at desc);

alter table public.lesson_pacing_plans enable row level security;
revoke all on public.lesson_pacing_plans from anon;
grant select on public.lesson_pacing_plans to authenticated;
revoke insert,update,delete on public.lesson_pacing_plans from authenticated;
create policy lesson_pacing_owner_select on public.lesson_pacing_plans for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));

create or replace function public.upsert_lesson_pacing_plan_operation(
  p_op_id uuid,
  p_class_id uuid,
  p_lesson_id uuid,
  p_lesson_version_id uuid,
  p_normal_meetings integer,
  p_available_meetings integer,
  p_correction_reserve integer,
  p_core_targets jsonb,
  p_practice_targets jsonb,
  p_stretch_targets jsonb,
  p_minimum_exit_criteria jsonb,
  p_teacher_mode text,
  p_expected_revision bigint
)
returns table(outcome text,revision bigint,replayed boolean,plan_id uuid)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  prior public.applied_operations;
  current_plan public.lesson_pacing_plans;
  current_revision bigint:=0;
  normalized_mode text:=nullif(upper(btrim(coalesce(p_teacher_mode,''))), '');
  request_meta jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_class_id is null or p_lesson_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'invalid pacing operation' using errcode='22023';
  end if;
  if p_normal_meetings is null or p_available_meetings is null or p_correction_reserve is null or
     p_normal_meetings not between 1 and 20 or p_available_meetings not between 0 and 20 or
     p_correction_reserve not between 0 and 20 or p_correction_reserve>p_available_meetings then
    raise exception 'invalid pacing capacity' using errcode='22023';
  end if;
  if normalized_mode is not null and normalized_mode not in ('RELAXED','NORMAL','COMPRESSED') then
    raise exception 'invalid pacing mode' using errcode='22023';
  end if;
  if p_core_targets is null or p_minimum_exit_criteria is null or
     not public.pacing_text_array_valid(p_core_targets,true) or
     not public.pacing_text_array_valid(coalesce(p_practice_targets,'[]'::jsonb),false) or
     not public.pacing_text_array_valid(coalesce(p_stretch_targets,'[]'::jsonb),false) or
     not public.pacing_text_array_valid(p_minimum_exit_criteria,true) then
    raise exception 'invalid pacing target list' using errcode='22023';
  end if;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3431'; end if;
  if not exists(select 1 from public.classes c where c.id=p_class_id and c.workspace_id=owned_workspace_id and c.status='active') then
    raise exception 'class not found in owned workspace' using errcode='P3432';
  end if;
  if not exists(select 1 from public.lessons l where l.id=p_lesson_id and l.workspace_id=owned_workspace_id and l.status='active') then
    raise exception 'lesson not found in owned workspace' using errcode='P3433';
  end if;
  if p_lesson_version_id is not null and not exists(
    select 1 from public.lesson_versions v where v.id=p_lesson_version_id and v.workspace_id=owned_workspace_id and v.lesson_id=p_lesson_id
  ) then raise exception 'lesson version does not belong to lesson' using errcode='P3434'; end if;

  request_meta:=jsonb_build_object(
    'class_id',p_class_id,'lesson_id',p_lesson_id,'lesson_version_id',p_lesson_version_id,
    'normal_meetings',p_normal_meetings,'available_meetings',p_available_meetings,'correction_reserve',p_correction_reserve,
    'core_targets',p_core_targets,'practice_targets',coalesce(p_practice_targets,'[]'::jsonb),
    'stretch_targets',coalesce(p_stretch_targets,'[]'::jsonb),'minimum_exit_criteria',p_minimum_exit_criteria,
    'teacher_mode',normalized_mode,'expected_revision',p_expected_revision
  );

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'teaching.pacing-plan' or
       prior.target_entity_id<>p_lesson_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3202';
    end if;
    return query select 'saved'::text,prior.result_revision,true,(prior.result_metadata->>'plan_id')::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':'||p_class_id::text||':'||p_lesson_id::text,0));
  select p.* into current_plan from public.lesson_pacing_plans p
    where p.workspace_id=owned_workspace_id and p.class_id=p_class_id and p.lesson_id=p_lesson_id for update;
  if found then current_revision:=current_plan.revision; else current_revision:=0; end if;
  if current_revision<>p_expected_revision then
    return query select 'conflict'::text,current_revision,false,current_plan.id;
    return;
  end if;

  if current_revision=0 then
    insert into public.lesson_pacing_plans(
      workspace_id,class_id,lesson_id,lesson_version_id,normal_meetings,available_meetings,correction_reserve,
      core_targets,practice_targets,stretch_targets,minimum_exit_criteria,teacher_mode,revision
    ) values(
      owned_workspace_id,p_class_id,p_lesson_id,p_lesson_version_id,p_normal_meetings,p_available_meetings,p_correction_reserve,
      p_core_targets,coalesce(p_practice_targets,'[]'::jsonb),coalesce(p_stretch_targets,'[]'::jsonb),p_minimum_exit_criteria,normalized_mode,1
    ) returning * into current_plan;
  else
    update public.lesson_pacing_plans p set
      lesson_version_id=p_lesson_version_id,
      normal_meetings=p_normal_meetings,
      available_meetings=p_available_meetings,
      correction_reserve=p_correction_reserve,
      core_targets=p_core_targets,
      practice_targets=coalesce(p_practice_targets,'[]'::jsonb),
      stretch_targets=coalesce(p_stretch_targets,'[]'::jsonb),
      minimum_exit_criteria=p_minimum_exit_criteria,
      teacher_mode=normalized_mode,
      revision=p.revision+1,
      updated_at=now()
    where p.id=current_plan.id returning * into current_plan;
  end if;

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'teaching.pacing-plan','lesson_pacing_plan',p_lesson_id,request_meta,current_plan.revision,
    jsonb_build_object('plan_id',current_plan.id,'teacher_mode',current_plan.teacher_mode));
  return query select 'saved'::text,current_plan.revision,false,current_plan.id;
end;$$;

revoke all on function public.upsert_lesson_pacing_plan_operation(uuid,uuid,uuid,uuid,integer,integer,integer,jsonb,jsonb,jsonb,jsonb,text,bigint) from public,anon;
grant execute on function public.upsert_lesson_pacing_plan_operation(uuid,uuid,uuid,uuid,integer,integer,integer,jsonb,jsonb,jsonb,jsonb,text,bigint) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.4-pacing-final.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
