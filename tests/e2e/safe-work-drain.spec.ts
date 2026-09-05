import { expect, test } from '@playwright/test';

const localPath = '/src/services/safeWork/localQueue.ts';
const syncPath = '/src/services/safeWork/syncWorker.ts';

test('mid-flight same-causal enqueue cannot lose its wakeup and does not run in parallel', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ lp, sp }) => {
    const local = await import(lp), sync = await import(sp);
    const db = new local.SafeWorkDb(`drain-missed-${crypto.randomUUID()}`);
    const op1 = '71000000-0000-0000-0000-000000000001';
    const op2 = '71000000-0000-0000-0000-000000000002';
    await local.enqueueStudentRename(db, { authUserId:'A', workspaceId:'WA', studentId:'S1', displayName:'First', expectedRevision:1, opId:op1 });

    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const firstRpcStarted = new Promise<void>(resolve => { started = resolve; });
    const seen:string[] = [];
    let active = 0, maxActive = 0;
    const client = { rpc: async (_name:string, args:{p_op_id:string}) => {
      active++; maxActive = Math.max(maxActive, active); seen.push(args.p_op_id);
      if (args.p_op_id === op1) { started(); await gate; }
      active--;
      return { data:{outcome:'saved',revision:2,replayed:false}, error:null };
    }} as any;

    const worker = new sync.SafeWorkSyncWorker(db, client);
    const first = worker.syncNamespace('A','WA');
    await firstRpcStarted;
    await local.enqueueStudentRename(db, { authUserId:'A', workspaceId:'WA', studentId:'S1', displayName:'Second', expectedRevision:2, opId:op2 });
    const second = worker.syncNamespace('A','WA');
    const joinedSameRun = first === second;
    const beforeRelease = [...seen];
    release();
    await Promise.all([first, second]);
    const remaining = await local.pendingForNamespace(db,'A','WA');
    await db.delete();
    return { seen, beforeRelease, maxActive, joinedSameRun, remaining:remaining.length };
  }, { lp:localPath, sp:syncPath });

  expect(result.beforeRelease).toEqual(['71000000-0000-0000-0000-000000000001']);
  expect(result.seen).toEqual([
    '71000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000002',
  ]);
  expect(result.maxActive).toBe(1);
  expect(result.joinedSameRun).toBe(true);
  expect(result.remaining).toBe(0);
});

test('multiple wakeups coalesce while eventually draining all newly eligible work', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ lp, sp }) => {
    const local = await import(lp), sync = await import(sp);
    const db = new local.SafeWorkDb(`drain-coalesce-${crypto.randomUUID()}`);
    const ids = [
      '72000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000002',
      '72000000-0000-0000-0000-000000000003',
      '72000000-0000-0000-0000-000000000004',
    ];
    await local.enqueueStudentRename(db, { authUserId:'A', workspaceId:'WA', studentId:'S1', displayName:'One', expectedRevision:1, opId:ids[0] });

    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const firstRpcStarted = new Promise<void>(resolve => { started = resolve; });
    const seen:string[] = [];
    let active = 0, maxActive = 0;
    const client = { rpc: async (_name:string, args:{p_op_id:string}) => {
      active++; maxActive = Math.max(maxActive, active); seen.push(args.p_op_id);
      if (args.p_op_id === ids[0]) { started(); await gate; }
      active--;
      return { data:{outcome:'saved',revision:2,replayed:false}, error:null };
    }} as any;

    const worker = new sync.SafeWorkSyncWorker(db, client);
    const first = worker.syncNamespace('A','WA');
    await firstRpcStarted;
    const joined:Promise<void>[] = [];
    for (let i=1; i<ids.length; i++) {
      await local.enqueueStudentRename(db, { authUserId:'A', workspaceId:'WA', studentId:`S${i+1}`, displayName:`Name ${i+1}`, expectedRevision:1, opId:ids[i] });
      joined.push(worker.syncNamespace('A','WA'));
    }
    const allJoined = joined.every(p => p === first);
    release();
    await Promise.all([first, ...joined]);
    const remaining = await local.pendingForNamespace(db,'A','WA');
    await db.delete();
    return { seen, maxActive, allJoined, remaining:remaining.length, ids };
  }, { lp:localPath, sp:syncPath });

  expect(result.allJoined).toBe(true);
  expect(result.maxActive).toBe(1);
  expect(result.remaining).toBe(0);
  expect(result.seen).toHaveLength(4);
  expect(new Set(result.seen)).toEqual(new Set(result.ids));
  expect(result.seen[0]).toBe(result.ids[0]);
});

test('namespace B request is not swallowed while namespace A is blocked', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ lp, sp }) => {
    const local = await import(lp), sync = await import(sp);
    const db = new local.SafeWorkDb(`drain-namespaces-${crypto.randomUUID()}`);
    const opA = '73000000-0000-0000-0000-000000000001';
    const opB = '73000000-0000-0000-0000-000000000002';
    await local.enqueueStudentRename(db, { authUserId:'A', workspaceId:'WA', studentId:'SA', displayName:'A', expectedRevision:1, opId:opA });
    await local.enqueueStudentRename(db, { authUserId:'B', workspaceId:'WB', studentId:'SB', displayName:'B', expectedRevision:1, opId:opB });

    let releaseA!: () => void, startedA!: () => void;
    const gateA = new Promise<void>(resolve => { releaseA = resolve; });
    const aStarted = new Promise<void>(resolve => { startedA = resolve; });
    const seen:string[] = [];
    let active = 0, maxActive = 0;
    const client = { rpc: async (_name:string, args:{p_op_id:string}) => {
      active++; maxActive = Math.max(maxActive, active); seen.push(args.p_op_id);
      if (args.p_op_id === opA) { startedA(); await gateA; }
      active--;
      return { data:{outcome:'saved',revision:2,replayed:false}, error:null };
    }} as any;

    const worker = new sync.SafeWorkSyncWorker(db, client);
    const runA = worker.syncNamespace('A','WA');
    await aStarted;
    await worker.syncNamespace('B','WB');
    const bRemainingWhileABlocked = (await local.pendingForNamespace(db,'B','WB')).length;
    const aStillPending = (await local.pendingForNamespace(db,'A','WA')).length;
    releaseA();
    await runA;
    const finalA = (await local.pendingForNamespace(db,'A','WA')).length;
    const finalB = (await local.pendingForNamespace(db,'B','WB')).length;
    await db.delete();
    return { seen, maxActive, bRemainingWhileABlocked, aStillPending, finalA, finalB };
  }, { lp:localPath, sp:syncPath });

  expect(result.seen).toContain('73000000-0000-0000-0000-000000000001');
  expect(result.seen).toContain('73000000-0000-0000-0000-000000000002');
  expect(result.bRemainingWhileABlocked).toBe(0);
  expect(result.aStillPending).toBe(1);
  expect(result.maxActive).toBe(2);
  expect(result.finalA).toBe(0);
  expect(result.finalB).toBe(0);
});

test('coalesced wakeup does not immediately retry the same network-failed operation', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ lp, sp }) => {
    const local = await import(lp), sync = await import(sp);
    const db = new local.SafeWorkDb(`drain-network-${crypto.randomUUID()}`);
    const opId = '74000000-0000-0000-0000-000000000001';
    await local.enqueueStudentRename(db, { authUserId:'A', workspaceId:'WA', studentId:'S1', displayName:'Network', expectedRevision:1, opId });

    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const rpcStarted = new Promise<void>(resolve => { started = resolve; });
    let calls = 0;
    const seen:string[] = [];
    const client = { rpc: async (_name:string, args:{p_op_id:string}) => {
      calls++; seen.push(args.p_op_id);
      if (calls === 1) { started(); await gate; }
      return { data:null, error:{code:'PGRST000'} };
    }} as any;

    const worker = new sync.SafeWorkSyncWorker(db, client);
    const first = worker.syncNamespace('A','WA');
    await rpcStarted;
    const coalesced = worker.syncNamespace('A','WA');
    release();
    await Promise.all([first, coalesced]);
    const afterCoalesced = await db.operations.get(opId);
    const callsAfterCoalesced = calls;
    await worker.syncNamespace('A','WA');
    const afterExplicitRetry = await db.operations.get(opId);
    await db.delete();
    return {
      seen,
      callsAfterCoalesced,
      callsAfterExplicitRetry:calls,
      status:afterCoalesced?.status,
      code:afterCoalesced?.last_error_code,
      attemptCount:afterCoalesced?.attempt_count,
      finalAttemptCount:afterExplicitRetry?.attempt_count,
    };
  }, { lp:localPath, sp:syncPath });

  expect(result.callsAfterCoalesced).toBe(1);
  expect(result.status).toBe('PENDING_SAFE');
  expect(result.code).toBe('NETWORK');
  expect(result.attemptCount).toBe(1);
  expect(result.callsAfterExplicitRetry).toBe(2);
  expect(result.finalAttemptCount).toBe(2);
  expect(result.seen).toEqual([
    '74000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
  ]);
});

test('coalesced wakeup remains bounded on auth expiry and keeps work recoverable', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ lp, sp }) => {
    const local = await import(lp), sync = await import(sp);
    const db = new local.SafeWorkDb(`drain-auth-${crypto.randomUUID()}`);
    const opId = '75000000-0000-0000-0000-000000000001';
    await local.enqueueStudentRename(db, { authUserId:'A', workspaceId:'WA', studentId:'S1', displayName:'Auth', expectedRevision:1, opId });

    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const rpcStarted = new Promise<void>(resolve => { started = resolve; });
    let calls = 0;
    const client = { rpc: async () => {
      calls++;
      if (calls === 1) { started(); await gate; }
      return { data:null, error:{code:'PGRST301'} };
    }} as any;

    const worker = new sync.SafeWorkSyncWorker(db, client);
    const first = worker.syncNamespace('A','WA');
    await rpcStarted;
    const coalesced = worker.syncNamespace('A','WA');
    release();
    await Promise.all([first, coalesced]);
    const op = await db.operations.get(opId);
    await db.delete();
    return { calls, status:op?.status, code:op?.last_error_code, attemptCount:op?.attempt_count };
  }, { lp:localPath, sp:syncPath });

  expect(result).toEqual({ calls:1, status:'PENDING_SAFE', code:'AUTH_REQUIRED', attemptCount:1 });
});
