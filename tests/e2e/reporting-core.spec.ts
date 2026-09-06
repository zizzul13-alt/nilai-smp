import{expect,test}from'@playwright/test';
const harness='/tests/e2e/fixtures/reporting-ui-harness.tsx';

test('reporting preserves finalized history and requires explicit reopen before recalculation',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(h:string)=>(await import(h)).mountReportingHarness(),harness);
  await expect(page.getByRole('heading',{name:'Report truthfully, then close it'})).toBeVisible();
  await expect(page.getByText(/SIMPLE_MEAN · Missing EXCLUDE/)).toBeVisible();
  await expect(page.getByText('FINALIZED',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Siswa Reporting')).toBeVisible();
  await expect(page.getByText('65',{exact:true})).toBeVisible();
  await page.getByLabel('Alasan Reopen').fill('Bukti koreksi ditemukan');
  await page.getByRole('button',{name:'Reopen untuk koreksi faktual'}).click();
  await expect(page.getByText(/dibuka kembali/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Preview provisional'})).toBeVisible();
  await page.getByRole('button',{name:'Preview provisional'}).click();
  await expect(page.getByText('PROVISIONAL',{exact:true})).toBeVisible();
  await expect(page.getByText(/snapshot append-only/)).toBeVisible();
});
