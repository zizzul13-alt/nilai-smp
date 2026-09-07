import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{EXPECTED_SCHEMA_VERSION}from'../../src/config/schema';

const app=readFileSync('src/app/App.tsx','utf8');
const setup=readFileSync('src/components/DailyDriverSetup.tsx','utf8');
const setupService=readFileSync('src/services/academic/dailyDriverSetup.ts','utf8');
const safeSummary=readFileSync('src/components/SafeWorkSummary.tsx','utf8');

describe('R3.7-01 Daily Driver integration',()=>{
  it('keeps R3.7 integration schema-neutral',()=>{
    expect(EXPECTED_SCHEMA_VERSION).toBe('r3.6-recovery.1');
    expect(setupService).not.toContain("from('meetings')");
    expect(setupService).not.toContain("from('attempts')");
    expect(setupService).not.toContain('attempt_kind');
    expect(setupService.toLowerCase()).not.toContain('schedule');
  });
  it('provides a complete fresh-account academic setup path',()=>{
    for(const table of ['academic_years','academic_periods','classes','students','enrollments','materials','lessons'])expect(setupService).toContain(`'${table}'`);
    expect(setup).toContain('Tahun ajaran');
    expect(setup).toContain('Periode');
    expect(setup).toContain('Kelas');
    expect(setup).toContain('Siswa');
    expect(setup).toContain('Enrollment');
    expect(setup).toContain('Materi & Lesson');
    expect(setup).toContain('Setup tidak pernah menciptakan Meeting');
  });
  it('keeps Today primary and exposes the existing work surfaces without architecture knowledge',()=>{
    expect(app).toContain("useState<WorkspaceMode>('today')");
    expect(app).toContain('Data & Setup');
    expect(app).toContain('Rapid Correction');
    expect(app).toContain('Bulk Entry / Import');
    expect(app).toContain('Reporting');
    expect(app).toContain('Artifacts');
    expect(app).toContain('Recovery');
  });
  it('makes Safe Work visible outside individual correction/teaching surfaces',()=>{
    expect(app).toContain('<SafeWorkSummary');
    expect(safeSummary).toContain('PENDING_SAFE');
    expect(safeSummary).toContain('FAILED');
    expect(safeSummary).toContain('CONFLICT');
    expect(safeSummary).toContain('Saved · tidak ada kerja lokal tertunda');
  });
});
