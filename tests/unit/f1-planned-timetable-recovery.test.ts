import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';

const sql=readFileSync('supabase/migrations/202609110002_f1_planned_timetable_recovery.sql','utf8');
const recovery=readFileSync('tests/database/run-recovery-contract-tests.sh','utf8');

describe('F1 Planned Timetable portable recovery',()=>{
  it('adds planned schedules to portable export/restore without changing compatibility identity',()=>{
    expect(sql).toContain("'classes','planned_schedules','students'");
    expect(sql).not.toMatch(/(?:insert\s+into|update)\s+public\.app_schema_version/i);
    expect(sql).not.toContain("format_version',2");
  });

  it('keeps pre-F1 portable-v1 manifests restorable as an empty timetable',()=>{
    expect(sql).toContain("not ((normalized_manifest->'tables') ? 'planned_schedules')");
    expect(sql).toContain("jsonb_set(normalized_manifest,'{tables,planned_schedules}','[]'::jsonb,true)");
  });

  it('does not expose the renamed security-definer recovery core to authenticated callers',()=>{
    expect(sql).toContain('rename to restore_portable_backup_operation_r36_core');
    expect(sql).toContain('revoke all on function public.restore_portable_backup_operation_r36_core(uuid,jsonb)');
    expect(sql).toContain('grant execute on function public.restore_portable_backup_operation(uuid,jsonb) to authenticated');
  });

  it('behaviorally compares timetable cardinality in the recovery drill',()=>{
    expect(recovery).toContain('planned_schedules');
    expect(recovery).toContain("assert 'planned_schedules' in x['tables']");
    expect(recovery).toContain('restore preserves canonical row cardinality across full graph including planned timetable');
  });
});
