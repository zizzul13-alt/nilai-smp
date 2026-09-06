import{expect,test}from'@playwright/test';
const harness='/tests/e2e/fixtures/pacing-ui-harness.tsx';

test('pacing keeps comprehension protected and teacher override wins',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(h:string)=>(await import(h)).mountPacingHarness(),harness);
  await expect(page.getByText(/Belum ada pacing plan/)).toBeVisible();
  await page.getByRole('button',{name:'Atur pacing'}).click();
  await page.getByLabel('Normal Meetings').fill('4');
  await page.getByLabel('Available Meetings').fill('3');
  await page.getByLabel('Correction reserve').fill('1');
  await page.getByLabel(/CORE/).fill('Konsep inti');
  await page.getByLabel(/PRACTICE/).fill('Latihan terpandu\nTransfer mandiri');
  await page.getByLabel(/STRETCH/).fill('Breadth tambahan');
  await page.getByLabel(/MINIMUM EXIT CRITERIA/).fill('Jelaskan konsep tanpa contoh guru');
  await page.getByRole('button',{name:'Simpan pacing'}).click();

  await expect(page.getByText('COMPRESSED',{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/Recommendation:.*COMPRESSED/)).toBeVisible();
  await expect(page.getByText('2',{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/1 correction session aktif terdeteksi/)).toBeVisible();
  await expect(page.getByText('CORE · selalu dijaga')).toBeVisible();
  await expect(page.getByText('PRACTICE · SELECTIVE')).toBeVisible();
  await expect(page.getByText('STRETCH · DEFER_FIRST')).toBeVisible();
  await expect(page.getByText('MINIMUM EXIT CRITERIA · selalu terlihat')).toBeVisible();
  await expect(page.getByText('Jelaskan konsep tanpa contoh guru')).toBeVisible();
  await expect(page.getByText(/homework/i)).toHaveCount(0);

  await page.getByRole('button',{name:'Edit pacing'}).click();
  await page.getByLabel('Mode override').selectOption('RELAXED');
  await page.getByRole('button',{name:'Simpan pacing'}).click();
  await expect(page.getByText('RELAXED',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Teacher override',{exact:true})).toBeVisible();
  await expect(page.getByText(/Recommendation:.*COMPRESSED/)).toBeVisible();
  await expect(page.getByText('STRETCH · IN_SCOPE')).toBeVisible();
});
