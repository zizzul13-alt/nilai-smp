import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from '../../src/config/schema';
const foundation=readFileSync('supabase/migrations/202609030001_foundation_schema_version.sql','utf8');
const spine=readFileSync('supabase/migrations/202609040001_academic_spine.sql','utf8');
const safe=readFileSync('supabase/migrations/202609040002_safe_work_engine.sql','utf8');
const teaching=readFileSync('supabase/migrations/202609040003_teaching_core.sql','utf8');
const assessment=readFileSync('supabase/migrations/202609040004_assessment_core.sql','utf8');
describe('migration contract',()=>{
  it('aligns frontend with schema head',()=>expect(assessment).toContain(`'${EXPECTED_SCHEMA_VERSION}'`));
  it('keeps schema version read-only',()=>{expect(foundation).toContain('grant select on table public.app_schema_version to authenticated');expect(foundation).toContain('revoke insert, update, delete on table public.app_schema_version from authenticated')});
  it('preserves R3.1 spine RLS',()=>{for(const t of['workspaces','academic_years','academic_periods','classes','students','enrollments'])expect(spine).toContain(`alter table public.${t} enable row level security`)});
  it('preserves R3.2 applied-operation protection',()=>expect(safe).toContain('alter table public.applied_operations enable row level security'));
  it('protects every Teaching Core table with RLS',()=>{for(const t of['materials','lessons','lesson_versions','meetings','checkpoints','activities','activity_meetings'])expect(teaching).toContain(`alter table public.${t} enable row level security`)});
  it('protects every Assessment Core table with RLS',()=>{for(const t of['scoring_profiles','assessments','assessment_results','assessment_attempts'])expect(assessment).toContain(`alter table public.${t} enable row level security`)});
  it('keeps Result and Attempt browser writes behind the narrow RPC',()=>{expect(assessment).toContain('grant select on public.assessment_results, public.assessment_attempts to authenticated');expect(assessment).toContain('revoke insert,update,delete on public.assessment_results, public.assessment_attempts from authenticated');expect(assessment).toContain('function public.record_assessment_judgement')});
  it('keeps explicit result states and attempt kinds',()=>{for(const state of['UNCHECKED','GRADED','MISSING','EXCUSED'])expect(assessment).toContain(`'${state}'`);for(const kind of['ORIGINAL','MAKEUP','REMEDIAL','CORRECTION'])expect(assessment).toContain(`'${kind}'`)});
});
