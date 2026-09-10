-- F1 Planned Timetable. Expectation data only: a planned slot never materializes an actual Meeting.

create table public.planned_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  local_start_time time not null,
  local_end_time time not null,
  effective_from date not null,
  effective_until date,
  status text not null default 'active' check (status in ('active', 'archived')),
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_schedule_class_fk foreign key (workspace_id, class_id)
    references public.classes(workspace_id, id) on delete restrict,
  constraint planned_schedule_time_valid check (local_start_time < local_end_time),
  constraint planned_schedule_dates_valid check (effective_until is null or effective_from <= effective_until),
  constraint planned_schedule_workspace_id_unique unique (workspace_id, id)
);

create unique index planned_schedules_exact_active_unique
  on public.planned_schedules(workspace_id, class_id, weekday, local_start_time, local_end_time, effective_from, coalesce(effective_until, 'infinity'::date))
  where status = 'active';

create index planned_schedules_workspace_day_status_time_idx
  on public.planned_schedules(workspace_id, weekday, status, local_start_time, local_end_time);
create index planned_schedules_workspace_class_status_idx
  on public.planned_schedules(workspace_id, class_id, status);

alter table public.planned_schedules enable row level security;
revoke all on public.planned_schedules from anon;
grant select, insert, update, delete on public.planned_schedules to authenticated;

create policy planned_schedule_owner_all on public.planned_schedules for all to authenticated
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_user_id = auth.uid()
    )
  );

comment on table public.planned_schedules is
  'F1 local wall-clock planned teaching slots. Planned slots are expectations and MUST NOT create or imply actual meetings.';

insert into public.app_schema_version (id, version, applied_at)
values (1, 'f1-planned-timetable.1', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
