-- R3.3 Bulk Assessment: online-only atomic batch commit for one Assessment.
-- Preview remains client-local/read-only; this RPC is the sole bulk mutation boundary.

create or replace function public.apply_assessment_bulk_operation(
  p_op_id uuid,
  p_assessment_id uuid,
  p_rows jsonb
)
returns table(outcome text,replayed boolean,summary jsonb,conflicts jsonb)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  owned_class_id uuid;
  judgement_scoring_profile_id uuid;
  prior public.applied_operations;
  request_meta jsonb;
  row_item jsonb;
  row_enrollment uuid;
  row_state text;
  row_score numeric;
  row_expected bigint;
  row_attempt_kind text;
  row_raw_score numeric;
  result_row public.assessment_results;
  current_revision bigint;
  next_revision bigint;
  next_sequence integer;
  new_attempt_id uuid;
  conflict_rows jsonb:='[]'::jsonb;
  processed integer:=0;
  created_count integer:=0;
  changed_count integer:=0;
  unchanged_count integer:=0;
  graded_count integer:=0;
  missing_count integer:=0;
  excused_count integer:=0;
  unchecked_count integer:=0;
  attempts_count integer:=0;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_assessment_id is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'invalid bulk operation' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows)>500 then raise exception 'bulk row limit exceeded' using errcode='22023'; end if;

  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3501'; end if;
  select a.class_id,a.scoring_profile_id into owned_class_id,judgement_scoring_profile_id
    from public.assessments a where a.id=p_assessment_id and a.workspace_id=owned_workspace_id;
  if owned_class_id is null then raise exception 'assessment not found in owned workspace' using errcode='P3502'; end if;

  request_meta:=jsonb_build_object('assessment_id',p_assessment_id,'rows',p_rows);
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'assessment.bulk' or
       prior.target_entity_id<>p_assessment_id or prior.request_metadata<>request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode='P3202';
    end if;
    return query select 'saved'::text,true,prior.result_metadata->'summary','[]'::jsonb;
    return;
  end if;

  -- Validate complete batch shape, identity and duplicate enrollment keys before any academic mutation.
  if exists(
    select 1 from jsonb_array_elements(p_rows) x
    where not (x ? 'enrollment_id') or not (x ? 'state') or not (x ? 'expected_revision')
  ) then raise exception 'bulk row missing required fields' using errcode='22023'; end if;
  if exists(
    select 1 from (
      select x->>'enrollment_id' enrollment_id,count(*) c from jsonb_array_elements(p_rows) x group by 1 having count(*)>1
    ) d
  ) then raise exception 'duplicate enrollment in batch' using errcode='P3503'; end if;

  -- Lock every logical Result key in deterministic order, including not-yet-existing Results.
  for row_enrollment in
    select (x->>'enrollment_id')::uuid from jsonb_array_elements(p_rows) x order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      owned_workspace_id::text||':'||p_assessment_id::text||':'||row_enrollment::text,0
    ));
  end loop;

  -- First pass: validate semantics/ownership/revisions for the entire batch.
  for row_item in select value from jsonb_array_elements(p_rows)
  loop
    processed:=processed+1;
    begin row_enrollment:=(row_item->>'enrollment_id')::uuid; exception when others then raise exception 'invalid enrollment id' using errcode='22023'; end;
    row_state:=row_item->>'state';
    begin row_expected:=(row_item->>'expected_revision')::bigint; exception when others then raise exception 'invalid expected revision' using errcode='22023'; end;
    if row_expected<0 then raise exception 'invalid expected revision' using errcode='22023'; end if;
    if row_state not in ('UNCHECKED','GRADED','MISSING','EXCUSED') then raise exception 'invalid result state' using errcode='22023'; end if;
    if row_state='GRADED' then
      if not (row_item ? 'score') or jsonb_typeof(row_item->'score')<>'number' then raise exception 'graded row requires numeric score' using errcode='22023'; end if;
      row_score:=(row_item->>'score')::numeric;
      graded_count:=graded_count+1;
    else
      if row_item ? 'score' and row_item->'score'<>'null'::jsonb then raise exception 'non-graded row cannot carry score' using errcode='22023'; end if;
      row_score:=null;
      if row_state='MISSING' then missing_count:=missing_count+1;
      elsif row_state='EXCUSED' then excused_count:=excused_count+1;
      else unchecked_count:=unchecked_count+1; end if;
    end if;
    if not exists(select 1 from public.enrollments e where e.id=row_enrollment and e.workspace_id=owned_workspace_id and e.class_id=owned_class_id) then
      raise exception 'enrollment not found in assessment class' using errcode='P3504';
    end if;
    select r.* into result_row from public.assessment_results r
      where r.workspace_id=owned_workspace_id and r.assessment_id=p_assessment_id and r.enrollment_id=row_enrollment for update;
    if found then current_revision:=result_row.revision; else current_revision:=0; end if;
    if current_revision<>row_expected then
      conflict_rows:=conflict_rows||jsonb_build_array(jsonb_build_object(
        'enrollment_id',row_enrollment,'expected_revision',row_expected,'canonical_revision',current_revision,
        'canonical_state',case when current_revision=0 then null else result_row.state end,
        'canonical_score',case when current_revision=0 then null else result_row.score end
      ));
    end if;
  end loop;
  if jsonb_array_length(conflict_rows)>0 then
    return query select 'conflict'::text,false,null::jsonb,conflict_rows;
    return;
  end if;

  -- Second pass: all rows are valid and current. UNCHECKED means no judgement/no mutation.
  for row_item in select value from jsonb_array_elements(p_rows)
  loop
    row_enrollment:=(row_item->>'enrollment_id')::uuid;
    row_state:=row_item->>'state';
    row_expected:=(row_item->>'expected_revision')::bigint;
    row_score:=case when row_state='GRADED' then (row_item->>'score')::numeric else null end;
    if row_state='UNCHECKED' then unchanged_count:=unchanged_count+1; continue; end if;

    select r.* into result_row from public.assessment_results r
      where r.workspace_id=owned_workspace_id and r.assessment_id=p_assessment_id and r.enrollment_id=row_enrollment for update;
    if found and result_row.state=row_state and result_row.score is not distinct from row_score then
      unchanged_count:=unchanged_count+1; continue;
    end if;

    next_revision:=row_expected+1;
    if not found then
      insert into public.assessment_results(workspace_id,assessment_id,enrollment_id,class_id,scoring_profile_id,state,score,revision)
      values(owned_workspace_id,p_assessment_id,row_enrollment,owned_class_id,judgement_scoring_profile_id,row_state,row_score,next_revision)
      returning * into result_row;
      created_count:=created_count+1;
    else
      update public.assessment_results r set scoring_profile_id=judgement_scoring_profile_id,state=row_state,score=row_score,
        revision=next_revision,updated_at=now() where r.id=result_row.id returning * into result_row;
      changed_count:=changed_count+1;
    end if;

    row_attempt_kind:=nullif(row_item->>'attempt_kind','');
    if row_attempt_kind is not null then
      if row_attempt_kind not in ('ORIGINAL','MAKEUP','REMEDIAL','CORRECTION') then raise exception 'invalid attempt kind' using errcode='22023'; end if;
      if row_state<>'GRADED' then raise exception 'attempt requires graded row' using errcode='22023'; end if;
      row_raw_score:=coalesce((row_item->>'raw_score')::numeric,row_score);
      select coalesce(max(a.sequence_no),0)+1 into next_sequence from public.assessment_attempts a
        where a.workspace_id=owned_workspace_id and a.result_id=result_row.id;
      insert into public.assessment_attempts(workspace_id,result_id,scoring_profile_id,attempt_kind,sequence_no,raw_score,evidence)
      values(owned_workspace_id,result_row.id,judgement_scoring_profile_id,row_attempt_kind,next_sequence,row_raw_score,
        jsonb_build_object('source','bulk-assessment','op_id',p_op_id)) returning id into new_attempt_id;
      attempts_count:=attempts_count+1;
    end if;
  end loop;

  summary:=jsonb_build_object('rows_processed',processed,'results_created',created_count,'results_changed',changed_count,
    'unchanged',unchanged_count,'graded',graded_count,'missing',missing_count,'excused',excused_count,
    'unchecked',unchecked_count,'attempts_created',attempts_count);
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'assessment.bulk','assessment',p_assessment_id,request_meta,1,jsonb_build_object('summary',summary));
  return query select 'saved'::text,false,summary,'[]'::jsonb;
end;
$$;

revoke all on function public.apply_assessment_bulk_operation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_assessment_bulk_operation(uuid,uuid,jsonb) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.3-bulk-assessment.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
