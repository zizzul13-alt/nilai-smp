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

test('final mobile CSS cascade keeps workflow navigation visible without hiding the primary action',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='mobile-production','mobile acceptance lock');
  await page.goto('/');
  await page.evaluate(()=>{
    document.body.innerHTML=`<main class="teacher-shell"><div class="app-chrome"><header class="teacher-header"><div class="teacher-identity"><strong>Nilai SMP</strong><span>guru@example.test</span></div><div class="teacher-actions"><span class="safe-summary safe-summary--saved">Antrean lokal kosong</span><div class="admin-menu"><button type="button" class="secondary compact-action admin-trigger">⚙︎</button></div><button type="button" class="secondary compact-action">Keluar</button></div></header><nav class="daily-nav" aria-label="Pekerjaan utama"><button class="nav-item nav-item--active">Hari ini</button><button class="nav-item">Siapkan</button><button class="nav-item">Mengajar</button><button class="nav-item">Nilai</button><button class="nav-item">Laporan</button></nav><nav class="context-nav" aria-label="Hari ini"><button class="context-tab context-tab--active">Ringkasan</button><button class="context-tab">Brief Guru</button></nav></div><div class="workspace-scroll"><section class="today-shell"><header><p class="eyebrow">Hari ini · ringkasan</p><h1>Apa yang penting sekarang?</h1></header><section class="today-section today-now"><h2>SEKARANG</h2><strong>VIII A</strong><button type="button" class="today-primary">MULAI KELAS</button></section></section></div></main>`;
  });
  const metrics=await page.evaluate(()=>{
    const nav=document.querySelector('.daily-nav');
    const context=document.querySelector('.context-nav');
    const chrome=document.querySelector('.app-chrome');
    const primary=document.querySelector('.today-primary');
    if(!nav||!context||!chrome||!primary)throw new Error('acceptance fixture incomplete');
    const navRect=nav.getBoundingClientRect();
    return{navClient:nav.clientWidth,navScroll:nav.scrollWidth,contextClient:context.clientWidth,contextScroll:context.scrollWidth,chromeBottom:chrome.getBoundingClientRect().bottom,primaryBottom:primary.getBoundingClientRect().bottom,navTop:navRect.top,navBottom:navRect.bottom,viewport:window.innerHeight};
  });
  expect(metrics.navScroll).toBeLessThanOrEqual(metrics.navClient+1);
  expect(metrics.contextScroll).toBeLessThanOrEqual(metrics.contextClient+1);
  expect(metrics.chromeBottom).toBeLessThan(metrics.viewport*.5);
  expect(metrics.navBottom).toBeLessThanOrEqual(metrics.viewport+1);
  expect(metrics.navTop).toBeGreaterThan(metrics.viewport*.7);
  expect(metrics.primaryBottom).toBeLessThan(metrics.navTop);
});
