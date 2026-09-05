-- R3.4-01 repair: Meeting/Checkpoint canonical writes are RPC-only.
-- RLS remains enabled from Teaching Core; privilege narrowing complements rather than replaces RLS.

revoke insert, update, delete on table public.meetings from authenticated;
revoke insert, update, delete on table public.checkpoints from authenticated;

grant select on table public.meetings to authenticated;
grant select on table public.checkpoints to authenticated;

-- Keep anonymous access closed explicitly at the repaired schema head.
revoke all on table public.meetings from anon;
revoke all on table public.checkpoints from anon;

-- This is hardening of the same declared R3.4 package, not a new compatibility generation.
do $$
begin
  if not exists (
    select 1 from public.app_schema_version
    where id=1 and version='r3.4-continuity-core.1'
  ) then
    raise exception 'continuity write-boundary repair requires r3.4-continuity-core.1' using errcode='P3509';
  end if;
end $$;
