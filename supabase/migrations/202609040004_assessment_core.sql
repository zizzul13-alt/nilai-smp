-- R3.3 canonical Assessment Core. Server truth first; no new Safe Work mutation is introduced.

-- Existing parent tables gain composite uniqueness only to support class/period-aware canonical FKs.
alter table public.classes add constraint class_workspace_id_period_unique unique (workspace_id,id,academic_period_id);
alter table public.enrollments add constraint enrollment_workspace_id_class_unique unique (workspace_id,id,class_id);

create table public.scoring_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  description text,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scoring_profile_description_nonblank check (description is null or btrim(description) <> ''),
  constraint scoring_profile_workspace_id_unique unique (workspace_id,id)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  academic_period_id uuid not null,
  activity_id uuid,
  scoring_profile_id uuid,
  title text not null check (btrim(title) <> ''),
  description text,
  instructions text,
  status text not null default 'active' check (status in ('planned','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_class_period_fk foreign key (workspace_id,class_id,academic_period_id)
    references public.classes(workspace_id,id,academic_period_id) on delete restrict,
  constraint assessment_activity_class_fk foreign key (workspace_id,activity_id,class_id)
    references public.activities(workspace_id,id,class_id) on delete restrict,
  constraint assessment_scoring_profile_fk foreign key (workspace_id,scoring_profile_id)
    references public.scoring_profiles(workspace_id,id) on delete restrict,
  constraint assessment_description_nonblank check (description is null or btrim(description) <> ''),
  constraint assessment_instructions_nonblank check (instructions is null or btrim(instructions) <> ''),
  constraint assessment_workspace_id_unique unique (workspace_id,id),
  constraint assessment_workspace_id_class_unique unique (workspace_id,id,class_id)
);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  assessment_id uuid not null,
  enrollment_id uuid not null,
  class_id uuid not null,
  state text not null default 'UNCHECKED' check (state in ('UNCHECKED','GRADED','MISSING','EXCUSED')),
  score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_result_assessment_fk foreign key (workspace_id,assessment_id,class_id)
    references public.assessments(workspace_id,id,class_id) on delete restrict,
  constraint assessment_result_enrollment_fk foreign key (workspace_id,enrollment_id,class_id)
    references public.enrollments(workspace_id,id,class_id) on delete restrict,
  constraint assessment_result_state_score_semantics check (
    (state = 'GRADED' and score is not null) or
    (state in ('UNCHECKED','MISSING','EXCUSED') and score is null)
  ),
  constraint assessment_result_current_unique unique (workspace_id,assessment_id,enrollment_id),
  constraint assessment_result_workspace_id_unique unique (workspace_id,id)
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  result_id uuid not null,
  attempt_kind text not null check (attempt_kind in ('ORIGINAL','MAKEUP','REMEDIAL','CORRECTION')),
  sequence_no integer not null check (sequence_no >= 1),
  raw_score numeric,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint assessment_attempt_result_fk foreign key (workspace_id,result_id)
    references public.assessment_results(workspace_id,id) on delete restrict,
  constraint assessment_attempt_sequence_unique unique (workspace_id,result_id,sequence_no),
  constraint assessment_attempt_workspace_id_unique unique (workspace_id,id)
);

create index scoring_profiles_workspace_status_name_idx on public.scoring_profiles(workspace_id,status,name);
create index assessments_workspace_class_status_idx on public.assessments(workspace_id,class_id,status);
create index assessments_workspace_period_status_idx on public.assessments(workspace_id,academic_period_id,status);
create index assessment_results_workspace_enrollment_idx on public.assessment_results(workspace_id,enrollment_id);
create index assessment_results_workspace_assessment_state_idx on public.assessment_results(workspace_id,assessment_id,state);
create index assessment_attempts_workspace_result_order_idx on public.assessment_attempts(workspace_id,result_id,sequence_no,recorded_at);

alter table public.scoring_profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_results enable row level security;
alter table public.assessment_attempts enable row level security;

revoke all on public.scoring_profiles, public.assessments, public.assessment_results, public.assessment_attempts from anon;
grant select,insert,update,delete on public.scoring_profiles, public.assessments to authenticated;
-- Result/Attempt writes are deliberately routed through narrow canonical RPCs; browser tables are read-only.
grant select on public.assessment_results, public.assessment_attempts to authenticated;
revoke insert,update,delete on public.assessment_results, public.assessment_attempts from authenticated;

create policy scoring_profile_owner_all on public.scoring_profiles for all to authenticated
  using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()))
  with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy assessment_owner_all on public.assessments for all to authenticated
  using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()))
  with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy assessment_result_owner_select on public.assessment_results for select to authenticated
  using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy assessment_attempt_owner_select on public.assessment_attempts for select to authenticated
  using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));

create or replace function public.record_assessment_judgement(
  p_assessment_id uuid,
  p_enrollment_id uuid,
  p_state text,
  p_score numeric default null,
  p_attempt_kind text default null,
  p_raw_score numeric default null,
  p_evidence jsonb default '{}'::jsonb
)
returns table(result_id uuid,attempt_id uuid,state text,score numeric)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  owned_class_id uuid;
  result_row public.assessment_results;
  new_attempt_id uuid;
  next_sequence integer;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_state not in ('UNCHECKED','GRADED','MISSING','EXCUSED') then raise exception 'invalid result state' using errcode='22023'; end if;
  if (p_state='GRADED' and p_score is null) or (p_state<>'GRADED' and p_score is not null) then raise exception 'state/score mismatch' using errcode='22023'; end if;
  if p_attempt_kind is not null and p_attempt_kind not in ('ORIGINAL','MAKEUP','REMEDIAL','CORRECTION') then raise exception 'invalid attempt kind' using errcode='22023'; end if;
  if p_attempt_kind is null and (p_raw_score is not null or p_evidence <> '{}'::jsonb) then raise exception 'attempt evidence requires attempt kind' using errcode='22023'; end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' then raise exception 'evidence must be object' using errcode='22023'; end if;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3301'; end if;

  select a.class_id into owned_class_id
  from public.assessments a
  where a.id=p_assessment_id and a.workspace_id=owned_workspace_id;
  if owned_class_id is null then raise exception 'assessment not found in owned workspace' using errcode='P3302'; end if;
  if not exists(select 1 from public.enrollments e where e.id=p_enrollment_id and e.workspace_id=owned_workspace_id and e.class_id=owned_class_id) then
    raise exception 'enrollment not found in assessment class' using errcode='P3303';
  end if;

  insert into public.assessment_results(workspace_id,assessment_id,enrollment_id,class_id,state,score)
  values(owned_workspace_id,p_assessment_id,p_enrollment_id,owned_class_id,p_state,p_score)
  on conflict(workspace_id,assessment_id,enrollment_id) do update
    set state=excluded.state,score=excluded.score,updated_at=now()
  returning * into result_row;

  if p_attempt_kind is not null then
    perform 1 from public.assessment_results r where r.id=result_row.id for update;
    select coalesce(max(a.sequence_no),0)+1 into next_sequence
    from public.assessment_attempts a where a.workspace_id=owned_workspace_id and a.result_id=result_row.id;
    insert into public.assessment_attempts(workspace_id,result_id,attempt_kind,sequence_no,raw_score,evidence)
    values(owned_workspace_id,result_row.id,p_attempt_kind,next_sequence,p_raw_score,p_evidence)
    returning id into new_attempt_id;
  end if;

  return query select result_row.id,new_attempt_id,result_row.state,result_row.score;
end;
$$;

revoke all on function public.record_assessment_judgement(uuid,uuid,text,numeric,text,numeric,jsonb) from public,anon;
grant execute on function public.record_assessment_judgement(uuid,uuid,text,numeric,text,numeric,jsonb) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.3-assessment-core.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
