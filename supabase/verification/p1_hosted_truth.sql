-- P1 Hosted Supabase Truth verification.
-- READ-ONLY. Run only with an operator/database connection, never through the browser.
-- Intended invocation (example):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verification/p1_hosted_truth.sql
--
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
    '202609070001'
  ]::text[];
  actual_migrations text[];
  actual_schema_version text;
  unprotected_tables text[];
  anon_grants text[];
  forbidden_dml text[];
  bucket_public boolean;
  bucket_limit bigint;
  bucket_mimes text[];
  storage_insert_policy_count integer;
  storage_select_policy_count integer;
  forbidden_storage_policies text[];
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'P1_FAIL migration history table missing';
  END IF;

  SELECT coalesce(array_agg(version::text ORDER BY version::text), ARRAY[]::text[])
    INTO actual_migrations
    FROM supabase_migrations.schema_migrations;

  IF actual_migrations IS DISTINCT FROM expected_migrations THEN
    RAISE EXCEPTION 'P1_FAIL migration history mismatch. expected=%, actual=%', expected_migrations, actual_migrations;
  END IF;

  IF to_regclass('public.app_schema_version') IS NULL THEN
    RAISE EXCEPTION 'P1_FAIL public.app_schema_version missing';
  END IF;

  SELECT version INTO actual_schema_version
    FROM public.app_schema_version
   WHERE id = 1;

  IF actual_schema_version IS DISTINCT FROM 'r3.6-recovery.1' THEN
    RAISE EXCEPTION 'P1_FAIL schema version mismatch. expected=r3.6-recovery.1 actual=%', actual_schema_version;
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname)
    INTO unprotected_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r','p')
     AND NOT c.relrowsecurity;

  IF coalesce(cardinality(unprotected_tables), 0) > 0 THEN
    RAISE EXCEPTION 'P1_FAIL public tables without RLS: %', unprotected_tables;
  END IF;

  SELECT array_agg(table_name || ':' || privilege_type ORDER BY table_name, privilege_type)
    INTO anon_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee = 'anon';

  IF coalesce(cardinality(anon_grants), 0) > 0 THEN
    RAISE EXCEPTION 'P1_FAIL anonymous public-table grants present: %', anon_grants;
  END IF;

  -- These tables are intentionally read-only from the authenticated Data API.
  -- Their writes are owned by narrow SECURITY DEFINER operations / server-side invariants.
  SELECT array_agg(table_name || ':' || privilege_type ORDER BY table_name, privilege_type)
    INTO forbidden_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee = 'authenticated'
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
     AND table_name = ANY(ARRAY[
       'app_schema_version','applied_operations',
       'meetings','checkpoints','continuity_baselines','lesson_pacing_plans',
       'assessment_results','assessment_attempts',
       'audit_events','reporting_policies','reporting_cycles','report_snapshots','report_snapshot_rows',
       'artifacts','artifact_versions','artifact_objects'
     ]::text[]);

  IF coalesce(cardinality(forbidden_dml), 0) > 0 THEN
    RAISE EXCEPTION 'P1_FAIL authenticated direct DML grants on protected tables: %', forbidden_dml;
  END IF;

  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'P1_FAIL Supabase Storage catalog missing';
  END IF;

  SELECT b.public, b.file_size_limit,
         ARRAY(SELECT m FROM unnest(coalesce(b.allowed_mime_types, ARRAY[]::text[])) AS m ORDER BY m)
    INTO bucket_public, bucket_limit, bucket_mimes
    FROM storage.buckets b
   WHERE b.id = 'artifact-files';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P1_FAIL artifact-files bucket missing';
  END IF;

  IF bucket_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'P1_FAIL artifact-files must be private';
  END IF;

  IF bucket_limit IS DISTINCT FROM 20000000 THEN
    RAISE EXCEPTION 'P1_FAIL artifact-files size limit mismatch. expected=20000000 actual=%', bucket_limit;
  END IF;

  IF bucket_mimes IS DISTINCT FROM ARRAY[
      'application/octet-stream',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[] THEN
    RAISE EXCEPTION 'P1_FAIL artifact-files MIME allow-list mismatch: %', bucket_mimes;
  END IF;

  SELECT count(*) INTO storage_insert_policy_count
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'artifact_file_owner_insert'
     AND cmd = 'INSERT'
     AND 'authenticated' = ANY(roles);

  SELECT count(*) INTO storage_select_policy_count
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'artifact_file_owner_select'
     AND cmd = 'SELECT'
     AND 'authenticated' = ANY(roles);

  IF storage_insert_policy_count <> 1 OR storage_select_policy_count <> 1 THEN
    RAISE EXCEPTION 'P1_FAIL required artifact Storage policies missing/duplicated. insert=% select=%', storage_insert_policy_count, storage_select_policy_count;
  END IF;

  SELECT array_agg(policyname || ':' || cmd ORDER BY policyname, cmd)
    INTO forbidden_storage_policies
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND 'authenticated' = ANY(roles)
     AND cmd IN ('UPDATE','DELETE')
     AND policyname LIKE 'artifact_file_owner_%';

  IF coalesce(cardinality(forbidden_storage_policies), 0) > 0 THEN
    RAISE EXCEPTION 'P1_FAIL forbidden browser Storage UPDATE/DELETE policies present: %', forbidden_storage_policies;
  END IF;

  RAISE NOTICE 'P1_HOSTED_TRUTH PASS: migrations=17 schema=r3.6-recovery.1 RLS=all-public anon-grants=none artifact-files=private';
END
$$;

SELECT
  'P1_HOSTED_TRUTH' AS proof,
  (SELECT version FROM public.app_schema_version WHERE id=1) AS schema_version,
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migration_count,
  (SELECT NOT public FROM storage.buckets WHERE id='artifact-files') AS artifact_bucket_private,
  (SELECT file_size_limit FROM storage.buckets WHERE id='artifact-files') AS artifact_bucket_limit;

rollback;
