import{expect,test}from'@playwright/test';

test('serves the built SPA artifact on deep re-entry without Vite dev runtime',async({page})=>{
  const response=await page.goto('/daily-driver/re-entry?production-artifact=1');
  expect(response).not.toBeNull();
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading',{name:'Konfigurasi belum siap'})).toBeVisible();
  expect(await page.locator('script[src*="/assets/"]').count()).toBeGreaterThan(0);
  expect(await page.locator('script[src*="/@vite/client"]').count()).toBe(0);
  expect(await page.locator('script[src*="/src/main.tsx"]').count()).toBe(0);
});

test('final mobile CSS cascade keeps teacher navigation discoverable and primary action above fold',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='mobile-production','mobile acceptance lock');
  await page.goto('/');
  await page.evaluate(()=>{
    document.body.innerHTML=`<main class="teacher-shell"><div class="app-chrome"><header class="teacher-header"><div class="teacher-identity"><strong>Nilai SMP</strong><span>guru@example.test</span></div><span class="safe-summary safe-summary--saved">Antrean lokal kosong</span><button type="button" class="secondary compact-action">Keluar</button></header><nav class="daily-nav" aria-label="Pekerjaan utama"><button>Hari ini</button><button class="secondary">Mengajar</button><button class="secondary">Koreksi cepat</button><button class="secondary">Penilaian</button><button class="secondary">Laporan</button></nav><details class="more-tools" open><summary>Data, dokumen & alat lain</summary><div class="tool-nav"><button class="secondary">Brief Guru</button><button class="secondary">Data & Pengaturan</button><button class="secondary">Jadwal Mengajar</button><button class="secondary">Entri Massal / Impor</button><button class="secondary">Dokumen</button><button class="secondary">Pemulihan</button></div></details></div><div class="workspace-scroll"><section class="today-shell"><header><p class="eyebrow">Hari ini · ringkasan</p><h1>Apa yang penting sekarang?</h1></header><section class="today-section today-now"><h2>SEKARANG</h2><strong>VIII A</strong><button type="button" class="today-primary">MULAI KELAS</button></section></section></div></main>`;
  });
  const metrics=await page.evaluate(()=>{
    const nav=document.querySelector('.daily-nav');
    const tools=document.querySelector('.tool-nav');
    const chrome=document.querySelector('.app-chrome');
    const primary=document.querySelector('.today-primary');
    if(!nav||!tools||!chrome||!primary)throw new Error('acceptance fixture incomplete');
    return{navClient:nav.clientWidth,navScroll:nav.scrollWidth,toolsClient:tools.clientWidth,toolsScroll:tools.scrollWidth,chromeBottom:chrome.getBoundingClientRect().bottom,primaryBottom:primary.getBoundingClientRect().bottom,viewport:window.innerHeight};
  });
  expect(metrics.navScroll).toBeLessThanOrEqual(metrics.navClient+1);
  expect(metrics.toolsScroll).toBeLessThanOrEqual(metrics.toolsClient+1);
  expect(metrics.chromeBottom).toBeLessThan(metrics.viewport*.55);
  expect(metrics.primaryBottom).toBeLessThan(metrics.viewport);
});
