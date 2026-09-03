-- R3.2 Safe Work Engine: one narrow idempotent, revision-checked Student rename proof.
alter table public.students add column revision bigint not null default 1 check (revision >= 1);

create table public.applied_operations (
  op_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  operation_type text not null check (btrim(operation_type) <> ''),
  target_entity_type text not null check (btrim(target_entity_type) <> ''),
  target_entity_id uuid not null,
  request_metadata jsonb not null,
  result_revision bigint not null check (result_revision >= 1),
  result_metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  constraint applied_operation_workspace_op_unique unique (workspace_id, op_id)
);
create index applied_operations_workspace_applied_idx on public.applied_operations(workspace_id, applied_at);
alter table public.applied_operations enable row level security;
revoke all on public.applied_operations from anon;
grant select on public.applied_operations to authenticated;
create policy applied_operation_owner_select on public.applied_operations for select to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()));

create or replace function public.apply_student_rename_operation(p_op_id uuid, p_student_id uuid, p_display_name text, p_expected_revision bigint)
returns table(outcome text, revision bigint, replayed boolean)
language plpgsql security definer set search_path = pg_catalog, public, auth
as $$
declare
  caller_id uuid := auth.uid(); owned_workspace_id uuid; current_revision bigint; prior public.applied_operations;
  normalized_name text := btrim(p_display_name); request_meta jsonb;
begin
  if caller_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_op_id is null or normalized_name = '' or p_expected_revision < 1 then raise exception 'invalid operation' using errcode = '22023'; end if;
  request_meta := jsonb_build_object('display_name', normalized_name, 'expected_revision', p_expected_revision);
  select w.id into owned_workspace_id from public.workspaces w where w.owner_user_id = caller_id;
  if owned_workspace_id is null then raise exception 'workspace required' using errcode = '42501'; end if;

  select ao.* into prior from public.applied_operations ao where ao.op_id = p_op_id;
  if found then
    if prior.workspace_id <> owned_workspace_id or prior.operation_type <> 'student.rename' or prior.target_entity_id <> p_student_id or prior.request_metadata <> request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode = '42501';
    end if;
    return query select 'saved'::text, prior.result_revision, true; return;
  end if;

  select s.revision into current_revision from public.students s where s.id = p_student_id and s.workspace_id = owned_workspace_id for update;
  if current_revision is null then raise exception 'student not found in owned workspace' using errcode = '42501'; end if;

  -- Recheck after the row lock: a concurrent retry may have committed while this call waited.
  select ao.* into prior from public.applied_operations ao where ao.op_id = p_op_id;
  if found then
    if prior.workspace_id <> owned_workspace_id or prior.operation_type <> 'student.rename' or prior.target_entity_id <> p_student_id or prior.request_metadata <> request_meta then
      raise exception 'op_id scope or payload mismatch' using errcode = '42501';
    end if;
    return query select 'saved'::text, prior.result_revision, true; return;
  end if;

  if current_revision <> p_expected_revision then return query select 'conflict'::text, current_revision, false; return; end if;
  update public.students set display_name = normalized_name, revision = revision + 1, updated_at = now()
    where id = p_student_id and workspace_id = owned_workspace_id returning students.revision into current_revision;
  insert into public.applied_operations(op_id, workspace_id, operation_type, target_entity_type, target_entity_id, request_metadata, result_revision, result_metadata)
  values (p_op_id, owned_workspace_id, 'student.rename', 'student', p_student_id, request_meta, current_revision, jsonb_build_object('display_name', normalized_name));
  return query select 'saved'::text, current_revision, false;
end;
$$;
revoke all on function public.apply_student_rename_operation(uuid, uuid, text, bigint) from public, anon;
grant execute on function public.apply_student_rename_operation(uuid, uuid, text, bigint) to authenticated;

insert into public.app_schema_version (id, version, applied_at) values (1, 'r3.2-safe-work.1', now())
on conflict (id) do update set version = excluded.version, applied_at = excluded.applied_at;
