-- F1 recovery integration for Planned Timetable.
-- Keep portable format v1 and app_schema_version r3.6-recovery.1 compatible with
-- older frontends/backups. New exports include planned_schedules; historic v1
-- manifests that predate F1 are normalized to an empty planned schedule set.

alter function public.restore_portable_backup_operation(uuid,jsonb)
  rename to restore_portable_backup_operation_r36_core;

revoke all on function public.restore_portable_backup_operation_r36_core(uuid,jsonb)
  from public,anon,authenticated;

create or replace function public.portable_backup_table_names()
returns text[]
language sql
immutable
set search_path=pg_catalog,public
as $$
  select array[
    'academic_years','academic_periods','classes','planned_schedules','students','enrollments',
    'materials','lessons','lesson_versions','meetings','checkpoints','activities','activity_meetings',
    'scoring_profiles','assessments','assessment_results','assessment_attempts','correction_sessions',
    'continuity_baselines','lesson_pacing_plans',
    'reporting_policies','reporting_cycles','report_snapshots','report_snapshot_rows','audit_events',
    'artifacts','artifact_versions','artifact_objects'
  ]::text[];
$$;
revoke all on function public.portable_backup_table_names() from public,anon,authenticated;

create or replace function public.restore_portable_backup_operation(p_op_id uuid,p_manifest jsonb)
returns table(outcome text,restored_rows bigint,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  normalized_manifest jsonb:=p_manifest;
begin
  -- Portable format v1 existed before F1. Missing planned_schedules therefore means
  -- "no timetable was present in that historic backup", not a malformed backup.
  if jsonb_typeof(normalized_manifest->'tables')='object'
     and not ((normalized_manifest->'tables') ? 'planned_schedules') then
    normalized_manifest:=jsonb_set(normalized_manifest,'{tables,planned_schedules}','[]'::jsonb,true);
  end if;

  return query
    select *
    from public.restore_portable_backup_operation_r36_core(p_op_id,normalized_manifest);
end;
$$;
revoke all on function public.restore_portable_backup_operation(uuid,jsonb) from public,anon;
grant execute on function public.restore_portable_backup_operation(uuid,jsonb) to authenticated;

comment on function public.restore_portable_backup_operation(uuid,jsonb) is
  'Portable v1 recovery wrapper. F1 planned_schedules are canonical when present; pre-F1 v1 manifests normalize them to an empty set.';
