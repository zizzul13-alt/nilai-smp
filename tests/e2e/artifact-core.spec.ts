import{expect,test}from'@playwright/test';
const harness='/tests/e2e/fixtures/artifact-ui-harness.tsx';

test('artifact create, stale provenance, append version and archive preserve history',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(h:string)=>(await import(h)).mountArtifactHarness(),harness);
  await expect(page.getByRole('heading',{name:'Artifact history, bukan file sekali pakai'})).toBeVisible();
  await page.getByRole('button',{name:'Artifact baru'}).click();
  await page.getByLabel('Judul').fill('RPP Gerak');
  await page.getByLabel('Exact source').selectOption('LESSON:ART-L:ART-LV1');
  await expect(page.getByLabel('Canonical text')).toHaveValue('Lesson lama v1');
  await page.getByRole('button',{name:'Simpan artifact'}).click();
  await expect(page.getByText(/RPP · RPP Gerak/).first()).toBeVisible();
  await expect(page.getByText(/v1 · STALE SOURCE/)).toBeVisible();
  await expect(page.getByText(/History: 1 version/)).toBeVisible();
  await page.getByRole('button',{name:'Buat versi baru'}).click();
  await page.getByLabel('Exact source').selectOption('LESSON:ART-L:ART-LV2');
  await page.getByLabel('Canonical text').fill('RPP revised from exact Lesson v2');
  await page.getByRole('button',{name:'Simpan version baru'}).click();
  await expect(page.getByText(/v2$/)).toBeVisible();
  await expect(page.getByText(/History: 2 version/)).toBeVisible();
  await expect(page.getByText('STALE SOURCE')).toHaveCount(0);
  page.on('dialog',dialog=>void dialog.accept());
  await page.getByRole('button',{name:'Archive'}).click();
  await expect(page.getByText(/di-archive/)).toBeVisible();
  await expect(page.getByText(/RPP · RPP Gerak/)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Upload private object'})).toHaveCount(0);
  await page.getByLabel('Tampilkan archived').check();
  await expect(page.getByText(/RPP · RPP Gerak/).first()).toBeVisible();
  await expect(page.getByText('Artifact archived bersifat read-only. Object READY lama tetap dapat dibuka; object baru tidak dapat ditambahkan.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Upload private object'})).toHaveCount(0);
});

test('lost ACK retries reuse create and append operation identity without duplicate history',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(h:string)=>(await import(h)).mountArtifactLostAckHarness(),harness);
  await page.getByRole('button',{name:'Artifact baru'}).click();
  await page.getByLabel('Judul').fill('RPP Retry');
  await page.getByLabel('Canonical text').fill('v1 exact content');
  await page.getByRole('button',{name:'Simpan artifact'}).click();
  await expect(page.getByRole('alert')).toContainText('simulated lost ACK after create commit');
  await page.getByRole('button',{name:'Simpan artifact'}).click();
  await expect(page.getByText(/RPP · RPP Retry/).first()).toBeVisible();
  expect(await page.evaluate(async(h:string)=>(await import(h)).artifactHarnessCounts(),harness)).toEqual({artifacts:1,versions:1,operations:1});

  await page.getByRole('button',{name:'Buat versi baru'}).click();
  await page.getByLabel('Canonical text').fill('v2 after retry');
  await page.getByRole('button',{name:'Simpan version baru'}).click();
  await expect(page.getByRole('alert')).toContainText('simulated lost ACK after append commit');
  await page.getByRole('button',{name:'Simpan version baru'}).click();
  await expect(page.getByText(/History: 2 version/)).toBeVisible();
  expect(await page.evaluate(async(h:string)=>(await import(h)).artifactHarnessCounts(),harness)).toEqual({artifacts:1,versions:2,operations:2});
});
