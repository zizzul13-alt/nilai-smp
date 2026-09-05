import { expect, test } from '@playwright/test';

const queuePath='/src/services/safeWork/localQueue.ts';
const workerPath='/src/services/safeWork/syncWorker.ts';
const teachingPath='/src/services/academic/teachingCore.ts';

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

test('auth expiry keeps checkpoint durable and retryable instead of claiming Saved',async({page})=>{
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

test('fresh UI derivation restores active Meeting and latest checkpoint from canonical truth',async({page})=>{
  const derive=async()=>page.evaluate(async(path)=>{
    const mod=await import(path);
    const classroom={id:'c1',workspace_id:'w',academic_period_id:'p',identity_key:'viii-a',display_name:'VIII A',status:'active'};
    const meeting={id:'m1',workspace_id:'w',class_id:'c1',lesson_id:null,lesson_version_id:null,occurred_at:'2026-09-05T08:00:00Z',status:'in_progress'};
    const checkpoints=[
      {id:'cp1',workspace_id:'w',meeting_id:'m1',sequence_no:1,stopped_at:'Halaman 37',next_step:'Nomor 3',recorded_at:'2026-09-05T09:00:00Z'},
      {id:'cp2',workspace_id:'w',meeting_id:'m1',sequence_no:2,stopped_at:'Halaman 39',next_step:'Latihan mandiri',recorded_at:'2026-09-05T09:30:00Z'},
    ];
    const core={materials:[],lessons:[],lessonVersions:[],meetings:[meeting],checkpoints,activities:[],activityMeetings:[]};
    const state=mod.deriveClassContinuity([classroom],core)[0];
    return{state:state.state,meeting:state.activeMeeting?.id,last:state.latestCheckpoint?.stopped_at,next:state.latestCheckpoint?.next_step};
  },teachingPath);

  await page.goto('/');
  expect(await derive()).toEqual({state:'active',meeting:'m1',last:'Halaman 39',next:'Latihan mandiri'});
  await page.reload();
  expect(await derive()).toEqual({state:'active',meeting:'m1',last:'Halaman 39',next:'Latihan mandiri'});
});
