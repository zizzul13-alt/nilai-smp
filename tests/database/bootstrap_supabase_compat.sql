-- Minimal Supabase-compatible auth surface for disposable PostgreSQL contract tests.
-- Production uses Supabase's real auth schema/roles; this file is test-only.
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);

grant usage on schema auth to anon, authenticated;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

grant execute on function auth.uid() to anon, authenticated;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test');
