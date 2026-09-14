import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{EXPECTED_SCHEMA_VERSION}from'../../src/config/schema';

const app=readFileSync('src/app/App.tsx','utf8');
const setup=readFileSync('src/components/DailyDriverSetup.tsx','utf8');
const setupService=readFileSync('src/services/academic/dailyDriverSetup.ts','utf8');
const safeSummary=readFileSync('src/components/SafeWorkSummary.tsx','utf8');
const finalMobileCss=readFileSync('src/styles/u7-mobile-repair.css','utf8');
const workflowNavigation=readFileSync('src/styles/workflow-navigation.css','utf8');

describe('R3.7-01 Daily Driver integration',()=>{
  it('keeps R3.7 integration schema-neutral',()=>{
    expect(EXPECTED_SCHEMA_VERSION).toBe('r3.6-recovery.1');
    expect(setupService).not.toContain("from('meetings')");
    expect(setupService).not.toContain("from('attempts')");
    expect(setupService).not.toContain('attempt_kind');
    expect(setupService.toLowerCase()).not.toContain('schedule');
  });
  it('provides a complete fresh-account academic setup path with Indonesian teacher copy',()=>{
    for(const table of ['academic_years','academic_periods','classes','students','enrollments','materials','lessons'])expect(setupService).toContain(`'${table}'`);
    expect(setup).toContain('Tahun ajaran');
    expect(setup).toContain('Periode');
    expect(setup).toContain('Kelas');
    expect(setup).toContain('Siswa');
    expect(setup).toContain('Keanggotaan kelas');
    expect(setup).toContain('Materi & pelajaran');
    expect(setup).toContain('Jadwal tidak dibuat otomatis dan pengaturan ini tidak pernah membuat pertemuan');
    expect(setup).toContain('Kembali ke Hari ini');
  });
  it('organizes the product around teacher workflows instead of a generic tools drawer',()=>{
    expect(app).toContain("useState<WorkspaceMode>('today')");
    expect(app).toContain('>Hari ini</button>');
    expect(app).toContain('>Siapkan</button>');
    expect(app).toContain('>Mengajar</button>');
    expect(app).toContain('>Nilai</button>');
    expect(app).toContain('>Laporan</button>');
    expect(app).toContain('aria-label="Siapkan"');
    expect(app).toContain('aria-label="Nilai"');
    expect(app).toContain('Koreksi Cepat');
    expect(app).toContain('Entri Massal');
    expect(app).toContain('Data & Pengaturan');
    expect(app).toContain('Pemulihan');
    expect(app).not.toContain('Data, dokumen & alat lain');
    expect(app).not.toContain('className="more-tools"');
  });
  it('keeps five primary destinations visible and moves contextual work out of the primary bar',()=>{
    expect(finalMobileCss).not.toContain('repeat(5,minmax(4.15rem,1fr))');
    expect(workflowNavigation).toContain('grid-template-columns:repeat(5,minmax(0,1fr))');
    expect(workflowNavigation).toContain('.daily-nav{position:fixed');
    expect(workflowNavigation).toContain('.context-nav');
    expect(workflowNavigation).toContain('.admin-popover');
    expect(workflowNavigation).not.toContain('.more-tools');
  });
  it('keeps Safe Work semantics while presenting a compact teacher-facing status',()=>{
    expect(app).toContain('<SafeWorkSummary');
    expect(safeSummary).toContain('PENDING_SAFE');
    expect(safeSummary).toContain('FAILED');
    expect(safeSummary).toContain('CONFLICT');
    expect(safeSummary).toContain('Antrean lokal kosong');
    expect(safeSummary).toContain('tertunda lokal');
    expect(safeSummary).not.toContain('Saved ·');
  });
});
