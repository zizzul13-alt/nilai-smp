import{expect,test}from'@playwright/test';
const harness='/tests/e2e/fixtures/today-checkpoint-reconcile-harness.tsx';

test('new durable checkpoint remains visible when canonical Today refresh fails',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(h:string)=>(await import(h)).mountTodayCheckpointReconcileHarness(),harness);
  await expect(page.getByText('Server LAST',{exact:true})).toBeVisible();
  await page.evaluate(async(h:string)=>(await import(h)).setTodayCanonicalReadFailure(true),harness);
  await page.evaluate(async(h:string)=>(await import(h)).enqueueCheckpointWhileCanonicalUnavailable(),harness);
  await expect(page.getByText('Local Offline LAST',{exact:true})).toBeVisible();
  await expect(page.getByText('Local Offline NEXT',{exact:true})).toBeVisible();
  await expect(page.getByText(/PENDING SAFE · belum terkonfirmasi server/)).toBeVisible();
  await expect(page.getByText(/Today belum dapat menyelaraskan konteks server/)).toBeVisible();
  await expect(page.getByText('Server LAST',{exact:true})).toHaveCount(0);
});
