import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('mobile daily-driver production usability contract', () => {
  const app = fs.readFileSync(new URL('../../src/app/App.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../src/styles/daily-driver.css', import.meta.url), 'utf8');

  it('keeps every primary daily-driver destination visible with Indonesian labels', () => {
    for (const label of ['Hari ini','Mengajar','Koreksi cepat','Penilaian','Laporan']) expect(app).toContain(`>${label}</button>`);
    for (const stale of ['>Today</button>','>Teaching</button>','>Rapid Correction</button>','>Assessment</button>','>Reporting</button>']) expect(app).not.toContain(stale);
  });

  it('does not require horizontal scrolling for the five primary mobile destinations', () => {
    expect(css).toContain('@media(max-width:719px)');
    expect(css).toContain('grid-template-columns:repeat(5,minmax(0,1fr))');
    expect(css).toContain('overflow:visible');
    expect(css).toContain('.daily-nav button{min-width:0');
  });

  it('keeps secondary tools available without expanding primary navigation scope', () => {
    for (const label of ['Data & pengaturan','Entri massal / impor','Dokumen','Pemulihan']) expect(app).toContain(`>${label}</button>`);
    expect(app).toContain('<summary>Data, dokumen & alat lain</summary>');
  });
});
