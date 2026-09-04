-- R3.3 Rapid Correction + Safe Academic Writes.
-- Server remains canonical; correction sessions are workflow progress, not academic evidence.

alter table public.assessment_results
  add column revision bigint not null default 1 check (revision >= 1);

create table public.correction_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  assessment_id uuid not null,
  class_id uuid not null,
  status text not null default 'active' check (status in ('active','completed')),
  current_enrollment_id uuid,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint correction_session_assessment_fk foreign key (workspace_id,assessment_id,class_id)
    references public.assessments(workspace_id,id,class_id) on delete restrict,
  constraint correction_session_current_enrollment_fk foreign key (workspace_id,current_enrollment_id,class_id)
    references public.enrollments(workspace_id,id,class_id) on delete restrict,
  constraint correction_session_completion_semantics check (
    (status='active' and completed_at is null) or (status='completed' and completed_at is not null)
  ),
  constraint correction_session_workspace_id_unique unique(workspace_id,id)
);
create index correction_sessions_workspace_assessment_updated_idx
  on public.correction_sessions(workspace_id,assessment_id,updated_at desc);

alter table public.correction_sessions enable row level security;
revoke all on public.correction_sessions from anon;
grant select,insert,update on public.correction_sessions to authenticated;
create policy correction_session_owner_all on public.correction_sessions for all to authenticated
  using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()))
  with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));

create or replace function public.apply_assessment_judgement_operation(
  p_op_id uuid,
  p_assessment_id uuid,
  p_enrollment_id uuid,
  p_state text,
  p_score numeric,
  p_attempt_kind text,
  p_raw_score numeric,
  p_evidence jsonb,
  p_expected_revision bigint
)
returns table(outcome text,revision bigint,replayed boolean,result_id uuid,attempt_id uuid,state text,score numeric)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  caller_id uuid:=auth.uid(); owned_workspace_id uuid; owned_class_id uuid;
  judgement_scoring_profile_id uuid; current_revision bigint; next_revision bigint;
  result_row public.assessment_results; new_attempt_id uuid; next_sequence integer;
  prior public.applied_operations; request_meta jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_expected_revision<0 then raise exception 'invalid operation' using errcode='22023'; end if;
  if p_state not in ('UNCHECKED','GRADED','MISSING','EXCUSED') then raise exception 'invalid result state' using errcode='22023'; end if;
  if (p_state='GRADED' and p_score is null) or (p_state<>'GRADED' and p_score is not null) then raise exception 'state/score mismatch' using errcode='22023'; end if;
  if p_attempt_kind is not null and p_attempt_kind not in ('ORIGINAL','MAKEUP','REMEDIAL','CORRECTION') then raise exception 'invalid attempt kind' using errcode='22023'; end if;
  if p_attempt_kind is null and (p_raw_score is not null or coalesce(p_evidence,'{}'::jsonb)<>'{}'::jsonb) then raise exception 'attempt evidence requires attempt kind' using errcode='22023'; end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' then raise exception 'evidence must be object' using errcode='22023'; end if;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3401'; end if;
  select a.class_id,a.scoring_profile_id into owned_class_id,judgement_scoring_profile_id
    from public.assessments a where a.id=p_assessment_id and a.workspace_id=owned_workspace_id;
  if owned_class_id is null then raise exception 'assessment not found in owned workspace' using errcode='P3402'; end if;
  if not exists(select 1 from public.enrollments e where e.id=p_enrollment_id and e.workspace_id=owned_workspace_id and e.class_id=owned_class_id)
    then raise exception 'enrollment not found in assessment class' using errcode='P3403'; end if;

  request_meta:=jsonb_build_object('assessment_id',p_assessment_id,'enrollment_id',p_enrollment_id,'state',p_state,
    'score',p_score,'attempt_kind',p_attempt_kind,'raw_score',p_raw_score,'evidence',p_evidence,'expected_revision',p_expected_revision);
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'assessment.judgement' or
       prior.target_entity_id<>p_enrollment_id or prior.request_metadata<>request_meta
      then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'saved'::text,prior.result_revision,true,
      (prior.result_metadata->>'result_id')::uuid,(prior.result_metadata->>'attempt_id')::uuid,
      prior.result_metadata->>'state',nullif(prior.result_metadata->>'score','')::numeric;
    return;
  end if;

  select r.* into result_row from public.assessment_results r
    where r.workspace_id=owned_workspace_id and r.assessment_id=p_assessment_id and r.enrollment_id=p_enrollment_id for update;
  if found then current_revision:=result_row.revision; else current_revision:=0; end if;
  if current_revision<>p_expected_revision then
    return query select 'conflict'::text,current_revision,false,
      case when current_revision=0 then null else result_row.id end,null::uuid,
      case when current_revision=0 then null else result_row.state end,
      case when current_revision=0 then null else result_row.score end;
    return;
  end if;

  next_revision:=current_revision+1;
  if current_revision=0 then
    insert into public.assessment_results(workspace_id,assessment_id,enrollment_id,class_id,scoring_profile_id,state,score,revision)
    values(owned_workspace_id,p_assessment_id,p_enrollment_id,owned_class_id,judgement_scoring_profile_id,p_state,p_score,next_revision)
    returning * into result_row;
  else
    update public.assessment_results r set scoring_profile_id=judgement_scoring_profile_id,state=p_state,score=p_score,
      revision=next_revision,updated_at=now() where r.id=result_row.id returning * into result_row;
  end if;

  if p_attempt_kind is not null then
    select coalesce(max(a.sequence_no),0)+1 into next_sequence from public.assessment_attempts a
      where a.workspace_id=owned_workspace_id and a.result_id=result_row.id;
    insert into public.assessment_attempts(workspace_id,result_id,scoring_profile_id,attempt_kind,sequence_no,raw_score,evidence)
      values(owned_workspace_id,result_row.id,judgement_scoring_profile_id,p_attempt_kind,next_sequence,p_raw_score,p_evidence)
      returning id into new_attempt_id;
  end if;

  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
    values(p_op_id,owned_workspace_id,'assessment.judgement','assessment_result',p_enrollment_id,request_meta,next_revision,
      jsonb_build_object('result_id',result_row.id,'attempt_id',new_attempt_id,'state',result_row.state,'score',result_row.score));
  return query select 'saved'::text,next_revision,false,result_row.id,new_attempt_id,result_row.state,result_row.score;
end;$$;

revoke all on function public.apply_assessment_judgement_operation(uuid,uuid,uuid,text,numeric,text,numeric,jsonb,bigint) from public,anon;
grant execute on function public.apply_assessment_judgement_operation(uuid,uuid,uuid,text,numeric,text,numeric,jsonb,bigint) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.3-rapid-correction.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
