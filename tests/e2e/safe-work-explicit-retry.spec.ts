import { expect, test } from '@playwright/test';

const localPath='/src/services/safeWork/localQueue.ts';
const syncPath='/src/services/safeWork/syncWorker.ts';

test('FAILED explicit Retry during active run joins coalesced follow-up and retries same op_id',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async({lp,sp})=>{
    const local=await import(lp),sync=await import(sp);
    const db=new local.SafeWorkDb(`drain-explicit-retry-${crypto.randomUUID()}`);
    const op1='76000000-0000-0000-0000-000000000001',op2='76000000-0000-0000-0000-000000000002';
    await local.enqueueStudentRename(db,{authUserId:'A',workspaceId:'WA',studentId:'S1',displayName:'One',expectedRevision:1,opId:op1});
    await local.enqueueStudentRename(db,{authUserId:'A',workspaceId:'WA',studentId:'S2',displayName:'Two',expectedRevision:1,opId:op2});
    await local.markOperation(db,op1,{created_at:'2026-09-05T00:00:01.000Z'});
    await local.markOperation(db,op2,{created_at:'2026-09-05T00:00:02.000Z'});

    let releaseOp2!:()=>void,signalOp2!:()=>void;
    const op2Gate=new Promise<void>(resolve=>{releaseOp2=resolve;});
    const op2Started=new Promise<void>(resolve=>{signalOp2=resolve;});
    const seen:string[]=[];let active=0,maxActive=0,op1Calls=0,op2Calls=0;
    const client={rpc:async(_name:string,args:{p_op_id:string})=>{
      active++;maxActive=Math.max(maxActive,active);seen.push(args.p_op_id);
      if(args.p_op_id===op1){
        op1Calls++;
        active--;
        if(op1Calls===1)return{data:null,error:{code:'P3202'}};
        return{data:{outcome:'saved',revision:2,replayed:false},error:null};
      }
      op2Calls++;signalOp2();await op2Gate;active--;
      return{data:{outcome:'saved',revision:2,replayed:false},error:null};
    }} as any;

    const worker=new sync.SafeWorkSyncWorker(db,client);
    const first=worker.syncNamespace('A','WA');
    await op2Started;
    const failedBeforeRetry=await db.operations.get(op1);
    await local.retryOperation(db,op1);
    const joined=worker.syncNamespace('A','WA');
    const joinedSameRun=joined===first;
    releaseOp2();
    await Promise.all([first,joined]);
    const remaining=await local.pendingForNamespace(db,'A','WA');
    await db.delete();
    return{seen,op1Calls,op2Calls,maxActive,joinedSameRun,failedStatus:failedBeforeRetry?.status,failedCode:failedBeforeRetry?.last_error_code,remaining:remaining.length};
  },{lp:localPath,sp:syncPath});

  expect(result.failedStatus).toBe('FAILED');
  expect(result.failedCode).toBe('OP_ID_MISMATCH');
  expect(result.joinedSameRun).toBe(true);
  expect(result.op1Calls).toBe(2);
  expect(result.op2Calls).toBe(1);
  expect(result.maxActive).toBe(1);
  expect(result.seen).toEqual([
    '76000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000002',
    '76000000-0000-0000-0000-000000000001',
  ]);
  expect(result.remaining).toBe(0);
});

test('retryable predecessor stays deferred for current run and same-causal successor cannot leapfrog',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async({lp,sp})=>{
    const local=await import(lp),sync=await import(sp);
    const db=new local.SafeWorkDb(`drain-retryable-causal-${crypto.randomUUID()}`);
    const op1='77000000-0000-0000-0000-000000000001',op2='77000000-0000-0000-0000-000000000002';
    await local.enqueueStudentRename(db,{authUserId:'A',workspaceId:'WA',studentId:'S1',displayName:'First',expectedRevision:1,opId:op1});
    await local.enqueueStudentRename(db,{authUserId:'A',workspaceId:'WA',studentId:'S1',displayName:'Second',expectedRevision:2,opId:op2});
    await local.markOperation(db,op1,{created_at:'2026-09-05T00:00:01.000Z'});
    await local.markOperation(db,op2,{created_at:'2026-09-05T00:00:02.000Z'});

    let release!:()=>void,signal!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const started=new Promise<void>(resolve=>{signal=resolve;});
    const seen:string[]=[];let active=0,maxActive=0,op1Calls=0;
    const client={rpc:async(_name:string,args:{p_op_id:string})=>{
      active++;maxActive=Math.max(maxActive,active);seen.push(args.p_op_id);
      if(args.p_op_id===op1){
        op1Calls++;
        if(op1Calls===1){signal();await gate;active--;return{data:null,error:{code:'PGRST000'}};}
      }
      active--;
      return{data:{outcome:'saved',revision:3,replayed:op1Calls>1},error:null};
    }} as any;

    const worker=new sync.SafeWorkSyncWorker(db,client);
    const first=worker.syncNamespace('A','WA');
    await started;
    const coalesced=worker.syncNamespace('A','WA');
    release();
    await Promise.all([first,coalesced]);
    const afterFirst=await local.pendingForNamespace(db,'A','WA');
    const seenAfterFirst=[...seen];
    const op1AfterFirst=await db.operations.get(op1),op2AfterFirst=await db.operations.get(op2);

    await worker.syncNamespace('A','WA');
    const remaining=await local.pendingForNamespace(db,'A','WA');
    await db.delete();
    return{
      seen,seenAfterFirst,maxActive,remaining:remaining.length,
      op1Status:op1AfterFirst?.status,op1Code:op1AfterFirst?.last_error_code,op1Attempts:op1AfterFirst?.attempt_count,
      op2Status:op2AfterFirst?.status,op2Attempts:op2AfterFirst?.attempt_count,afterFirstCount:afterFirst.length,
    };
  },{lp:localPath,sp:syncPath});

  expect(result.seenAfterFirst).toEqual(['77000000-0000-0000-0000-000000000001']);
  expect(result.afterFirstCount).toBe(2);
  expect(result.op1Status).toBe('PENDING_SAFE');
  expect(result.op1Code).toBe('NETWORK');
  expect(result.op1Attempts).toBe(1);
  expect(result.op2Status).toBe('PENDING_SAFE');
  expect(result.op2Attempts).toBe(0);
  expect(result.maxActive).toBe(1);
  expect(result.seen).toEqual([
    '77000000-0000-0000-0000-000000000001',
    '77000000-0000-0000-0000-000000000001',
    '77000000-0000-0000-0000-000000000002',
  ]);
  expect(result.remaining).toBe(0);
});
