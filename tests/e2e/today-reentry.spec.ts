import{expect,test,type Page}from'@playwright/test';
const harness='/tests/e2e/fixtures/today-ui-harness.tsx';
async function mount(page:Page,name:string,options:Record<string,unknown>={}){await page.goto('/');await page.evaluate(async({h,name,options}:{h:string;name:string;options:Record<string,unknown>})=>{const mod=await import(h);await mod.mountTodayHarness(name,options);},{h:harness,name,options});}
async function snapshot(page:Page){return page.evaluate(async(h:string)=>(await import(h)).todayHarnessSnapshot(),harness);}

test('Today dispatches active Meeting directly to the correct Teaching class',async({page})=>{
  await mount(page,'active');
  await expect(page.getByRole('heading',{name:'Apa yang penting sekarang?'})).toBeVisible();
  await expect(page.getByText('VIII A · Meeting aktif')).toBeVisible();
  await expect(page.getByText('Halaman 37').first()).toBeVisible();
  await expect(page.getByText('Nomor 3').first()).toBeVisible();
  const primary=page.getByRole('button',{name:'CONTINUE CLASS'});await expect(primary).toBeVisible();await primary.click();
  expect((await snapshot(page)).nav).toEqual([{surface:'continuity',id:'C1'}]);
});

test('Today resumes active correction at exact Assessment and restores saved enrollment cursor once',async({page})=>{
  await mount(page,'correction',{followRapid:true});
  await expect(page.getByText('Kuis Gerak').first()).toBeVisible();
  const resume=page.getByRole('button',{name:'RESUME CORRECTION',exact:true});await expect(resume).toBeVisible();await resume.click();
  await expect(page.getByLabel('Assessment')).toHaveValue('A1');
  await expect(page.getByText('Siswa E9',{exact:true})).toBeVisible();
  await page.getByLabel('Cari pemilik kertas').fill('9012');
  await page.getByRole('button',{name:/Siswa E12/}).click();
  await expect(page.getByText('Siswa E12',{exact:true})).toBeVisible();
  await page.evaluate(async(h:string)=>{const mod=await import(h);await mod.forceRapidStaleCursorAndRefresh('E9');},harness);
  await expect(page.getByText('Siswa E12',{exact:true})).toBeVisible();
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

test('stale re-entry actions are hidden for a Class with an active Meeting',async({page})=>{
  await mount(page,'active-stale');
  await expect(page.getByRole('button',{name:'CONTINUE CLASS'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Quick Update'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start From Today'})).toHaveCount(0);
});

test('Today stays useful without active class work or schedule data',async({page})=>{
  await mount(page,'empty');
  await expect(page.getByText(/Tidak ada work yang perlu perhatian/)).toBeVisible();
  await expect(page.getByText(/Tidak ada jadwal yang perlu dikonfigurasi/)).toBeVisible();
  await expect(page.getByText(/tidak ada "next class" yang difabrikasi/i)).toBeVisible();
  await expect(page.getByText(/scheduled/i)).toHaveCount(0);
});

test('Safe Work without a NOW primary is attention, not a false empty state',async({page})=>{
  await mount(page,'empty',{checkpoint:{meetingId:'M-orphan',stoppedAt:'Local failed',nextStep:'Recover',status:'FAILED'}});
  await expect(page.getByText(/Tidak ada work yang perlu perhatian/)).toHaveCount(0);
  await expect(page.getByText(/Tidak ada pekerjaan utama di NOW/)).toBeVisible();
  await expect(page.getByText(/1 FAILED/)).toBeVisible();
});

test('Before Leaving truthfully surfaces Pending Safe and disappears when clean',async({page})=>{
  await mount(page,'pending',{pending:true});
  await expect(page.getByRole('heading',{name:'BEFORE LEAVING'})).toBeVisible();
  await expect(page.getByText(/1 Pending Safe/)).toBeVisible();
  await expect(page.getByText(/Saved/)).toHaveCount(0);
  await page.evaluate(async({h,name}:{h:string;name:string})=>{const mod=await import(h);await mod.remountTodayWithoutPending(name);},{h:harness,name:'active'});
  await expect(page.getByText(/Pending Safe/)).toHaveCount(0);
  await expect(page.getByText('Tidak ada hal yang perlu diamankan atau ditutup sekarang.')).toBeVisible();
});

for(const status of['PENDING_SAFE','FAILED','CONFLICT']as const)test(`active Meeting overlays newest local durable checkpoint with truthful ${status}`,async({page})=>{
  await mount(page,'pending',{checkpoint:{meetingId:'M1',stoppedAt:`Local ${status}`,nextStep:'Local next',status}});
  await expect(page.getByText(`Local ${status}`,{exact:true})).toBeVisible();
  await expect(page.getByText('Local next',{exact:true})).toBeVisible();
  await expect(page.getByText(status==='PENDING_SAFE'?/PENDING SAFE · belum terkonfirmasi server/:new RegExp(`${status} · konteks lokal belum diterima server`))).toBeVisible();
  await expect(page.getByText(/Saved/)).toHaveCount(0);
});

test('Today reconciles bounded canonical checkpoint when Pending Safe becomes Saved',async({page})=>{
  await mount(page,'pending',{pending:true});
  await expect(page.getByText('Local Pending',{exact:true})).toBeVisible();
  await expect(page.getByText('Belum sync',{exact:true})).toBeVisible();
  await expect(page.getByText(/PENDING SAFE · belum terkonfirmasi server/)).toBeVisible();
  await page.evaluate(async(h:string)=>{const mod=await import(h);await mod.simulateCheckpointSavedToServer('Canonical Saved','Canonical next');},harness);
  await expect(page.getByText('Canonical Saved',{exact:true})).toBeVisible();
  await expect(page.getByText('Canonical next',{exact:true})).toBeVisible();
  await expect(page.getByText('Server LAST',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/PENDING SAFE · belum terkonfirmasi server/)).toHaveCount(0);
  await expect(page.getByText(/1 Pending Safe/)).toHaveCount(0);
});

test('checkpoint for an older Meeting stays recovery attention and cannot overlay active Meeting',async({page})=>{
  await mount(page,'active',{checkpoint:{meetingId:'M-old',stoppedAt:'Local old',nextStep:'Old next',status:'PENDING_SAFE'},meetingMap:{'M-old':'C1'}});
  await expect(page.getByText('Halaman 37',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Nomor 3',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Local old',{exact:true})).toHaveCount(0);
});

test('old Meeting checkpoint recovery resolves authoritative Class instead of latest Today Meeting',async({page})=>{
  await mount(page,'old-recovery',{checkpoint:{meetingId:'M-old',stoppedAt:'Old pending',nextStep:'Recover',status:'PENDING_SAFE'},meetingMap:{'M-old':'C1'}});
  await page.getByRole('button',{name:'Open recovery surface'}).click();
  await expect.poll(async()=>JSON.stringify((await snapshot(page)).nav)).toBe(JSON.stringify([{surface:'continuity',id:'C1'}]));
});

test('checkpoint recovery resolves Class outside the bounded 24-row Today window',async({page})=>{
  await mount(page,'outside-window',{checkpoint:{meetingId:'M25',stoppedAt:'C25 pending',nextStep:'Recover',status:'PENDING_SAFE'},meetingMap:{M25:'C25'}});
  await page.getByRole('button',{name:'Open recovery surface'}).click();
  await expect.poll(async()=>JSON.stringify((await snapshot(page)).nav)).toBe(JSON.stringify([{surface:'continuity',id:'C25'}]));
});

test('unresolved checkpoint Class stays visible and never routes to default Class',async({page})=>{
  await mount(page,'empty',{checkpoint:{meetingId:'M-unknown',stoppedAt:'Unknown pending',nextStep:'Recover',status:'PENDING_SAFE'}});
  await page.getByRole('button',{name:'Open recovery surface'}).click();
  await expect(page.getByText('Class untuk checkpoint ini belum dapat ditentukan.')).toBeVisible();
  expect((await snapshot(page)).nav).toEqual([]);
  await expect(page.getByText(/1 Pending Safe/)).toBeVisible();
});

test('Today read error is unknown state with Retry, never an empty claim',async({page})=>{
  await mount(page,'empty',{failReads:true});
  await expect(page.getByRole('heading',{name:'Today belum dapat dimuat'})).toBeVisible();
  await expect(page.getByText(/bukan berarti tidak ada pekerjaan/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Coba lagi'})).toBeVisible();
  await expect(page.getByText(/Tidak ada work yang perlu perhatian/)).toHaveCount(0);
});
