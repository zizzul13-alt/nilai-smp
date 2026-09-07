-- P1 hosted privilege hardening discovered by the real Supabase verifier.
-- Supabase project defaults can auto-grant broad Data API privileges to newly-created
-- public objects. R3 migrations explicitly closed anon access, but several authenticated
-- tables retained default TRUNCATE/REFERENCES/TRIGGER privileges and two read-only tables
-- retained default DML. Normalize the existing canonical surface and make future public
-- objects deny-by-default unless a migration grants the exact browser capability.
--
-- Compatibility stays r3.6-recovery.1: this changes privilege boundaries only.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Some hosted Supabase tooling may create objects as supabase_admin. Keep the same
-- future-object law when that managed role exists; plain PostgreSQL CI does not define it.
do $$
begin
  if exists(select 1 from pg_roles where rolname='supabase_admin') then
    execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated';
  end if;
end $$;

-- Start from no browser table capability, then rebuild the exact intended authenticated
-- surface. This also removes inherited Supabase default TRUNCATE/REFERENCES/TRIGGER grants.
revoke all on table
  public.app_schema_version,
  public.workspaces,
  public.academic_years,
  public.academic_periods,
  public.classes,
  public.students,
  public.enrollments,
  public.applied_operations,
  public.materials,
  public.lessons,
  public.lesson_versions,
  public.meetings,
  public.checkpoints,
  public.activities,
  public.activity_meetings,
  public.scoring_profiles,
  public.assessments,
  public.assessment_results,
  public.assessment_attempts,
  public.correction_sessions,
  public.continuity_baselines,
  public.lesson_pacing_plans,
  public.audit_events,
  public.reporting_policies,
  public.reporting_cycles,
  public.report_snapshots,
  public.report_snapshot_rows,
  public.artifacts,
  public.artifact_versions,
  public.artifact_objects
from anon, authenticated;

-- Schema identity is observable but never browser-mutable.
grant select on table public.app_schema_version to authenticated;

-- Direct CRUD tables protected by ownership RLS.
grant select,insert,update,delete on table
  public.workspaces,
  public.academic_years,
  public.academic_periods,
  public.classes,
  public.students,
  public.enrollments,
  public.materials,
  public.lessons,
  public.activities,
  public.activity_meetings,
  public.scoring_profiles,
  public.assessments
  to authenticated;

-- Append-only canonical lesson history.
grant select,insert on table public.lesson_versions to authenticated;

-- Workflow progress is browser-created/updated but not deletable.
grant select,insert,update on table public.correction_sessions to authenticated;

-- Canonical mutation boundaries owned by narrow RPCs; browser tables are read-only.
grant select on table
  public.applied_operations,
  public.meetings,
  public.checkpoints,
  public.assessment_results,
  public.assessment_attempts,
  public.continuity_baselines,
  public.lesson_pacing_plans,
  public.audit_events,
  public.reporting_policies,
  public.reporting_cycles,
  public.report_snapshots,
  public.report_snapshot_rows,
  public.artifacts,
  public.artifact_versions,
  public.artifact_objects
  to authenticated;

-- Preserve the declared compatibility generation. This migration is security hardening,
-- not a data-model/API generation change.
do $$
begin
  if not exists (
    select 1 from public.app_schema_version
    where id=1 and version='r3.6-recovery.1'
  ) then
    raise exception 'P1 privilege hardening requires r3.6-recovery.1' using errcode='P3709';
  end if;
end $$;
