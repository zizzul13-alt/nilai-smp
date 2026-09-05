import { expect, test } from '@playwright/test';

const harnessPath='/tests/e2e/fixtures/continuity-ui-harness.tsx';
const queuePath='/src/services/safeWork/localQueue.ts';

async function addDurableCheckpointWithoutAdvisorySignal(page:any,meetingId:string,opId:string){
  await page.evaluate(async({queue,meetingId,opId})=>{
    const local=await import(queue);
    await local.safeWorkDb.operations.add({
      op_id:opId,
      auth_user_id:'A',workspace_id:'WA',entity_type:'meeting_checkpoint',entity_id:meetingId,
      causal_key:`meeting_checkpoint:${meetingId}`,operation_kind:'meeting.checkpoint',
      payload:{meeting_id:meetingId,stopped_at:'Halaman 37',next_step:'Nomor 3'},
      created_at:new Date().toISOString(),attempt_count:0,last_attempt_at:null,status:'PENDING_SAFE',
      expected_revision:0,last_error_code:null,conflict_snapshot:null,
    });
  },{queue:queuePath,meetingId,opId});
}

async function markSaved(page:any,opId:string){
  await page.evaluate(async({queue,opId})=>{
    const local=await import(queue);
    await local.markSavedAndMinimize(local.safeWorkDb,opId);
  },{queue:queuePath,opId});
}

test('actual TeachingContinuity UI rechecks durable cross-tab work before Complete and Cancel',async({page,context})=>{
  const pageA=page;
  const pageB=await context.newPage();
  await Promise.all([pageA.goto('/'),pageB.goto('/')]);

  await pageA.evaluate(async path=>{const harness=await import(path);await harness.mountContinuityUiHarness('M1');},harnessPath);
  const ui=pageA.locator('#continuity-test-root');
  const complete=ui.getByRole('button',{name:'Complete Class'});
  await expect(ui.getByText('VIII A')).toBeVisible();
  await expect(ui.getByText('IN PROGRESS')).toBeVisible();
  await expect(complete).toBeEnabled();

  // Simulate a durable Page B write whose advisory signal is delayed/missed.
  // The lifecycle click must still discover IndexedDB truth immediately before RPC.
  const completeOp='c1000000-0000-0000-0000-000000000001';
  await addDurableCheckpointWithoutAdvisorySignal(pageB,'M1',completeOp);
  await complete.click();
  await expect(ui.getByRole('alert')).toContainText('Checkpoint belum tersinkron');
  const blockedComplete=await pageA.evaluate(async path=>{const harness=await import(path);return harness.continuityHarnessSnapshot();},harnessPath);
  expect(blockedComplete).toMatchObject({meetingId:'M1',meetingStatus:'in_progress',lifecycleCalls:{completed:0,cancelled:0}});
  const durableComplete=await pageB.evaluate(async({queue,opId})=>{const local=await import(queue);return Boolean(await local.safeWorkDb.operations.get(opId));},{queue:queuePath,opId:completeOp});
  expect(durableComplete).toBe(true);

  // Saving/minimizing publishes coordination; Page A refreshes its durable view and lifecycle becomes available.
  await markSaved(pageB,completeOp);
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect.poll(()=>pageA.evaluate(async path=>{const harness=await import(path);return harness.continuityHarnessSnapshot().lifecycleCalls.completed;},harnessPath)).toBe(1);
  const completed=await pageA.evaluate(async path=>{const harness=await import(path);return harness.continuityHarnessSnapshot();},harnessPath);
  expect(completed.meetingStatus).toBe('completed');

  // Repeat through the real Cancel button on a new active Meeting.
  await pageA.evaluate(async path=>{const harness=await import(path);await harness.mountContinuityUiHarness('M2');},harnessPath);
  const cancel=ui.getByRole('button',{name:'Cancel Meeting'});
  await expect(cancel).toBeEnabled();
  const cancelOp='c1000000-0000-0000-0000-000000000002';
  await addDurableCheckpointWithoutAdvisorySignal(pageB,'M2',cancelOp);
  await cancel.click();
  await expect(ui.getByRole('alert')).toContainText('Checkpoint belum tersinkron');
  const blockedCancel=await pageA.evaluate(async path=>{const harness=await import(path);return harness.continuityHarnessSnapshot();},harnessPath);
  expect(blockedCancel).toMatchObject({meetingId:'M2',meetingStatus:'in_progress',lifecycleCalls:{completed:0,cancelled:0}});

  await markSaved(pageB,cancelOp);
  await expect(cancel).toBeEnabled();
  await cancel.click();
  await expect.poll(()=>pageA.evaluate(async path=>{const harness=await import(path);return harness.continuityHarnessSnapshot().lifecycleCalls.cancelled;},harnessPath)).toBe(1);
  const cancelled=await pageA.evaluate(async path=>{const harness=await import(path);return harness.continuityHarnessSnapshot();},harnessPath);
  expect(cancelled.meetingStatus).toBe('cancelled');
});
