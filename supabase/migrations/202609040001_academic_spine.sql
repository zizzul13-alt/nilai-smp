-- R3.1 canonical academic spine. Ownership is rooted in auth.users -> workspaces.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_owner_unique unique (owner_user_id),
  constraint workspaces_workspace_owner_unique unique (id, owner_user_id)
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  identity_key text not null check (btrim(identity_key) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  sort_order integer not null check (sort_order >= 0),
  status text not null default 'active' check (status in ('planned', 'active', 'archived')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_year_dates_valid check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint academic_year_identity_unique unique (workspace_id, identity_key),
  constraint academic_year_order_unique unique (workspace_id, sort_order),
  constraint academic_year_workspace_id_unique unique (workspace_id, id)
);

create table public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  academic_year_id uuid not null,
  identity_key text not null check (btrim(identity_key) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  sort_order integer not null check (sort_order >= 0),
  status text not null default 'active' check (status in ('planned', 'active', 'archived')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_period_dates_valid check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint academic_period_year_fk foreign key (workspace_id, academic_year_id)
    references public.academic_years(workspace_id, id) on delete restrict,
  constraint academic_period_identity_unique unique (workspace_id, academic_year_id, identity_key),
  constraint academic_period_order_unique unique (workspace_id, academic_year_id, sort_order),
  constraint academic_period_workspace_id_unique unique (workspace_id, id)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  academic_period_id uuid not null,
  identity_key text not null check (btrim(identity_key) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_period_fk foreign key (workspace_id, academic_period_id)
    references public.academic_periods(workspace_id, id) on delete restrict,
  constraint class_period_identity_unique unique (workspace_id, academic_period_id, identity_key),
  constraint class_workspace_id_unique unique (workspace_id, id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  display_name text not null check (btrim(display_name) <> ''),
  nis text,
  nisn text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_workspace_id_unique unique (workspace_id, id),
  constraint student_nis_nonblank check (nis is null or btrim(nis) <> ''),
  constraint student_nisn_nonblank check (nisn is null or btrim(nisn) <> '')
);

create unique index students_workspace_nis_unique
  on public.students(workspace_id, nis) where nis is not null;
create unique index students_workspace_nisn_unique
  on public.students(workspace_id, nisn) where nisn is not null;

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_id uuid not null,
  class_id uuid not null,
  status text not null default 'active' check (status in ('active', 'withdrawn', 'completed', 'archived')),
  started_on date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_dates_valid check (started_on is null or ended_on is null or started_on <= ended_on),
  constraint enrollment_student_fk foreign key (workspace_id, student_id)
    references public.students(workspace_id, id) on delete restrict,
  constraint enrollment_class_fk foreign key (workspace_id, class_id)
    references public.classes(workspace_id, id) on delete restrict,
  constraint enrollment_student_class_unique unique (workspace_id, student_id, class_id)
);

create index academic_years_workspace_status_order_idx
  on public.academic_years(workspace_id, status, sort_order);
create index academic_periods_workspace_year_status_order_idx
  on public.academic_periods(workspace_id, academic_year_id, status, sort_order);
create index classes_workspace_period_status_idx
  on public.classes(workspace_id, academic_period_id, status);
create index students_workspace_status_name_idx
  on public.students(workspace_id, status, display_name);
create index enrollments_workspace_class_status_idx
  on public.enrollments(workspace_id, class_id, status);
create index enrollments_workspace_student_status_idx
  on public.enrollments(workspace_id, student_id, status);

alter table public.workspaces enable row level security;
alter table public.academic_years enable row level security;
alter table public.academic_periods enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;

revoke all on public.workspaces, public.academic_years, public.academic_periods, public.classes, public.students, public.enrollments from anon;
grant select, insert, update, delete on public.workspaces, public.academic_years, public.academic_periods, public.classes, public.students, public.enrollments to authenticated;

create policy workspace_owner_select on public.workspaces for select to authenticated
  using (owner_user_id = auth.uid());
create policy workspace_owner_update on public.workspaces for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy workspace_owner_delete on public.workspaces for delete to authenticated
  using (owner_user_id = auth.uid());

create policy academic_year_owner_all on public.academic_years for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()));
create policy academic_period_owner_all on public.academic_periods for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()));
create policy class_owner_all on public.classes for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()));
create policy student_owner_all on public.students for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()));
create policy enrollment_owner_all on public.enrollments for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid()));

create or replace function public.bootstrap_personal_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  caller_id uuid := auth.uid();
  result public.workspaces;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.workspaces(owner_user_id)
  values (caller_id)
  on conflict (owner_user_id) do update
    set owner_user_id = excluded.owner_user_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.bootstrap_personal_workspace() from public, anon;
grant execute on function public.bootstrap_personal_workspace() to authenticated;

-- Version advances only after the complete canonical spine, constraints, RLS, grants and bootstrap exist.
insert into public.app_schema_version (id, version, applied_at)
values (1, 'r3.1-academic-spine.1', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
