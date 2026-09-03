import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from '../../src/config/schema';
const foundationMigration=readFileSync('supabase/migrations/202609030001_foundation_schema_version.sql','utf8');
const academicSpineMigration=readFileSync('supabase/migrations/202609040001_academic_spine.sql','utf8');
const safeWorkMigration=readFileSync('supabase/migrations/202609040002_safe_work_engine.sql','utf8');
describe('migration contract',()=>{
  it('keeps frontend expected schema version aligned with latest migration',()=>{expect(safeWorkMigration).toContain(`values (1, '${EXPECTED_SCHEMA_VERSION}', now())`);});
  it('keeps schema version table read-only for browser clients',()=>{expect(foundationMigration).toContain('grant select on table public.app_schema_version to authenticated');expect(foundationMigration).toContain('revoke insert, update, delete on table public.app_schema_version from authenticated');});
  it('preserves R3.1 RLS',()=>{for(const table of['workspaces','academic_years','academic_periods','classes','students','enrollments'])expect(academicSpineMigration).toContain(`alter table public.${table} enable row level security`);});
  it('R3.2 adds RLS to applied operations',()=>{expect(safeWorkMigration).toContain('alter table public.applied_operations enable row level security');});
  it('does not introduce future academic domains',()=>{const combined=academicSpineMigration+safeWorkMigration;for(const table of['materials','lessons','meetings','activities','assessments','assessment_results'])expect(combined).not.toContain(`create table public.${table}`);});
});
