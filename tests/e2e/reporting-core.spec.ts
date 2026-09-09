import{expect,test}from'@playwright/test';
const harness='/tests/e2e/fixtures/reporting-ui-harness.tsx';

test('reporting preserves finalized history and requires explicit reopen before recalculation',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(h:string)=>(await import(h)).mountReportingHarness(),harness);
  await expect(page.getByRole('heading',{name:'Laporkan dengan benar, lalu tutup secara eksplisit'})).toBeVisible();
  await expect(page.getByText(/SIMPLE_MEAN · Missing EXCLUDE/)).toBeVisible();
  await expect(page.getByText('FINALIZED',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Siswa Reporting')).toBeVisible();
  await expect(page.getByText('65',{exact:true})).toBeVisible();
  await page.getByLabel('Alasan membuka kembali').fill('Bukti koreksi ditemukan');
  await page.getByRole('button',{name:'Buka kembali untuk koreksi faktual'}).click();
  await expect(page.getByText(/dibuka kembali/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Pratinjau sementara'})).toBeVisible();
  await page.getByRole('button',{name:'Pratinjau sementara'}).click();
  await expect(page.getByText('PROVISIONAL',{exact:true})).toBeVisible();
  await expect(page.getByText(/snapshot append-only/)).toBeVisible();
});

test('old class snapshot completion cannot overwrite the newly selected class',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(h:string)=>(await import(h)).mountReportingClassRaceHarness(),harness);
  const classSelect=page.getByLabel('Kelas');
  await expect(classSelect).toHaveValue('REP-C');
  await expect(page.getByText('Siswa Reporting')).toBeVisible();

  await page.getByRole('button',{name:'Pratinjau sementara'}).click();
  await page.waitForFunction(()=>(window as Window&{__reportingSnapshotPending?:boolean}).__reportingSnapshotPending===true);
  await classSelect.selectOption('REP-C-2');
  await expect(classSelect).toHaveValue('REP-C-2');
  await expect(page.getByText('Siswa Class B')).toBeVisible();
  await expect(page.getByText('77',{exact:true})).toBeVisible();

  await page.evaluate(async(h:string)=>(await import(h)).releaseReportingSnapshot(),harness);
  await page.waitForFunction(()=>(window as Window&{__reportingSnapshotPending?:boolean}).__reportingSnapshotPending!==true);
  await expect(classSelect).toHaveValue('REP-C-2');
  await expect(page.getByText('Siswa Class B')).toBeVisible();
  await expect(page.getByText('77',{exact:true})).toBeVisible();
  await expect(page.getByText('Siswa Class A Updated')).toHaveCount(0);
});
