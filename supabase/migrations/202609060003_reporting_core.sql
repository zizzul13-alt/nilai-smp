-- R3.5-01 Reporting Core.
-- Reporting is derived from canonical Assessment Result truth through an explicit, versioned policy.
-- Finalization is intentional and reopenable; snapshots remain append-only historical evidence.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_user_id uuid not null,
  event_type text not null check (btrim(event_type) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint audit_event_workspace_id_unique unique(workspace_id,id)
);
create index audit_events_workspace_created_idx on public.audit_events(workspace_id,created_at desc);

create table public.reporting_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  academic_period_id uuid not null,
  policy_key uuid not null,
  version_no integer not null check(version_no>=1),
  name text not null check(btrim(name)<>''),
  aggregation text not null default 'SIMPLE_MEAN' check(aggregation='SIMPLE_MEAN'),
  missing_policy text not null default 'EXCLUDE' check(missing_policy in ('EXCLUDE','ZERO')),
  excused_policy text not null default 'EXCLUDE' check(excused_policy='EXCLUDE'),
  -- R3.5-01 reports the current interpreted Result only. Raw Attempt evidence is never promoted to a report outcome.
  remedial_policy text not null default 'CURRENT_RESULT' check(remedial_policy='CURRENT_RESULT'),
  rounding_mode text not null default 'NONE' check(rounding_mode in ('NONE','INTEGER','ONE_DECIMAL')),
  kkm numeric,
  status text not null default 'active' check(status in ('active','archived')),
  created_at timestamptz not null default now(),
  constraint reporting_policy_period_fk foreign key(workspace_id,academic_period_id)
    references public.academic_periods(workspace_id,id) on delete restrict,
  constraint reporting_policy_workspace_id_unique unique(workspace_id,id),
  constraint reporting_policy_workspace_period_id_unique unique(workspace_id,id,academic_period_id),
  constraint reporting_policy_series_version_unique unique(workspace_id,policy_key,version_no)
);
create index reporting_policies_workspace_period_status_idx on public.reporting_policies(workspace_id,academic_period_id,status,created_at desc);

create table public.reporting_cycles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  academic_period_id uuid not null,
  reporting_policy_id uuid not null,
  status text not null default 'OPEN' check(status in ('OPEN','FINALIZED')),
  revision bigint not null default 0 check(revision>=0),
  current_snapshot_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reporting_cycle_class_period_fk foreign key(workspace_id,class_id,academic_period_id)
    references public.classes(workspace_id,id,academic_period_id) on delete restrict,
  constraint reporting_cycle_policy_period_fk foreign key(workspace_id,reporting_policy_id,academic_period_id)
    references public.reporting_policies(workspace_id,id,academic_period_id) on delete restrict,
  constraint reporting_cycle_workspace_id_unique unique(workspace_id,id),
  constraint reporting_cycle_class_period_unique unique(workspace_id,class_id,academic_period_id)
);
create index reporting_cycles_workspace_status_idx on public.reporting_cycles(workspace_id,status,updated_at desc);

create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  cycle_id uuid not null,
  class_id uuid not null,
  academic_period_id uuid not null,
  reporting_policy_id uuid not null,
  snapshot_no integer not null check(snapshot_no>=1),
  kind text not null check(kind in ('PROVISIONAL','FINALIZED')),
  assessment_count integer not null check(assessment_count>=0),
  enrollment_count integer not null check(enrollment_count>=0),
  source_summary jsonb not null default '{}'::jsonb check(jsonb_typeof(source_summary)='object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint report_snapshot_cycle_fk foreign key(workspace_id,cycle_id)
    references public.reporting_cycles(workspace_id,id) on delete restrict,
  constraint report_snapshot_class_period_fk foreign key(workspace_id,class_id,academic_period_id)
    references public.classes(workspace_id,id,academic_period_id) on delete restrict,
  constraint report_snapshot_policy_period_fk foreign key(workspace_id,reporting_policy_id,academic_period_id)
    references public.reporting_policies(workspace_id,id,academic_period_id) on delete restrict,
  constraint report_snapshot_workspace_id_unique unique(workspace_id,id),
  constraint report_snapshot_workspace_id_cycle_unique unique(workspace_id,id,cycle_id),
  constraint report_snapshot_workspace_id_class_unique unique(workspace_id,id,class_id),
  constraint report_snapshot_cycle_sequence_unique unique(workspace_id,cycle_id,snapshot_no)
);
create index report_snapshots_workspace_cycle_created_idx on public.report_snapshots(workspace_id,cycle_id,created_at desc);

-- The current snapshot must belong to this exact reporting cycle, not merely the same workspace.
alter table public.reporting_cycles
  add constraint reporting_cycle_current_snapshot_fk foreign key(workspace_id,current_snapshot_id,id)
  references public.report_snapshots(workspace_id,id,cycle_id) on delete restrict;

create table public.report_snapshot_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  snapshot_id uuid not null,
  class_id uuid not null,
  enrollment_id uuid not null,
  student_id uuid not null,
  student_display_name text not null check(btrim(student_display_name)<>''),
  enrollment_status text not null,
  reported_score numeric,
  meets_kkm boolean,
  assessment_count integer not null check(assessment_count>=0),
  graded_count integer not null check(graded_count>=0),
  missing_count integer not null check(missing_count>=0),
  excused_count integer not null check(excused_count>=0),
  unchecked_count integer not null check(unchecked_count>=0),
  included_count integer not null check(included_count>=0),
  calculation jsonb not null default '{}'::jsonb check(jsonb_typeof(calculation)='object'),
  constraint report_snapshot_row_snapshot_class_fk foreign key(workspace_id,snapshot_id,class_id)
    references public.report_snapshots(workspace_id,id,class_id) on delete restrict,
  constraint report_snapshot_row_enrollment_fk foreign key(workspace_id,enrollment_id,class_id)
    references public.enrollments(workspace_id,id,class_id) on delete restrict,
  constraint report_snapshot_row_student_fk foreign key(workspace_id,student_id)
    references public.students(workspace_id,id) on delete restrict,
  constraint report_snapshot_row_unique unique(workspace_id,snapshot_id,enrollment_id)
);
create index report_snapshot_rows_workspace_snapshot_name_idx on public.report_snapshot_rows(workspace_id,snapshot_id,student_display_name);

alter table public.audit_events enable row level security;
alter table public.reporting_policies enable row level security;
alter table public.reporting_cycles enable row level security;
alter table public.report_snapshots enable row level security;
alter table public.report_snapshot_rows enable row level security;

revoke all on public.audit_events, public.reporting_policies, public.reporting_cycles, public.report_snapshots, public.report_snapshot_rows from anon;
grant select on public.audit_events, public.reporting_policies, public.reporting_cycles, public.report_snapshots, public.report_snapshot_rows to authenticated;
revoke insert,update,delete on public.audit_events, public.reporting_policies, public.reporting_cycles, public.report_snapshots, public.report_snapshot_rows from authenticated;

create policy audit_event_owner_select on public.audit_events for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy reporting_policy_owner_select on public.reporting_policies for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy reporting_cycle_owner_select on public.reporting_cycles for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy report_snapshot_owner_select on public.report_snapshots for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy report_snapshot_row_owner_select on public.report_snapshot_rows for select to authenticated
  using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));

create or replace function public.create_reporting_policy_operation(
  p_op_id uuid,
  p_academic_period_id uuid,
  p_name text,
  p_policy_key uuid default null,
  p_missing_policy text default 'EXCLUDE',
  p_remedial_policy text default 'CURRENT_RESULT',
  p_rounding_mode text default 'NONE',
  p_kkm numeric default null
)
returns table(policy_id uuid,policy_key uuid,version_no integer,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  series_key uuid:=coalesce(p_policy_key,p_op_id);
  next_version integer;
  new_policy public.reporting_policies;
  prior public.applied_operations;
  request_meta jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_academic_period_id is null or btrim(coalesce(p_name,''))='' then raise exception 'invalid reporting policy' using errcode='22023'; end if;
  if p_missing_policy not in ('EXCLUDE','ZERO') or p_remedial_policy<>'CURRENT_RESULT' or p_rounding_mode not in ('NONE','INTEGER','ONE_DECIMAL') then
    raise exception 'invalid reporting policy semantics' using errcode='22023';
  end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3501'; end if;
  if not exists(select 1 from public.academic_periods p where p.id=p_academic_period_id and p.workspace_id=owned_workspace_id) then
    raise exception 'academic period not owned' using errcode='P3502';
  end if;
  request_meta:=jsonb_build_object('academic_period_id',p_academic_period_id,'name',btrim(p_name),'policy_key',series_key,'missing_policy',p_missing_policy,'remedial_policy',p_remedial_policy,'rounding_mode',p_rounding_mode,'kkm',p_kkm);

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'reporting.policy-create' or prior.target_entity_id<>p_academic_period_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select (prior.result_metadata->>'policy_id')::uuid,(prior.result_metadata->>'policy_key')::uuid,prior.result_revision::integer,true; return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':report-policy:'||series_key::text,0));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'reporting.policy-create' or prior.target_entity_id<>p_academic_period_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select (prior.result_metadata->>'policy_id')::uuid,(prior.result_metadata->>'policy_key')::uuid,prior.result_revision::integer,true; return;
  end if;

  if p_policy_key is not null and not exists(select 1 from public.reporting_policies rp where rp.workspace_id=owned_workspace_id and rp.policy_key=series_key and rp.academic_period_id=p_academic_period_id) then
    raise exception 'policy series not found in period' using errcode='P3503';
  end if;
  select coalesce(max(rp.version_no),0)+1 into next_version from public.reporting_policies rp where rp.workspace_id=owned_workspace_id and rp.policy_key=series_key;
  insert into public.reporting_policies(workspace_id,academic_period_id,policy_key,version_no,name,aggregation,missing_policy,excused_policy,remedial_policy,rounding_mode,kkm)
  values(owned_workspace_id,p_academic_period_id,series_key,next_version,btrim(p_name),'SIMPLE_MEAN',p_missing_policy,'EXCLUDE','CURRENT_RESULT',p_rounding_mode,p_kkm)
  returning * into new_policy;

  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(owned_workspace_id,caller_id,'reporting.policy.created','reporting_policy',new_policy.id,jsonb_build_object('policy_key',series_key,'version_no',next_version));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'reporting.policy-create','academic_period',p_academic_period_id,request_meta,next_version,jsonb_build_object('policy_id',new_policy.id,'policy_key',series_key));
  return query select new_policy.id,series_key,next_version,false;
end;$$;

create or replace function public.calculate_report_snapshot_operation(
  p_op_id uuid,
  p_class_id uuid,
  p_reporting_policy_id uuid,
  p_finalize boolean,
  p_expected_revision bigint
)
returns table(outcome text,cycle_id uuid,snapshot_id uuid,revision bigint,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  period_id uuid;
  policy public.reporting_policies;
  cycle public.reporting_cycles;
  snapshot public.report_snapshots;
  prior public.applied_operations;
  request_meta jsonb;
  source_snapshot jsonb;
  next_snapshot integer;
  assessment_total integer;
  enrollment_total integer;
  incomplete_rows integer;
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_class_id is null or p_reporting_policy_id is null or p_finalize is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid report snapshot operation' using errcode='22023'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3501'; end if;
  select c.academic_period_id into period_id from public.classes c where c.id=p_class_id and c.workspace_id=owned_workspace_id;
  if period_id is null then raise exception 'class not owned' using errcode='P3504'; end if;
  select rp.* into policy from public.reporting_policies rp where rp.id=p_reporting_policy_id and rp.workspace_id=owned_workspace_id and rp.academic_period_id=period_id and rp.status='active';
  if not found then raise exception 'reporting policy not active in class period' using errcode='P3505'; end if;
  request_meta:=jsonb_build_object('class_id',p_class_id,'reporting_policy_id',p_reporting_policy_id,'finalize',p_finalize,'expected_revision',p_expected_revision);

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'reporting.snapshot' or prior.target_entity_id<>p_class_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'saved'::text,(prior.result_metadata->>'cycle_id')::uuid,(prior.result_metadata->>'snapshot_id')::uuid,prior.result_revision,true; return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':report-cycle:'||p_class_id::text||':'||period_id::text,0));
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'reporting.snapshot' or prior.target_entity_id<>p_class_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'saved'::text,(prior.result_metadata->>'cycle_id')::uuid,(prior.result_metadata->>'snapshot_id')::uuid,prior.result_revision,true; return;
  end if;

  select rc.* into cycle from public.reporting_cycles rc where rc.workspace_id=owned_workspace_id and rc.class_id=p_class_id and rc.academic_period_id=period_id for update;
  if not found then
    if p_expected_revision<>0 then return query select 'conflict'::text,null::uuid,null::uuid,0::bigint,false; return; end if;
    insert into public.reporting_cycles(workspace_id,class_id,academic_period_id,reporting_policy_id,status,revision)
    values(owned_workspace_id,p_class_id,period_id,p_reporting_policy_id,'OPEN',0) returning * into cycle;
  elsif cycle.revision<>p_expected_revision then
    return query select 'conflict'::text,cycle.id,cycle.current_snapshot_id,cycle.revision,false; return;
  elsif cycle.status='FINALIZED' then
    raise exception 'reporting cycle is finalized; reopen before recalculation' using errcode='P3507';
  end if;

  -- A FINALIZED snapshot is a closure boundary. Block canonical source mutations until this transaction commits,
  -- so a write cannot race after source capture but before the cycle is marked FINALIZED.
  if p_finalize then
    lock table public.classes, public.assessments, public.assessment_results, public.enrollments, public.students in share mode;
  end if;

  -- Materialize the complete report source in ONE SQL statement. Under PostgreSQL READ COMMITTED this statement
  -- observes one MVCC snapshot, so different enrollments cannot mix old/new committed Result or membership states.
  with assessment_source as materialized (
    select a.id,a.title,a.created_at
    from public.assessments a
    where a.workspace_id=owned_workspace_id and a.class_id=p_class_id and a.academic_period_id=period_id and a.status in ('active','archived')
  ), enrollment_source as materialized (
    select en.id enrollment_id,en.student_id,en.status enrollment_status,s.display_name
    from public.enrollments en
    join public.students s on s.workspace_id=en.workspace_id and s.id=en.student_id
    where en.workspace_id=owned_workspace_id and en.class_id=p_class_id and en.status<>'archived'
  ), cell_source as materialized (
    select e.enrollment_id,e.student_id,e.enrollment_status,e.display_name,
      a.id assessment_id,a.title,a.created_at,
      case when a.id is null then null else coalesce(r.state,'UNCHECKED') end state,
      r.score current_score,
      case
        when r.state='GRADED' then r.score
        when r.state='MISSING' and policy.missing_policy='ZERO' then 0::numeric
        else null::numeric
      end included_value
    from enrollment_source e
    left join assessment_source a on true
    left join public.assessment_results r
      on a.id is not null and r.workspace_id=owned_workspace_id and r.assessment_id=a.id and r.enrollment_id=e.enrollment_id
  ), row_source as materialized (
    select enrollment_id,student_id,enrollment_status,display_name,
      count(assessment_id)::integer assessment_count,
      count(*) filter(where assessment_id is not null and state='GRADED')::integer graded_count,
      count(*) filter(where assessment_id is not null and state='MISSING')::integer missing_count,
      count(*) filter(where assessment_id is not null and state='EXCUSED')::integer excused_count,
      count(*) filter(where assessment_id is not null and state='UNCHECKED')::integer unchecked_count,
      count(included_value)::integer included_count,
      avg(included_value) raw_average,
      coalesce(
        jsonb_agg(jsonb_build_object(
          'assessment_id',assessment_id,'title',title,'state',state,'value',included_value,'current_score',current_score
        ) order by created_at,assessment_id) filter(where assessment_id is not null),
        '[]'::jsonb
      ) entries
    from cell_source
    group by enrollment_id,student_id,enrollment_status,display_name
  )
  select jsonb_build_object(
    'assessment_total',(select count(*) from assessment_source),
    'enrollment_total',(select count(*) from enrollment_source),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'enrollment_id',enrollment_id,
      'student_id',student_id,
      'enrollment_status',enrollment_status,
      'student_display_name',display_name,
      'assessment_count',assessment_count,
      'graded_count',graded_count,
      'missing_count',missing_count,
      'excused_count',excused_count,
      'unchecked_count',unchecked_count,
      'included_count',included_count,
      'raw_average',raw_average,
      'entries',entries
    ) order by display_name,enrollment_id) from row_source),'[]'::jsonb)
  ) into source_snapshot;

  assessment_total:=(source_snapshot->>'assessment_total')::integer;
  enrollment_total:=(source_snapshot->>'enrollment_total')::integer;
  select count(*) into incomplete_rows
  from jsonb_to_recordset(source_snapshot->'rows') as rr(unchecked_count integer)
  where rr.unchecked_count>0;

  if p_finalize and assessment_total=0 then raise exception 'cannot finalize without reportable assessments' using errcode='P3508'; end if;
  if p_finalize and enrollment_total=0 then raise exception 'cannot finalize without reportable enrollments' using errcode='P3509'; end if;
  if p_finalize and incomplete_rows>0 then raise exception 'cannot finalize while UNCHECKED evidence remains' using errcode='P3506'; end if;

  select coalesce(max(rs.snapshot_no),0)+1 into next_snapshot from public.report_snapshots rs where rs.workspace_id=owned_workspace_id and rs.cycle_id=cycle.id;
  insert into public.report_snapshots(workspace_id,cycle_id,class_id,academic_period_id,reporting_policy_id,snapshot_no,kind,assessment_count,enrollment_count,source_summary,created_by)
  values(owned_workspace_id,cycle.id,p_class_id,period_id,p_reporting_policy_id,next_snapshot,case when p_finalize then 'FINALIZED' else 'PROVISIONAL' end,assessment_total,enrollment_total,
    jsonb_build_object(
      'aggregation',policy.aggregation,
      'missing_policy',policy.missing_policy,
      'excused_policy',policy.excused_policy,
      'remedial_policy','CURRENT_RESULT',
      'rounding_mode',policy.rounding_mode,
      'kkm',policy.kkm,
      'source_consistency','ONE_STATEMENT_MVCC',
      'finalize_source_lock',p_finalize
    ),caller_id)
  returning * into snapshot;

  insert into public.report_snapshot_rows(
    workspace_id,snapshot_id,class_id,enrollment_id,student_id,student_display_name,enrollment_status,
    reported_score,meets_kkm,assessment_count,graded_count,missing_count,excused_count,unchecked_count,included_count,calculation
  )
  select owned_workspace_id,snapshot.id,p_class_id,r.enrollment_id,r.student_id,r.student_display_name,r.enrollment_status,
    scored.final_score,
    case when scored.final_score is null or policy.kkm is null then null else scored.final_score>=policy.kkm end,
    r.assessment_count,r.graded_count,r.missing_count,r.excused_count,r.unchecked_count,r.included_count,
    jsonb_build_object('raw_average',r.raw_average,'rounding_mode',policy.rounding_mode,'entries',r.entries)
  from jsonb_to_recordset(source_snapshot->'rows') as r(
    enrollment_id uuid,student_id uuid,enrollment_status text,student_display_name text,
    assessment_count integer,graded_count integer,missing_count integer,excused_count integer,unchecked_count integer,included_count integer,
    raw_average numeric,entries jsonb
  )
  cross join lateral (
    select case
      when r.raw_average is null then null::numeric
      when policy.rounding_mode='INTEGER' then round(r.raw_average)
      when policy.rounding_mode='ONE_DECIMAL' then round(r.raw_average,1)
      else r.raw_average
    end final_score
  ) scored;

  update public.reporting_cycles rc set reporting_policy_id=p_reporting_policy_id,status=case when p_finalize then 'FINALIZED' else 'OPEN' end,current_snapshot_id=snapshot.id,revision=rc.revision+1,updated_at=now()
  where rc.id=cycle.id returning * into cycle;

  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(owned_workspace_id,caller_id,case when p_finalize then 'reporting.cycle.finalized' else 'reporting.snapshot.provisional' end,'reporting_cycle',cycle.id,jsonb_build_object('snapshot_id',snapshot.id,'policy_id',p_reporting_policy_id,'revision',cycle.revision));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'reporting.snapshot','class',p_class_id,request_meta,cycle.revision,jsonb_build_object('cycle_id',cycle.id,'snapshot_id',snapshot.id,'kind',snapshot.kind));
  return query select 'saved'::text,cycle.id,snapshot.id,cycle.revision,false;
end;$$;

create or replace function public.reopen_reporting_cycle_operation(
  p_op_id uuid,
  p_cycle_id uuid,
  p_reason text,
  p_expected_revision bigint
)
returns table(outcome text,revision bigint,replayed boolean)
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  caller_id uuid:=auth.uid();
  owned_workspace_id uuid;
  cycle public.reporting_cycles;
  prior public.applied_operations;
  request_meta jsonb;
  normalized_reason text:=btrim(coalesce(p_reason,''));
begin
  if caller_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_op_id is null or p_cycle_id is null or normalized_reason='' or p_expected_revision is null or p_expected_revision<1 then raise exception 'invalid reopen operation' using errcode='22023'; end if;
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id=caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode='P3501'; end if;
  request_meta:=jsonb_build_object('cycle_id',p_cycle_id,'reason',normalized_reason,'expected_revision',p_expected_revision);

  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'reporting.reopen' or prior.target_entity_id<>p_cycle_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'saved'::text,prior.result_revision,true; return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owned_workspace_id::text||':report-reopen:'||p_cycle_id::text,0));
  select rc.* into cycle from public.reporting_cycles rc where rc.id=p_cycle_id and rc.workspace_id=owned_workspace_id for update;
  if not found then raise exception 'reporting cycle not owned' using errcode='P3510'; end if;
  select ao.* into prior from public.applied_operations ao where ao.op_id=p_op_id;
  if found then
    if prior.workspace_id<>owned_workspace_id or prior.operation_type<>'reporting.reopen' or prior.target_entity_id<>p_cycle_id or prior.request_metadata<>request_meta then raise exception 'op_id scope or payload mismatch' using errcode='P3202'; end if;
    return query select 'saved'::text,prior.result_revision,true; return;
  end if;
  if cycle.revision<>p_expected_revision then return query select 'conflict'::text,cycle.revision,false; return; end if;
  if cycle.status<>'FINALIZED' then raise exception 'only finalized reporting cycle can be reopened' using errcode='P3511'; end if;

  update public.reporting_cycles rc set status='OPEN',revision=rc.revision+1,updated_at=now() where rc.id=cycle.id returning * into cycle;
  insert into public.audit_events(workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(owned_workspace_id,caller_id,'reporting.cycle.reopened','reporting_cycle',cycle.id,jsonb_build_object('reason',normalized_reason,'last_snapshot_id',cycle.current_snapshot_id,'revision',cycle.revision));
  insert into public.applied_operations(op_id,workspace_id,operation_type,target_entity_type,target_entity_id,request_metadata,result_revision,result_metadata)
  values(p_op_id,owned_workspace_id,'reporting.reopen','reporting_cycle',cycle.id,request_meta,cycle.revision,jsonb_build_object('reason',normalized_reason));
  return query select 'saved'::text,cycle.revision,false;
end;$$;

revoke all on function public.create_reporting_policy_operation(uuid,uuid,text,uuid,text,text,text,numeric) from public,anon;
grant execute on function public.create_reporting_policy_operation(uuid,uuid,text,uuid,text,text,text,numeric) to authenticated;
revoke all on function public.calculate_report_snapshot_operation(uuid,uuid,uuid,boolean,bigint) from public,anon;
grant execute on function public.calculate_report_snapshot_operation(uuid,uuid,uuid,boolean,bigint) to authenticated;
revoke all on function public.reopen_reporting_cycle_operation(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.reopen_reporting_cycle_operation(uuid,uuid,text,bigint) to authenticated;

insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.5-reporting-core.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
