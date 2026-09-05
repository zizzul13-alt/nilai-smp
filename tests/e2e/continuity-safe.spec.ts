import { expect, test } from '@playwright/test';

const queuePath='/src/services/safeWork/localQueue.ts';
const workerPath='/src/services/safeWork/syncWorker.ts';
const teachingPath='/src/services/academic/teachingCore.ts';
const safetyPath='/src/services/academic/continuitySafety.ts';
const coordinationPath='/src/services/safeWork/coordination.ts';

test('checkpoint becomes Pending Safe durably and survives browser reload',async({page})=>{
  await page.goto('/');
  const before=await page.evaluate(async(path)=>{
    const mod=await import(path);
    const db=new mod.SafeWorkDb('r34-continuity-reload-proof');
    const op=await mod.enqueueMeetingCheckpoint(db,{authUserId:'A',workspaceId:'WA',meetingId:'M1',stoppedAt:'Halaman 37, contoh 2',nextStep:'Bahas nomor 3',opId:'a1000000-0000-0000-0000-000000000001'});
    db.close();
    return{status:op.status,payload:op.payload};
  },queuePath);
  expect(before).toMatchObject({status:'PENDING_SAFE',payload:{meeting_id:'M1',stopped_at:'Halaman 37, contoh 2',next_step:'Bahas nomor 3'}});

  await page.reload();
  const recovered=await page.evaluate(async(path)=>{
    const mod=await import(path);
    const db=new mod.SafeWorkDb('r34-continuity-reload-proof');
    const rows=await mod.pendingForNamespace(db,'A','WA');
    db.close();
    return rows;
  },queuePath);
  expect(recovered).toHaveLength(1);
  expect(recovered[0]).toMatchObject({operation_kind:'meeting.checkpoint',entity_id:'M1',status:'PENDING_SAFE'});
});

test('Dexie failure never earns a Pending Safe checkpoint claim',async({page})=>{
  await page.goto('/');
  const outcome=await page.evaluate(async(path)=>{
    const mod=await import(path);
    const db=new mod.SafeWorkDb('r34-continuity-dexie-fail-proof');
    db.close({disableAutoOpen:true});
    try{
      await mod.enqueueMeetingCheckpoint(db,{authUserId:'A',workspaceId:'WA',meetingId:'M1',stoppedAt:'Unsafe',nextStep:null});
      return'PENDING_SAFE';
    }catch{return'FAILED_BEFORE_PENDING_SAFE';}
  },queuePath);
  expect(outcome).toBe('FAILED_BEFORE_PENDING_SAFE');
});

test('unknown network failure keeps the same checkpoint op_id for retry and only confirmed save removes it',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async(paths)=>{
    const local=await import(paths.queue);
    const sync=await import(paths.worker);
    const db=new local.SafeWorkDb('r34-continuity-retry-proof');
    const calls:string[]=[];
    const client={rpc:async(_name:string,args:Record<string,unknown>)=>{
      calls.push(String(args.p_op_id));
      if(calls.length===1)return{data:null,error:{code:'PGRST000',message:'response lost'}};
      return{data:[{outcome:'saved',checkpoint_id:'a2000000-0000-0000-0000-000000000001',sequence_no:1,replayed:true}],error:null};
    }};
    const op=await local.enqueueMeetingCheckpoint(db,{authUserId:'A',workspaceId:'WA',meetingId:'M1',stoppedAt:'Halaman 37',nextStep:'Nomor 3',opId:'a1000000-0000-0000-0000-000000000002'});
    const worker=new sync.SafeWorkSyncWorker(db,client);
    await worker.syncNamespace('A','WA');
    const afterLost=await db.operations.get(op.op_id);
    await worker.syncNamespace('A','WA');
    const afterSaved=await db.operations.get(op.op_id);
    db.close();
    return{calls,afterLostStatus:afterLost?.status,afterLostError:afterLost?.last_error_code,afterSaved:Boolean(afterSaved)};
  },{queue:queuePath,worker:workerPath});

  expect(result.calls).toEqual(['a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002']);
  expect(result.afterLostStatus).toBe('PENDING_SAFE');
  expect(result.afterLostError).toBe('NETWORK');
  expect(result.afterSaved).toBe(false);
});

test('auth expiry keeps checkpoint Pending Safe with AUTH_REQUIRED',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async(paths)=>{
    const local=await import(paths.queue);
    const sync=await import(paths.worker);
    const db=new local.SafeWorkDb('r34-continuity-auth-proof');
    const client={rpc:async()=>({data:null,error:{code:'28000',message:'authentication required'}})};
    const op=await local.enqueueMeetingCheckpoint(db,{authUserId:'A',workspaceId:'WA',meetingId:'M1',stoppedAt:'Halaman 41',nextStep:'Latihan 5',opId:'a1000000-0000-0000-0000-000000000003'});
    const worker=new sync.SafeWorkSyncWorker(db,client);
    await worker.syncNamespace('A','WA');
    const pending=await db.operations.get(op.op_id);
    db.close();
    return{status:pending?.status,error:pending?.last_error_code,payload:pending?.payload};
  },{queue:queuePath,worker:workerPath});

  expect(result).toMatchObject({status:'PENDING_SAFE',error:'AUTH_REQUIRED',payload:{meeting_id:'M1',stopped_at:'Halaman 41',next_step:'Latihan 5'}});
});

test('permanent server rejection becomes FAILED rather than Pending Safe',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async(paths)=>{
    const local=await import(paths.queue);
    const sync=await import(paths.worker);
    const db=new local.SafeWorkDb('r34-continuity-permanent-fail-proof');
    const client={rpc:async()=>({data:null,error:{code:'P3505',message:'meeting is not in progress'}})};
    const op=await local.enqueueMeetingCheckpoint(db,{authUserId:'A',workspaceId:'WA',meetingId:'M1',stoppedAt:'Halaman 41',nextStep:null,opId:'a1000000-0000-0000-0000-000000000004'});
    const worker=new sync.SafeWorkSyncWorker(db,client);
    await worker.syncNamespace('A','WA');
    const failed=await db.operations.get(op.op_id);
    db.close();
    return{status:failed?.status,error:failed?.last_error_code};
  },{queue:queuePath,worker:workerPath});
  expect(result).toEqual({status:'FAILED',error:'MEETING_NOT_IN_PROGRESS'});
});

test('fresh derivation preserves prior LAST/NEXT when a new active Meeting is empty, then switches to new checkpoint',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async(path)=>{
    const mod=await import(path);
    const classroom={id:'c1',workspace_id:'w',academic_period_id:'p',identity_key:'viii-a',display_name:'VIII A',status:'active'};
    const m1={id:'m1',workspace_id:'w',class_id:'c1',lesson_id:null,lesson_version_id:null,occurred_at:'2026-09-04T08:00:00Z',status:'completed'};
    const m2={id:'m2',workspace_id:'w',class_id:'c1',lesson_id:null,lesson_version_id:null,occurred_at:'2026-09-05T08:00:00Z',status:'in_progress'};
    const oldCp={id:'cp1',workspace_id:'w',meeting_id:'m1',sequence_no:1,stopped_at:'Halaman 37, contoh gaya gesek nomor 2',next_step:'Bahas nomor 3 lalu latihan mandiri',recorded_at:'2026-09-04T09:00:00Z'};
    const empty=mod.deriveClassContinuity([classroom],{materials:[],lessons:[],lessonVersions:[],meetings:[m1,m2],checkpoints:[oldCp],activities:[],activityMeetings:[]})[0];
    const newCp={id:'cp2',workspace_id:'w',meeting_id:'m2',sequence_no:1,stopped_at:'Halaman 39',next_step:'Latihan mandiri',recorded_at:'2026-09-05T09:00:00Z'};
    const updated=mod.deriveClassContinuity([classroom],{materials:[],lessons:[],lessonVersions:[],meetings:[m1,m2],checkpoints:[oldCp,newCp],activities:[],activityMeetings:[]})[0];
    return{
      empty:{active:empty.activeMeeting?.id,last:empty.latestMeaningfulCheckpoint?.stopped_at,next:empty.latestMeaningfulCheckpoint?.next_step},
      updated:{active:updated.activeMeeting?.id,last:updated.latestMeaningfulCheckpoint?.stopped_at,next:updated.latestMeaningfulCheckpoint?.next_step},
    };
  },teachingPath);
  expect(result.empty).toEqual({active:'m2',last:'Halaman 37, contoh gaya gesek nomor 2',next:'Bahas nomor 3 lalu latihan mandiri'});
  expect(result.updated).toEqual({active:'m2',last:'Halaman 39',next:'Latihan mandiri'});
});

test('real multi-page durable checkpoint blocks Complete and Cancel until saved, with cross-tab notification',async({page,context})=>{
  const pageA=page;
  const pageB=await context.newPage();
  await Promise.all([pageA.goto('/'),pageB.goto('/')]);
  const dbName='r34-continuity-multitab-proof';
  const ids={auth:'A',workspace:'WA',meeting:'M1'};

  const initial=await pageA.evaluate(async({queue,coord,dbName,ids})=>{
    const local=await import(queue);
    const coordination=await import(coord);
    const db=new local.SafeWorkDb(dbName);
    await db.operations.clear();
    const pending=await local.pendingMeetingCheckpoints(db,ids.auth,ids.workspace,ids.meeting);
    db.close();
    (window as unknown as {safeSignals:number}).safeSignals=0;
    coordination.subscribeSafeWorkChanges((signal:{operation_kind:string;entity_id:string})=>{
      if(signal.operation_kind==='meeting.checkpoint'&&signal.entity_id===ids.meeting)(window as unknown as {safeSignals:number}).safeSignals++;
    });
    return pending.length;
  },{queue:queuePath,coord:coordinationPath,dbName,ids});
  expect(initial).toBe(0);

  await pageB.evaluate(async({queue,safety,dbName,ids})=>{
    const local=await import(queue);
    const guard=await import(safety);
    const db=new local.SafeWorkDb(dbName);
    await guard.withMeetingContinuityLock(ids.auth,ids.workspace,ids.meeting,()=>local.enqueueMeetingCheckpoint(db,{authUserId:ids.auth,workspaceId:ids.workspace,meetingId:ids.meeting,stoppedAt:'Halaman 37',nextStep:'Nomor 3',opId:'b1000000-0000-0000-0000-000000000001'}));
    db.close();
  },{queue:queuePath,safety:safetyPath,dbName,ids});

  const completeBlocked=await pageA.evaluate(async({queue,safety,dbName,ids})=>{
    const local=await import(queue);
    const guard=await import(safety);
    const db=new local.SafeWorkDb(dbName);
    let rpcCalls=0;
    const gate=await guard.withMeetingLifecyclePreflight(db,ids.auth,ids.workspace,ids.meeting,async()=>{rpcCalls++;return'completed';});
    if(gate.blocked)document.body.innerHTML='<p id="continuity-notice">Checkpoint belum tersinkron untuk Meeting ini. Selesaikan recovery/sync checkpoint sebelum Complete atau Cancel.</p>';
    const durable=(await local.pendingMeetingCheckpoints(db,ids.auth,ids.workspace,ids.meeting)).length;
    db.close();
    return{blocked:gate.blocked,rpcCalls,durable};
  },{queue:queuePath,safety:safetyPath,dbName,ids});
  expect(completeBlocked).toEqual({blocked:true,rpcCalls:0,durable:1});
  await expect(pageA.locator('#continuity-notice')).toContainText('Checkpoint belum tersinkron');

  const signalsBeforeSave=await pageA.evaluate(()=>(window as unknown as {safeSignals:number}).safeSignals);
  await pageB.evaluate(async({queue,dbName})=>{
    const local=await import(queue);
    const db=new local.SafeWorkDb(dbName);
    await local.markSavedAndMinimize(db,'b1000000-0000-0000-0000-000000000001');
    db.close();
  },{queue:queuePath,dbName});
  await expect.poll(()=>pageA.evaluate(()=>(window as unknown as {safeSignals:number}).safeSignals)).toBeGreaterThan(signalsBeforeSave);

  const completeAllowed=await pageA.evaluate(async({queue,safety,dbName,ids})=>{
    const local=await import(queue);const guard=await import(safety);const db=new local.SafeWorkDb(dbName);let rpcCalls=0;
    const gate=await guard.withMeetingLifecyclePreflight(db,ids.auth,ids.workspace,ids.meeting,async()=>{rpcCalls++;return'completed';});
    const durable=(await local.pendingMeetingCheckpoints(db,ids.auth,ids.workspace,ids.meeting)).length;db.close();return{blocked:gate.blocked,rpcCalls,durable};
  },{queue:queuePath,safety:safetyPath,dbName,ids});
  expect(completeAllowed).toEqual({blocked:false,rpcCalls:1,durable:0});

  await pageB.evaluate(async({queue,safety,dbName,ids})=>{
    const local=await import(queue);const guard=await import(safety);const db=new local.SafeWorkDb(dbName);
    await guard.withMeetingContinuityLock(ids.auth,ids.workspace,ids.meeting,()=>local.enqueueMeetingCheckpoint(db,{authUserId:ids.auth,workspaceId:ids.workspace,meetingId:ids.meeting,stoppedAt:'Cancel guard',nextStep:null,opId:'b1000000-0000-0000-0000-000000000002'}));db.close();
  },{queue:queuePath,safety:safetyPath,dbName,ids});
  const cancelBlocked=await pageA.evaluate(async({queue,safety,dbName,ids})=>{
    const local=await import(queue);const guard=await import(safety);const db=new local.SafeWorkDb(dbName);let rpcCalls=0;
    const gate=await guard.withMeetingLifecyclePreflight(db,ids.auth,ids.workspace,ids.meeting,async()=>{rpcCalls++;return'cancelled';});
    const durable=(await local.pendingMeetingCheckpoints(db,ids.auth,ids.workspace,ids.meeting)).length;db.close();return{blocked:gate.blocked,rpcCalls,durable};
  },{queue:queuePath,safety:safetyPath,dbName,ids});
  expect(cancelBlocked).toEqual({blocked:true,rpcCalls:0,durable:1});

  await pageB.evaluate(async({queue,dbName})=>{const local=await import(queue);const db=new local.SafeWorkDb(dbName);await local.markSavedAndMinimize(db,'b1000000-0000-0000-0000-000000000002');db.close();},{queue:queuePath,dbName});
  const cancelAllowed=await pageA.evaluate(async({queue,safety,dbName,ids})=>{const local=await import(queue);const guard=await import(safety);const db=new local.SafeWorkDb(dbName);let rpcCalls=0;const gate=await guard.withMeetingLifecyclePreflight(db,ids.auth,ids.workspace,ids.meeting,async()=>{rpcCalls++;return'cancelled';});const durable=(await local.pendingMeetingCheckpoints(db,ids.auth,ids.workspace,ids.meeting)).length;db.close();return{blocked:gate.blocked,rpcCalls,durable};},{queue:queuePath,safety:safetyPath,dbName,ids});
  expect(cancelAllowed).toEqual({blocked:false,rpcCalls:1,durable:0});
});

test('single-tab lifecycle preflight allows normal flow when durable queue is empty',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async({queue,safety})=>{
    const local=await import(queue);const guard=await import(safety);const db=new local.SafeWorkDb('r34-continuity-single-tab-proof');await db.operations.clear();let calls=0;const gate=await guard.withMeetingLifecyclePreflight(db,'A','WA','M1',async()=>{calls++;return'ok';});db.close();return{blocked:gate.blocked,calls};
  },{queue:queuePath,safety:safetyPath});
  expect(result).toEqual({blocked:false,calls:1});
});
