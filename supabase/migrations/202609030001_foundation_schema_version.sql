-- R3.0 foundation only. This migration intentionally creates no academic-domain tables.
create table if not exists public.app_schema_version (
  id smallint primary key check (id = 1),
  version text not null,
  applied_at timestamptz not null default now()
);

alter table public.app_schema_version enable row level security;

revoke all on table public.app_schema_version from anon;
revoke insert, update, delete on table public.app_schema_version from authenticated;
grant select on table public.app_schema_version to authenticated;

drop policy if exists "authenticated_can_read_schema_version" on public.app_schema_version;
create policy "authenticated_can_read_schema_version"
on public.app_schema_version
for select
to authenticated
using (true);

insert into public.app_schema_version (id, version, applied_at)
values (1, 'r3.0-foundation.1', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
