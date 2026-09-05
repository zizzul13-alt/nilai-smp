import{expect,test}from'@playwright/test';
const harness='/tests/e2e/fixtures/today-ui-harness.tsx';
async function mount(page:any,name:string,options:Record<string,unknown>={}){await page.goto('/');await page.evaluate(async({h,name,options})=>{const mod=await import(h);await mod.mountTodayHarness(name,options);},{h:harness,name,options});}
async function snapshot(page:any){return page.evaluate(async h=>(await import(h)).todayHarnessSnapshot(),harness);}

test('Today dispatches active Meeting directly to the correct Teaching class',async({page})=>{
  await mount(page,'active');
  await expect(page.getByRole('heading',{name:'Apa yang penting sekarang?'})).toBeVisible();
  await expect(page.getByText('VIII A · Meeting aktif')).toBeVisible();
  await expect(page.getByText('Halaman 37')).toBeVisible();
  await expect(page.getByText('Nomor 3')).toBeVisible();
  const primary=page.getByRole('button',{name:'CONTINUE CLASS'});await expect(primary).toBeVisible();await primary.click();
  expect((await snapshot(page)).nav).toEqual([{surface:'continuity',id:'C1'}]);
});

test('Today resumes active correction at the exact Assessment without inferring evidence',async({page})=>{
  await mount(page,'correction');
  await expect(page.getByText('Kuis Gerak')).toBeVisible();
  const resume=page.getByRole('button',{name:'RESUME CORRECTION'});await expect(resume).toBeVisible();await resume.click();
  expect((await snapshot(page)).nav).toEqual([{surface:'rapid',id:'A1'}]);
});

test('stale context is historical and Start From Today appends a forward baseline',async({page})=>{
  await mount(page,'stale');
  await expect(page.getByText(/Konteks lama — cek kembali/)).toBeVisible();
  await expect(page.getByText('Bab lama',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'START FROM TODAY'}).first().click();
  await expect(page.getByRole('heading',{name:'START FROM TODAY'})).toBeVisible();
  await page.getByLabel('LAST / STOPPED AT').fill('Bab 7 kondisi nyata');
  await page.getByLabel('NEXT STEP').fill('Latihan baru');
  await page.getByRole('button',{name:'Simpan baseline'}).click();
  await expect(page.getByText(/Baseline baru disimpan/)).toBeVisible();
  await expect(page.getByText('Bab 7 kondisi nyata',{exact:true}).first()).toBeVisible();
  const snap=await snapshot(page);
  expect(snap.baselineWrites).toEqual([{kind:'START_FROM_TODAY',classId:'C1',stoppedAt:'Bab 7 kondisi nyata',nextStep:'Latihan baru'}]);
  expect(snap.currentCheckpoint).toEqual(snap.originalCheckpoint);
  expect(snap.effective).toEqual({source:'baseline',stoppedAt:'Bab 7 kondisi nyata',nextStep:'Latihan baru'});
});

test('Today stays useful without active class work or schedule data',async({page})=>{
  await mount(page,'empty');
  await expect(page.getByText(/Tidak ada work yang perlu perhatian/)).toBeVisible();
  await expect(page.getByText(/Tidak ada jadwal yang perlu dikonfigurasi/)).toBeVisible();
  await expect(page.getByText(/tidak ada "next class" yang difabrikasi/i)).toBeVisible();
  await expect(page.getByText(/scheduled/i)).toHaveCount(0);
});

test('Before Leaving truthfully surfaces Pending Safe and disappears when clean',async({page})=>{
  await mount(page,'pending',{pending:true});
  await expect(page.getByRole('heading',{name:'BEFORE LEAVING'})).toBeVisible();
  await expect(page.getByText(/1 Pending Safe/)).toBeVisible();
  await expect(page.getByText(/Saved/)).toHaveCount(0);
  await page.evaluate(async({h,name})=>{const mod=await import(h);await mod.remountTodayWithoutPending(name);},{h:harness,name:'active'});
  await expect(page.getByText(/Pending Safe/)).toHaveCount(0);
  await expect(page.getByText('Tidak ada hal yang perlu diamankan atau ditutup sekarang.')).toBeVisible();
});

test('Today read error is unknown state with Retry, never an empty claim',async({page})=>{
  await mount(page,'empty',{failReads:true});
  await expect(page.getByRole('heading',{name:'Today belum dapat dimuat'})).toBeVisible();
  await expect(page.getByText(/bukan berarti tidak ada pekerjaan/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Coba lagi'})).toBeVisible();
  await expect(page.getByText(/Tidak ada work yang perlu perhatian/)).toHaveCount(0);
});
