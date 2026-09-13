import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{EXPECTED_SCHEMA_VERSION}from'../../src/config/schema';

const app=readFileSync('src/app/App.tsx','utf8');
const setup=readFileSync('src/components/DailyDriverSetup.tsx','utf8');
const setupService=readFileSync('src/services/academic/dailyDriverSetup.ts','utf8');
const safeSummary=readFileSync('src/components/SafeWorkSummary.tsx','utf8');
const finalMobileCss=readFileSync('src/styles/u7-mobile-repair.css','utf8');

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
  it('keeps Today primary and exposes the existing work surfaces without architecture knowledge',()=>{
    expect(app).toContain("useState<WorkspaceMode>('today')");
    expect(app).toContain('Hari ini');
    expect(app).toContain('Data & Pengaturan');
    expect(app).toContain('Koreksi cepat');
    expect(app).toContain('Entri Massal / Impor');
    expect(app).toContain('Laporan');
    expect(app).toContain('Dokumen');
    expect(app).toContain('Pemulihan');
  });
  it('locks the final mobile cascade against hidden horizontal navigation',()=>{
    expect(finalMobileCss).toContain('grid-template-columns:repeat(5,minmax(0,1fr))');
    expect(finalMobileCss).toContain('.daily-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.15rem;overflow:visible}');
    expect(finalMobileCss).toContain('.tool-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.3rem;overflow:visible');
    expect(finalMobileCss).not.toContain('repeat(5,minmax(4.15rem,1fr))');
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
