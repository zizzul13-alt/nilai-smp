-- P1 Hosted Supabase Truth verification.
-- READ-ONLY. Run only with an operator/database connection, never through the browser.
-- A failure raises an exception and must block HOSTED_SCHEMA_TRUTH=PASS.

begin;
set transaction read only;
set local statement_timeout = '15s';

DO $$
DECLARE
  expected_migrations text[] := ARRAY[
    '202609030001',
    '202609040001','202609040002','202609040003','202609040004','202609040005','202609040006',
    '202609050001','202609050002','202609050003',
    '202609060001','202609060002','202609060003','202609060004','202609060005','202609060006',
    '202609070001','202609070918','202609071405'
  ]::text[];
  expected_files text[] := ARRAY[
    '202609030001_foundation_schema_version',
    '202609040001_academic_spine','202609040002_safe_work_engine','202609040003_teaching_core','202609040004_assessment_core','202609040005_rapid_correction_safe_writes','202609040006_bulk_assessment',
    '202609050001_continuity_core','202609050002_continuity_lifecycle_guard','202609050003_continuity_write_boundary',
    '202609060001_today_reentry','202609060002_pacing_final_torture','202609060003_reporting_core','202609060004_artifact_core','202609060005_artifact_integrity_hardening','202609060006_artifact_governor_repairs',
    '202609070001_recovery_portable_backup','202609070918_p1_authenticated_privilege_hardening','202609071405_p1_existing_function_acl_hardening'
  ]::text[];
  canonical_tables text[] := ARRAY[
    'app_schema_version','workspaces','academic_years','academic_periods','classes','students','enrollments','applied_operations',
    'materials','lessons','lesson_versions','meetings','checkpoints','activities','activity_meetings','scoring_profiles','assessments',
    'assessment_results','assessment_attempts','correction_sessions','continuity_baselines','lesson_pacing_plans','audit_events','reporting_policies',
    'reporting_cycles','report_snapshots','report_snapshot_rows','artifacts','artifact_versions','artifact_objects'
  ]::text[];
  canonical_functions text[] := ARRAY[
    'append_artifact_version_operation','apply_assessment_bulk_operation','apply_assessment_judgement_operation',
    'apply_meeting_checkpoint_operation','apply_student_rename_operation','archive_artifact_operation','bootstrap_personal_workspace',
    'calculate_report_snapshot_operation','confirm_artifact_object_operation','create_artifact_operation','create_reporting_policy_operation',
    'export_portable_backup','pacing_text_array_valid','portable_backup_table_names','read_today_active_correction','read_today_class_contexts',
    'record_assessment_judgement','record_continuity_baseline_operation','reject_scoring_profile_config_rewrite',
    'reopen_reporting_cycle_operation','reserve_artifact_object_operation','restore_portable_backup_operation',
    'set_teaching_meeting_status_operation','start_teaching_meeting_operation','upsert_lesson_pacing_plan_operation'
  ]::text[];
  actual_migrations text[];
  migration_count integer;
  migration_mismatch_count integer;
  actual_schema_version text;
  unexpected_table_owners text[];
  unexpected_function_owners text[];
  unprotected_tables text[];
  anonymous_table_grants text[];
  missing_global_function_acl boolean;
  default_acl_exposure text[];
  exposed_anonymous_functions text[];
  forbidden_global_privileges text[];
  forbidden_dml text[];
  bucket_public boolean;
  bucket_limit bigint;
  bucket_mimes text[];
  storage_insert_policy_count integer;
  storage_select_policy_count integer;
  storage_insert_check text;
  storage_select_qual text;
  forbidden_storage_policies text[];
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'P1_FAIL migration history table missing';
  END IF;

  SELECT count(*) INTO migration_count FROM supabase_migrations.schema_migrations;
  IF migration_count <> cardinality(expected_migrations) THEN
    RAISE EXCEPTION 'P1_FAIL migration history count mismatch. expected=% actual=%', cardinality(expected_migrations), migration_count;
  END IF;

  -- Accept the two observed legitimate provenance encodings without rewriting hosted history:
  -- CLI canonical version+suffix, or MCP execution-version+full canonical name.
  WITH actual AS (
    SELECT row_number() OVER (ORDER BY version::text)::integer AS rn,
           version::text AS version,
           coalesce(name::text,'') AS name
      FROM supabase_migrations.schema_migrations
  ), expected AS (
    SELECT i AS rn,
           expected_migrations[i] AS migration_id,
           expected_files[i] AS canonical_name,
           substring(expected_files[i] from 14) AS canonical_suffix
      FROM generate_subscripts(expected_migrations,1) AS g(i)
  )
  SELECT
    coalesce(array_agg(a.version||':'||a.name ORDER BY a.rn),ARRAY[]::text[]),
    count(*) FILTER (WHERE NOT (
      (a.version=e.migration_id AND a.name IN ('',e.canonical_suffix,e.canonical_name))
      OR (a.version ~ '^[0-9]{14}$' AND a.name=e.canonical_name)
    ))
  INTO actual_migrations,migration_mismatch_count
  FROM actual a JOIN expected e USING(rn);

  IF migration_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P1_FAIL migration history mismatch. expected ids=% expected names=% actual=%', expected_migrations, expected_files, actual_migrations;
  END IF;

  IF to_regclass('public.app_schema_version') IS NULL THEN
    RAISE EXCEPTION 'P1_FAIL public.app_schema_version missing';
  END IF;
  SELECT version INTO actual_schema_version FROM public.app_schema_version WHERE id=1;
  IF actual_schema_version IS DISTINCT FROM 'r3.6-recovery.1' THEN
    RAISE EXCEPTION 'P1_FAIL schema version mismatch. expected=r3.6-recovery.1 actual=%', actual_schema_version;
  END IF;

  SELECT array_agg(c.relname||':'||pg_get_userbyid(c.relowner) ORDER BY c.relname)
    INTO unexpected_table_owners
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p')
     AND c.relname=ANY(canonical_tables)
     AND pg_get_userbyid(c.relowner)<>'postgres';
  IF coalesce(cardinality(unexpected_table_owners),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL canonical table ownership drift: %',unexpected_table_owners;
  END IF;

  SELECT array_agg(p.oid::regprocedure::text||':'||pg_get_userbyid(p.proowner) ORDER BY p.oid::regprocedure::text)
    INTO unexpected_function_owners
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=ANY(canonical_functions)
     AND pg_get_userbyid(p.proowner)<>'postgres';
  IF coalesce(cardinality(unexpected_function_owners),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL canonical function ownership drift: %',unexpected_function_owners;
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname)
    INTO unprotected_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF coalesce(cardinality(unprotected_tables),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL public tables without RLS: %',unprotected_tables;
  END IF;

  SELECT array_agg(grantee||':'||table_name||':'||privilege_type ORDER BY grantee,table_name,privilege_type)
    INTO anonymous_table_grants
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('anon','PUBLIC');
  IF coalesce(cardinality(anonymous_table_grants),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL anonymous/PUBLIC public-table grants present: %',anonymous_table_grants;
  END IF;

  SELECT NOT EXISTS(
    SELECT 1 FROM pg_default_acl d
     WHERE pg_get_userbyid(d.defaclrole)='postgres'
       AND d.defaclnamespace=0 AND d.defaclobjtype='f'
  ) INTO missing_global_function_acl;
  IF missing_global_function_acl THEN
    RAISE EXCEPTION 'P1_FAIL postgres lacks explicit global function default ACL hardening';
  END IF;

  SELECT array_agg(
           coalesce(n.nspname,'<global>')||':'||coalesce(r.rolname,'PUBLIC')||':'||d.defaclobjtype::text||':'||x.privilege_type
           ORDER BY coalesce(n.nspname,'<global>'),coalesce(r.rolname,'PUBLIC'),d.defaclobjtype::text,x.privilege_type)
    INTO default_acl_exposure
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) x
    LEFT JOIN pg_roles r ON r.oid=x.grantee
   WHERE pg_get_userbyid(d.defaclrole)='postgres'
     AND coalesce(r.rolname,'PUBLIC') IN ('anon','authenticated','PUBLIC')
     AND ((d.defaclobjtype IN ('r','S') AND n.nspname='public')
       OR (d.defaclobjtype='f' AND x.privilege_type='EXECUTE' AND (d.defaclnamespace=0 OR n.nspname='public')));
  IF coalesce(cardinality(default_acl_exposure),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL postgres default ACL still auto-exposes future browser objects: %',default_acl_exposure;
  END IF;

  -- All canonical functions, including trigger/internal helpers, must be closed to anon.
  -- has_function_privilege('anon',...) also observes EXECUTE inherited from PUBLIC.
  SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
    INTO exposed_anonymous_functions
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=ANY(canonical_functions)
     AND has_function_privilege('anon',p.oid,'EXECUTE');
  IF coalesce(cardinality(exposed_anonymous_functions),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL anonymous/PUBLIC EXECUTE remains on canonical functions: %',exposed_anonymous_functions;
  END IF;

  SELECT array_agg(table_name||':'||privilege_type ORDER BY table_name,privilege_type)
    INTO forbidden_global_privileges
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='authenticated'
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');
  IF coalesce(cardinality(forbidden_global_privileges),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL authenticated has forbidden global table privileges: %',forbidden_global_privileges;
  END IF;

  SELECT array_agg(table_name||':'||privilege_type ORDER BY table_name,privilege_type)
    INTO forbidden_dml
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='authenticated'
     AND privilege_type IN ('INSERT','UPDATE','DELETE')
     AND (table_name=ANY(ARRAY[
       'app_schema_version','applied_operations','meetings','checkpoints','continuity_baselines','lesson_pacing_plans',
       'assessment_results','assessment_attempts','audit_events','reporting_policies','reporting_cycles','report_snapshots',
       'report_snapshot_rows','artifacts','artifact_versions','artifact_objects']::text[])
       OR (table_name='lesson_versions' AND privilege_type IN ('UPDATE','DELETE'))
       OR (table_name='correction_sessions' AND privilege_type='DELETE'));
  IF coalesce(cardinality(forbidden_dml),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL authenticated direct DML grants exceed canonical boundary: %',forbidden_dml;
  END IF;

  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'P1_FAIL Supabase Storage catalog missing';
  END IF;
  SELECT b.public,b.file_size_limit,
         ARRAY(SELECT m FROM unnest(coalesce(b.allowed_mime_types,ARRAY[]::text[])) m ORDER BY m)
    INTO bucket_public,bucket_limit,bucket_mimes FROM storage.buckets b WHERE b.id='artifact-files';
  IF NOT FOUND THEN RAISE EXCEPTION 'P1_FAIL artifact-files bucket missing'; END IF;
  IF bucket_public IS DISTINCT FROM false THEN RAISE EXCEPTION 'P1_FAIL artifact-files must be private'; END IF;
  IF bucket_limit IS DISTINCT FROM 20000000 THEN RAISE EXCEPTION 'P1_FAIL artifact-files size limit mismatch. expected=20000000 actual=%',bucket_limit; END IF;
  IF bucket_mimes IS DISTINCT FROM ARRAY['application/octet-stream','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[] THEN
    RAISE EXCEPTION 'P1_FAIL artifact-files MIME allow-list mismatch: %',bucket_mimes;
  END IF;

  SELECT count(*),max(with_check) INTO storage_insert_policy_count,storage_insert_check
    FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='artifact_file_owner_insert' AND cmd='INSERT' AND 'authenticated'::name=ANY(roles);
  SELECT count(*),max(qual) INTO storage_select_policy_count,storage_select_qual
    FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='artifact_file_owner_select' AND cmd='SELECT' AND 'authenticated'::name=ANY(roles);
  IF storage_insert_policy_count<>1 OR storage_select_policy_count<>1 THEN
    RAISE EXCEPTION 'P1_FAIL required artifact Storage policies missing/duplicated. insert=% select=%',storage_insert_policy_count,storage_select_policy_count;
  END IF;
  IF storage_insert_check IS NULL OR position('artifact-files' in storage_insert_check)=0 OR position('artifact_objects' in storage_insert_check)=0
     OR position('workspaces' in storage_insert_check)=0 OR position('storage_path' in storage_insert_check)=0
     OR position('PENDING_UPLOAD' in storage_insert_check)=0 OR position('auth.uid()' in storage_insert_check)=0 THEN
    RAISE EXCEPTION 'P1_FAIL artifact Storage INSERT policy is not ownership-derived: %',storage_insert_check;
  END IF;
  IF storage_select_qual IS NULL OR position('artifact-files' in storage_select_qual)=0 OR position('artifact_objects' in storage_select_qual)=0
     OR position('workspaces' in storage_select_qual)=0 OR position('storage_path' in storage_select_qual)=0
     OR position('READY' in storage_select_qual)=0 OR position('auth.uid()' in storage_select_qual)=0 THEN
    RAISE EXCEPTION 'P1_FAIL artifact Storage SELECT policy is not ownership-derived: %',storage_select_qual;
  END IF;
  SELECT array_agg(policyname||':'||cmd ORDER BY policyname,cmd) INTO forbidden_storage_policies
    FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND 'authenticated'::name=ANY(roles)
      AND cmd IN ('UPDATE','DELETE') AND policyname LIKE 'artifact_file_owner_%';
  IF coalesce(cardinality(forbidden_storage_policies),0)>0 THEN
    RAISE EXCEPTION 'P1_FAIL forbidden browser Storage UPDATE/DELETE policies present: %',forbidden_storage_policies;
  END IF;

  RAISE NOTICE 'P1_HOSTED_TRUTH PASS: migrations=19 schema=r3.6-recovery.1 canonical-owner=postgres RLS=all-public anonymous-grants=none canonical-functions=anon-closed postgres-default-acl=closed authenticated-privileges=bounded artifact-files=private owner-policies=exact-shape';
END
$$;

SELECT 'P1_HOSTED_TRUTH' AS proof,
  (SELECT version FROM public.app_schema_version WHERE id=1) AS schema_version,
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migration_count,
  (SELECT NOT public FROM storage.buckets WHERE id='artifact-files') AS artifact_bucket_private,
  (SELECT file_size_limit FROM storage.buckets WHERE id='artifact-files') AS artifact_bucket_limit;
rollback;