import{expect,test}from'@playwright/test';

test('serves the built SPA artifact on deep re-entry without Vite dev runtime',async({page})=>{
  const response=await page.goto('/daily-driver/re-entry?production-artifact=1');
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading',{name:'Konfigurasi belum siap'})).toBeVisible();

  const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src')??''));
  expect(scripts.some(src=>src.includes('/assets/'))).toBe(true);
  expect(scripts.every(src=>!src.includes('/@vite/client')&&!src.includes('/src/main.tsx'))).toBe(true);
});
