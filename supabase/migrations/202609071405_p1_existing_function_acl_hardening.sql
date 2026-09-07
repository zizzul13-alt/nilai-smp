-- P1 hosted privilege hardening follow-up.
-- The real hosted verifier found one pre-hardening trigger helper that retained PostgreSQL's
-- historical PUBLIC EXECUTE grant. It is not a browser RPC and does not need direct execution
-- by anon/authenticated. Close the existing grant explicitly; migration #18 already closes
-- default EXECUTE for future postgres-owned functions.
--
-- Compatibility remains r3.6-recovery.1: this changes privilege boundaries only.

revoke execute on function public.reject_scoring_profile_config_rewrite() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from public.app_schema_version
    where id=1 and version='r3.6-recovery.1'
  ) then
    raise exception 'P1 existing-function ACL hardening requires r3.6-recovery.1' using errcode='P3710';
  end if;
end $$;
