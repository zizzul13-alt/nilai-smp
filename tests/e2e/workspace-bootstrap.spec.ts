import { expect, test } from '@playwright/test';

const harnessPath='/tests/e2e/fixtures/bootstrap-ui-harness.tsx';

async function snapshot(page:any){
  return page.evaluate(async(path:string)=>{
    const harness=await import(path);
    return harness.bootstrapHarnessSnapshot();
  },harnessPath);
}

test('workspace bootstrap failure is visible and Retry recovers without reload or duplicate side effects',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(path)=>{
    const harness=await import(path);
    harness.mountBootstrapUiHarness();
  },harnessPath);

  await expect(page.getByRole('heading',{name:'Tidak dapat membuka workspace'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Coba lagi'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Keluar'})).toBeVisible();
  await expect(page.getByTestId('teacher-workspace')).toHaveCount(0);
  await expect(page.getByText(/synthetic bootstrap failure|secret-like detail/i)).toHaveCount(0);

  expect(await snapshot(page)).toMatchObject({bootstrapCalls:1,syncCalls:[],installCalls:0,cleanupCalls:0,retryPending:false});

  await page.getByRole('button',{name:'Coba lagi'}).click();
  await expect(page.getByRole('heading',{name:'Membuka workspace…'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tidak dapat membuka workspace'})).toHaveCount(0);
  expect(await snapshot(page)).toMatchObject({bootstrapCalls:2,installCalls:0,retryPending:true});

  await page.evaluate(async(path)=>{
    const harness=await import(path);
    harness.resolveBootstrapRetry('WORKSPACE-A');
  },harnessPath);

  await expect(page.getByTestId('teacher-workspace')).toHaveText('Teacher workspace WORKSPACE-A');
  await expect(page.getByRole('heading',{name:'Membuka workspace…'})).toHaveCount(0);
  expect(await snapshot(page)).toMatchObject({
    bootstrapCalls:2,
    syncCalls:[{authUserId:'USER-A',workspaceId:'WORKSPACE-A'}],
    installCalls:1,
    cleanupCalls:0,
    retryPending:false,
  });

  await page.evaluate(async(path)=>{
    const harness=await import(path);
    harness.rerenderBootstrapUiHarness();
  },harnessPath);
  expect(await snapshot(page)).toMatchObject({installCalls:1,syncCalls:[{authUserId:'USER-A',workspaceId:'WORKSPACE-A'}]});

  await page.evaluate(async(path)=>{
    const harness=await import(path);
    harness.unmountBootstrapUiHarness();
  },harnessPath);
  expect(await snapshot(page)).toMatchObject({installCalls:1,cleanupCalls:1});
});
