import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from '../../src/config/schema';

const migration = readFileSync('supabase/migrations/202609030001_foundation_schema_version.sql', 'utf8');

describe('migration contract', () => {
  it('keeps frontend expected schema version aligned with source-controlled migration', () => {
    expect(migration).toContain(`values (1, '${EXPECTED_SCHEMA_VERSION}', now())`);
  });

  it('keeps the foundation version table read-only for authenticated browser clients', () => {
    expect(migration).toContain('grant select on table public.app_schema_version to authenticated');
    expect(migration).toContain('revoke insert, update, delete on table public.app_schema_version from authenticated');
  });
});
