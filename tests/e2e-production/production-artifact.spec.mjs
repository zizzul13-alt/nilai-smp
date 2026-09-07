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
