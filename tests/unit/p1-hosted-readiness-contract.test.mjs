import{describe,expect,it}from'vitest';
import{readFileSync,readdirSync}from'node:fs';

const verifier=readFileSync('supabase/verification/p1_hosted_truth.sql','utf8');
const hardening=readFileSync('supabase/migrations/202609070918_p1_authenticated_privilege_hardening.sql','utf8');
const runbook=readFileSync('docs/HOSTED_SUPABASE_P1.md','utf8');
const readiness=readFileSync('docs/PRODUCTION_READINESS.md','utf8');
const schema=readFileSync('src/config/schema.ts','utf8');
const pkg=readFileSync('package.json','utf8');
const harness=readFileSync('tests/database/run-p1-hosted-verifier-contract-tests.sh','utf8');
const expectedMigrations=[
  '202609030001_foundation_schema_version.sql',
  '202609040001_academic_spine.sql',
  '202609040002_safe_work_engine.sql',
  '202609040003_teaching_core.sql',
  '202609040004_assessment_core.sql',
  '202609040005_rapid_correction_safe_writes.sql',
  '202609040006_bulk_assessment.sql',
  '202609050001_continuity_core.sql',
  '202609050002_continuity_lifecycle_guard.sql',
  '202609050003_continuity_write_boundary.sql',
  '202609060001_today_reentry.sql',
  '202609060002_pacing_final_torture.sql',
  '202609060003_reporting_core.sql',
  '202609060004_artifact_core.sql',
  '202609060005_artifact_integrity_hardening.sql',
  '202609060006_artifact_governor_repairs.sql',
  '202609070001_recovery_portable_backup.sql',
  '202609070918_p1_authenticated_privilege_hardening.sql',
];

describe('P1 hosted Supabase readiness contracts',()=>{
  it('locks the exact repository migration chain into hosted proof',()=>{
    const actual=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
    expect(actual).toEqual(expectedMigrations);
    for(const filename of expectedMigrations){
      expect(verifier).toContain(filename.slice(0,-4));
      expect(verifier).toContain(filename.slice(0,12));
    }
    expect(verifier).toContain('migration history mismatch');
    expect(runbook).toContain('MIGRATION_COUNT=18');
  });

  it('accepts only the two observed legitimate migration-history encodings',()=>{
    expect(verifier).toContain("a.version=e.migration_id");
    expect(verifier).toContain("a.version ~ '^[0-9]{14}$'");
    expect(verifier).toContain('a.name=e.canonical_name');
    expect(verifier).toContain('never rewrite hosted history just to satisfy proof');
    expect(harness).toContain('accepts exact CLI migration provenance');
    expect(harness).toContain('accepts exact MCP execution-version provenance');
    expect(harness).toContain('rejects tampered MCP canonical migration name');
  });

  it('closes existing and future browser privilege bleed without a schema compatibility bump',()=>{
    expect(hardening).toContain('alter default privileges for role postgres in schema public');
    expect(hardening).toContain('revoke all on tables from anon, authenticated');
    expect(hardening).toContain('revoke execute on functions from public, anon, authenticated');
    expect(hardening).toContain('revoke all on table');
    expect(hardening).toContain('public.applied_operations');
    expect(hardening).toContain('public.continuity_baselines');
    expect(hardening).toContain("version='r3.6-recovery.1'");
    expect(hardening).not.toContain("values(1,'r3.7");
    expect(verifier).toContain('default_acl_exposure');
    expect(verifier).toContain("privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')");
    expect(harness).toContain('rejects authenticated TRUNCATE on canonical table');
    expect(harness).toContain('rejects future-table authenticated default ACL exposure');
  });

  it('keeps runtime, runbook and verifier on the exact schema identity',()=>{
    expect(schema).toContain("EXPECTED_SCHEMA_VERSION = 'r3.6-recovery.1'");
    expect(verifier).toContain("'r3.6-recovery.1'");
    expect(runbook).toContain('schema compatibility: `r3.6-recovery.1`');
  });

  it('proves hosted security and Storage shape rather than dashboard appearance',()=>{
    for(const token of[
      'set transaction read only',
      'AND NOT c.relrowsecurity',
      "grantee IN ('anon','PUBLIC')",
      'default_acl_exposure',
      'forbidden_global_privileges',
      'p.prosecdef',
      "has_function_privilege('anon', p.oid, 'EXECUTE')",
      "bucket_limit IS DISTINCT FROM 20000000",
      'artifact_file_owner_insert',
      'artifact_file_owner_select',
      'storage_insert_check',
      'storage_select_qual',
      "cmd IN ('UPDATE','DELETE')",
    ])expect(verifier).toContain(token);
    expect(runbook).toContain('This is useful but **not sufficient** for P1.');
    expect(runbook).toContain('Storage bucket changes');
    expect(runbook).toContain('P1_HOSTED_TRUTH PASS');
  });

  it('keeps destructive/forging operations outside the production-candidate procedure',()=>{
    expect(runbook).toContain('Never use `supabase db reset --linked` on the production candidate.');
    expect(runbook).toContain('Never use `supabase migration repair` to pretend an unapplied migration ran.');
    expect(runbook).toContain('Never use `--include-seed` on the production candidate.');
    expect(runbook).not.toMatch(/supabase db push --include-seed\s*```/);
  });

  it('requires the P1 verifier attack harness in the PostgreSQL gate',()=>{
    expect(pkg).toContain('bash tests/database/run-p1-hosted-verifier-contract-tests.sh');
  });

  it('keeps the first-production governor linked to P1 state',()=>{
    expect(readiness).toContain('# P1 — Hosted Supabase schema truth');
    expect(readiness).toContain('HOSTED_SCHEMA_TRUTH = PASS');
  });
});
