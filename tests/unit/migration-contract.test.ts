import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from '../../src/config/schema';

const foundationMigration = readFileSync('supabase/migrations/202609030001_foundation_schema_version.sql', 'utf8');
const academicSpineMigration = readFileSync('supabase/migrations/202609040001_academic_spine.sql', 'utf8');

describe('migration contract', () => {
  it('keeps frontend expected schema version aligned with the latest source-controlled migration', () => {
    expect(academicSpineMigration).toContain(`values (1, '${EXPECTED_SCHEMA_VERSION}', now())`);
  });

  it('keeps the schema version table read-only for authenticated browser clients', () => {
    expect(foundationMigration).toContain('grant select on table public.app_schema_version to authenticated');
    expect(foundationMigration).toContain('revoke insert, update, delete on table public.app_schema_version from authenticated');
  });

  it('enables RLS on every R3.1 protected table', () => {
    for (const table of ['workspaces', 'academic_years', 'academic_periods', 'classes', 'students', 'enrollments']) {
      expect(academicSpineMigration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('does not introduce future-domain tables', () => {
    for (const table of ['materials', 'lessons', 'meetings', 'activities', 'assessments', 'assessment_results']) {
      expect(academicSpineMigration).not.toContain(`create table public.${table}`);
    }
  });
});
