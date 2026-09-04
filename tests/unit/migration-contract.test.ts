import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from '../../src/config/schema';
const foundation=readFileSync('supabase/migrations/202609030001_foundation_schema_version.sql','utf8');
const spine=readFileSync('supabase/migrations/202609040001_academic_spine.sql','utf8');
const safe=readFileSync('supabase/migrations/202609040002_safe_work_engine.sql','utf8');
const teaching=readFileSync('supabase/migrations/202609040003_teaching_core.sql','utf8');
describe('migration contract',()=>{
  it('aligns frontend with schema head',()=>expect(teaching).toContain(`'${EXPECTED_SCHEMA_VERSION}'`));
  it('keeps schema version read-only',()=>{expect(foundation).toContain('grant select on table public.app_schema_version to authenticated');expect(foundation).toContain('revoke insert, update, delete on table public.app_schema_version from authenticated')});
  it('preserves R3.1 spine RLS',()=>{for(const t of['workspaces','academic_years','academic_periods','classes','students','enrollments'])expect(spine).toContain(`alter table public.${t} enable row level security`)});
  it('preserves R3.2 applied-operation protection',()=>expect(safe).toContain('alter table public.applied_operations enable row level security'));
  it('protects every Teaching Core table with RLS',()=>{for(const t of['materials','lessons','lesson_versions','meetings','checkpoints','activities','activity_meetings'])expect(teaching).toContain(`alter table public.${t} enable row level security`)});
  it('keeps Assessment and future grading domains absent',()=>{for(const t of['assessments','assessment_results','attempts','scoring_profiles'])expect(spine+safe+teaching).not.toContain(`create table public.${t}`)});
});
