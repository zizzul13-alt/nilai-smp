-- Test-only bootstrap for a second database in the same PostgreSQL cluster.
-- anon/authenticated are cluster-global roles and already exist from the primary test DB.
create schema auth;
create table auth.users(id uuid primary key,email text);
grant usage on schema auth to anon,authenticated;
create or replace function auth.uid()
returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant execute on function auth.uid() to anon,authenticated;
insert into auth.users(id,email) values
('00000000-0000-0000-0000-00000000000a','a@example.test'),
('00000000-0000-0000-0000-00000000000b','b@example.test'),
('00000000-0000-0000-0000-00000000000c','c@example.test');
