import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{formatReportedScore}from'../../src/services/academic/reporting';

const migration=readFileSync('supabase/migrations/202609060003_reporting_core.sql','utf8');
const app=readFileSync('src/app/App.tsx','utf8');
const ui=readFileSync('src/components/Reporting.tsx','utf8');

describe('R3.5-01 reporting contracts',()=>{
  it('keeps reporting policy versioned and explicit rather than hiding semantics in a score',()=>{
    expect(migration).toContain('create table public.reporting_policies');
    expect(migration).toContain('policy_key uuid not null');
    expect(migration).toContain('version_no integer not null');
    expect(migration).toContain("aggregation text not null default 'SIMPLE_MEAN'");
    expect(migration).toContain("missing_policy in ('EXCLUDE','ZERO')");
    expect(migration).toContain("remedial_policy='CURRENT_RESULT'");
    expect(migration).not.toContain('BEST_OF_CURRENT_AND_REMEDIAL');
    expect(migration).toContain("rounding_mode in ('NONE','INTEGER','ONE_DECIMAL')");
  });

  it('never promotes raw Attempt evidence into a reported outcome',()=>{
    expect(migration).not.toContain('best_remedial_score');
    expect(migration).not.toContain('greatest(r.score');
    expect(migration).not.toMatch(/from public\.assessment_attempts/);
    expect(ui).toContain('Raw REMEDIAL Attempt tetap evidence dan tidak otomatis dipromosikan menjadi nilai rapor.');
  });

  it('keeps KKM separate from the arithmetic formula',()=>{
    expect(migration).toContain('kkm numeric');
    expect(migration).toContain('meets_kkm boolean');
    expect(ui).toContain('KKM (terpisah dari formula)');
    expect(ui).toContain('SIMPLE_MEAN');
  });

  it('preserves truthful Result states and blocks silent finalization with UNCHECKED work',()=>{
    expect(migration).toContain("coalesce(r.state,'UNCHECKED')");
    expect(migration).toContain("when r.state='MISSING' and policy.missing_policy='ZERO'");
    expect(migration).toContain("raise exception 'cannot finalize while UNCHECKED evidence remains' using errcode='P3506'");
    expect(ui).toContain('UNCHECKED memblok Finalize');
  });

  it('freezes one consistent canonical source before producing snapshot rows',()=>{
    expect(migration).toContain('with assessment_source as materialized');
    expect(migration).toContain('enrollment_source as materialized');
    expect(migration).toContain('cell_source as materialized');
    expect(migration).toContain('row_source as materialized');
    expect(migration).toContain("'source_consistency','ONE_STATEMENT_MVCC'");
    expect(migration).toContain('lock table public.classes, public.assessments, public.assessment_results, public.enrollments, public.students in share mode');
    expect(migration.indexOf('with assessment_source as materialized')).toBeLessThan(migration.indexOf('insert into public.report_snapshots'));
  });

  it('makes snapshots append-only while finalization/reopen are explicit and audited',()=>{
    expect(migration).toContain("kind text not null check(kind in ('PROVISIONAL','FINALIZED'))");
    expect(migration).toContain("status text not null default 'OPEN' check(status in ('OPEN','FINALIZED'))");
    expect(migration).toContain("'reporting.cycle.finalized'");
    expect(migration).toContain("'reporting.cycle.reopened'");
    expect(migration).toContain("raise exception 'reporting cycle is finalized; reopen before recalculation'");
    expect(ui).toContain('Reopen untuk koreksi faktual');
  });

  it('binds current snapshots and rows to the exact cycle/class graph',()=>{
    expect(migration).toContain('report_snapshot_workspace_id_cycle_unique unique(workspace_id,id,cycle_id)');
    expect(migration).toContain('foreign key(workspace_id,current_snapshot_id,id)');
    expect(migration).toContain('references public.report_snapshots(workspace_id,id,cycle_id)');
    expect(migration).toContain('report_snapshot_workspace_id_class_unique unique(workspace_id,id,class_id)');
    expect(migration).toContain('foreign key(workspace_id,snapshot_id,class_id)');
  });

  it('routes important writes through idempotent RPC boundaries',()=>{
    expect(migration).toContain('create or replace function public.create_reporting_policy_operation');
    expect(migration).toContain('create or replace function public.calculate_report_snapshot_operation');
    expect(migration).toContain('create or replace function public.reopen_reporting_cycle_operation');
    expect(migration).toContain('perform pg_advisory_xact_lock');
    expect(migration).toContain("operation_type<>'reporting.snapshot'");
    expect(migration).toContain('revoke insert,update,delete on public.audit_events, public.reporting_policies, public.reporting_cycles, public.report_snapshots, public.report_snapshot_rows from authenticated');
  });

  it('guards asynchronous cycle refreshes by the initiating class identity',()=>{
    expect(ui).toContain("const classIdRef=useRef('')");
    expect(ui).toContain('classIdRef.current!==targetClassId');
    expect(ui).toContain('const actionClassId=classId');
    expect(ui).toContain('if(classIdRef.current!==actionClassId)return;');
    expect(ui).toContain('await refreshCycle(actionClassId)');
  });

  it('exposes Reporting as one workspace rather than a dashboard subsystem',()=>{
    expect(app).toContain("|'reporting'");
    expect(app).toContain('>Reporting</button>');
    expect(app).toContain('<Reporting client={client} workspaceId={workspaceId} />');
  });

  it('formats zero and negative grades as real values rather than blanks',()=>{
    expect(formatReportedScore(null)).toBe('—');
    expect(formatReportedScore(0)).toBe('0');
    expect(formatReportedScore(-5)).toBe('-5');
    expect(formatReportedScore(12.345)).toBe('12.35');
  });
});
