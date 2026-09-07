import{describe,expect,it}from'vitest';
import{readFileSync,readdirSync}from'node:fs';

const verifier=readFileSync('supabase/verification/p1_hosted_truth.sql','utf8');
const runbook=readFileSync('docs/HOSTED_SUPABASE_P1.md','utf8');
const readiness=readFileSync('docs/PRODUCTION_READINESS.md','utf8');
const schema=readFileSync('src/config/schema.ts','utf8');
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
];

describe('P1 hosted Supabase readiness contracts',()=>{
  it('locks the exact repository migration chain into hosted proof',()=>{
    const actual=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
    expect(actual).toEqual(expectedMigrations);
    for(const filename of expectedMigrations)expect(verifier).toContain(filename.slice(0,12));
    expect(verifier).toContain('migration history mismatch');
    expect(runbook).toContain('MIGRATION_COUNT=17');
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
      "grantee = 'anon'",
      "bucket_limit IS DISTINCT FROM 20000000",
      'artifact_file_owner_insert',
      'artifact_file_owner_select',
      "cmd IN ('UPDATE','DELETE')",
    ])expect(verifier).toContain(token);
    expect(runbook).toContain('db diff` itself is not sufficient');
    expect(runbook).toContain('P1_HOSTED_TRUTH PASS');
  });

  it('keeps destructive/forging operations outside the production-candidate procedure',()=>{
    expect(runbook).toContain('Never use `supabase db reset --linked` on the production candidate.');
    expect(runbook).toContain('Never use `supabase migration repair` to pretend an unapplied migration ran.');
    expect(runbook).toContain('Never use `--include-seed` on the production candidate.');
    expect(runbook).not.toMatch(/supabase db push --include-seed\s*```/);
  });

  it('keeps the first-production governor linked to this P1 evidence package',()=>{
    expect(readiness).toContain('# P1 — Hosted Supabase schema truth');
    expect(readiness).toContain('HOSTED_SCHEMA_TRUTH = PASS');
  });
});
