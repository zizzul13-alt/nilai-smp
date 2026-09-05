import{expect,test}from'@playwright/test';
const fixturePath='/tests/e2e/fixtures/safe-work-v2.ts',queuePath='/src/services/safeWork/localQueue.ts',workerPath='/src/services/safeWork/syncWorker.ts';

test('Dexie v3 normalizes only proven-unsent legacy Rapid Correction work and quarantines uncertain rows',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async({fixturePath,queuePath,workerPath})=>{
    const fixture=await import(fixturePath),queue=await import(queuePath),sync=await import(workerPath);
    const name=`legacy-rapid-upgrade-${crypto.randomUUID()}`,created=(n:number)=>`2026-09-05T00:00:${String(n).padStart(2,'0')}.000Z`;
    const assessment=(opId:string,enrollmentId:string,kind:any,evidence:Record<string,unknown>,attemptCount:number,status:any,rawScore:number|null=85,lastError:string|null=null,conflict:any=null)=>({
      op_id:opId,auth_user_id:'u',workspace_id:'w',entity_type:'assessment_result' as const,entity_id:enrollmentId,causal_key:`assessment_result:a:${enrollmentId}`,operation_kind:'assessment.judgement' as const,
      payload:{assessment_id:'a',enrollment_id:enrollmentId,state:'GRADED' as const,score:85,attempt_kind:kind,raw_score:rawScore,evidence},created_at:created(Number(enrollmentId.replace(/\D/g,''))||1),attempt_count:attemptCount,last_attempt_at:attemptCount?created(20):null,status,expected_revision:3,last_error_code:lastError,conflict_snapshot:conflict,
    });
    const rows:any[]=[
      assessment('safe-legacy','e1','CORRECTION',{source:'rapid-correction'},0,'PENDING_SAFE'),
      assessment('attempted-legacy','e2','CORRECTION',{source:'rapid-correction'},1,'PENDING_SAFE'),
      assessment('failed-legacy','e3','CORRECTION',{source:'rapid-correction'},1,'FAILED',85,'SERVER_ERROR'),
      assessment('conflict-legacy','e4','CORRECTION',{source:'rapid-correction'},1,'CONFLICT',85,'REVISION_CONFLICT',{canonical_state:'GRADED',canonical_score:80,canonical_revision:4}),
      assessment('legit-correction','e5','CORRECTION',{source:'teacher-explicit'},0,'PENDING_SAFE',90),
      assessment('original-rapid-source','e6','ORIGINAL',{source:'rapid-correction'},0,'PENDING_SAFE',86),
      assessment('makeup-rapid-source','e7','MAKEUP',{source:'rapid-correction'},0,'PENDING_SAFE',87),
      assessment('remedial-rapid-source','e8','REMEDIAL',{source:'rapid-correction'},0,'PENDING_SAFE',88),
      {op_id:'student-rename',auth_user_id:'u',workspace_id:'w',entity_type:'student',entity_id:'s1',causal_key:'student:s1',operation_kind:'student.rename',payload:{display_name:'Nama Baru'},created_at:created(9),attempt_count:0,last_attempt_at:null,status:'PENDING_SAFE',expected_revision:1,last_error_code:null,conflict_snapshot:null},
      {op_id:'meeting-checkpoint',auth_user_id:'u',workspace_id:'w',entity_type:'meeting_checkpoint',entity_id:'m1',causal_key:'meeting_checkpoint:m1',operation_kind:'meeting.checkpoint',payload:{meeting_id:'m1',stopped_at:'Halaman 37',next_step:'Nomor 3'},created_at:created(10),attempt_count:0,last_attempt_at:null,status:'PENDING_SAFE',expected_revision:0,last_error_code:null,conflict_snapshot:null},
      assessment('normal-lost-ack','e11','ORIGINAL',{source:'teacher-explicit'},2,'PENDING_SAFE',91),
    ];
    await fixture.seedSafeWorkV2(name,rows);
    const db=new queue.SafeWorkDb(name);await db.open();
    const upgraded=await db.operations.toArray(),byId=(id:string)=>upgraded.find((x:any)=>x.op_id===id);
    const safe=structuredClone(byId('safe-legacy')),attempted=structuredClone(byId('attempted-legacy')),failed=structuredClone(byId('failed-legacy')),conflict=structuredClone(byId('conflict-legacy'));
    const legit=structuredClone(byId('legit-correction')),original=structuredClone(byId('original-rapid-source')),makeup=structuredClone(byId('makeup-rapid-source')),remedial=structuredClone(byId('remedial-rapid-source')),student=structuredClone(byId('student-rename')),checkpoint=structuredClone(byId('meeting-checkpoint')),lostAck=structuredClone(byId('normal-lost-ack'));

    let retryError='',failedRetryError='',conflictApplyError='';
    try{await queue.retryOperation(db,'attempted-legacy');}catch(e){retryError=e instanceof Error?e.message:String(e);}
    try{await queue.retryOperation(db,'failed-legacy');}catch(e){failedRetryError=e instanceof Error?e.message:String(e);}
    try{await queue.applyLocalAsNewJudgement(db,'conflict-legacy');}catch(e){conflictApplyError=e instanceof Error?e.message:String(e);}
    const afterGuardAttempted=structuredClone(await db.operations.get('attempted-legacy')),afterGuardFailed=structuredClone(await db.operations.get('failed-legacy')),afterGuardConflict=structuredClone(await db.operations.get('conflict-legacy'));

    const rpcCalls:any[]=[];
    const client={rpc:async(name:string,args:any)=>{rpcCalls.push({name,args});if(name==='apply_meeting_checkpoint_operation')return{data:[{sequence_no:1,replayed:false}],error:null};return{data:[{outcome:'saved',revision:10,replayed:true,state:'GRADED',score:85}],error:null};}} as any;
    const worker=new sync.SafeWorkSyncWorker(db,client);await worker.syncNamespace('u','w');
    const afterSyncAttempted=structuredClone(await db.operations.get('attempted-legacy')),afterSyncFailed=structuredClone(await db.operations.get('failed-legacy')),afterSyncConflict=structuredClone(await db.operations.get('conflict-legacy'));
    const normalLostAckCall=rpcCalls.find((x:any)=>x.args?.p_op_id==='normal-lost-ack')??null,uncertainCalls=rpcCalls.filter((x:any)=>['attempted-legacy','failed-legacy','conflict-legacy'].includes(x.args?.p_op_id));
    const normalLostAckRemaining=await db.operations.get('normal-lost-ack');
    const version=db.verno;await db.delete();
    return{version,safe,attempted,failed,conflict,legit,original,makeup,remedial,student,checkpoint,lostAck,retryError,failedRetryError,conflictApplyError,afterGuardAttempted,afterGuardFailed,afterGuardConflict,afterSyncAttempted,afterSyncFailed,afterSyncConflict,normalLostAckCall,uncertainCalls,normalLostAckRemaining};
  },{fixturePath,queuePath,workerPath});

  expect(result.version).toBe(3);
  expect(result.safe).toMatchObject({op_id:'safe-legacy',causal_key:'assessment_result:a:e1',expected_revision:3,status:'PENDING_SAFE',attempt_count:0,last_attempt_at:null,last_error_code:null});
  expect(result.safe.payload).toMatchObject({attempt_kind:null,raw_score:null,evidence:{},score:85,state:'GRADED'});
  expect(result.attempted).toMatchObject({op_id:'attempted-legacy',status:'FAILED',attempt_count:1,last_error_code:'LEGACY_ATTEMPT_KIND_UNCERTAIN'});
  expect(result.attempted.payload).toMatchObject({attempt_kind:'CORRECTION',raw_score:85,evidence:{source:'rapid-correction'}});
  expect(result.retryError).toContain('generic retry is blocked');
  expect(result.afterGuardAttempted).toEqual(result.attempted);

  expect(result.failed).toMatchObject({status:'FAILED',last_error_code:'SERVER_ERROR',attempt_count:1});
  expect(result.failed.payload).toMatchObject({attempt_kind:'CORRECTION',evidence:{source:'rapid-correction'}});
  expect(result.failedRetryError).toContain('generic retry is blocked');
  expect(result.afterGuardFailed).toEqual(result.failed);
  expect(result.conflict).toMatchObject({status:'CONFLICT',last_error_code:'REVISION_CONFLICT',attempt_count:1});
  expect(result.conflict.payload).toMatchObject({attempt_kind:'CORRECTION',evidence:{source:'rapid-correction'}});
  expect(result.conflictApplyError).toContain('generic retry is blocked');
  expect(result.afterGuardConflict).toEqual(result.conflict);

  expect(result.legit.payload).toMatchObject({attempt_kind:'CORRECTION',raw_score:90,evidence:{source:'teacher-explicit'}});
  expect(result.original.payload).toMatchObject({attempt_kind:'ORIGINAL',evidence:{source:'rapid-correction'}});
  expect(result.makeup.payload).toMatchObject({attempt_kind:'MAKEUP',evidence:{source:'rapid-correction'}});
  expect(result.remedial.payload).toMatchObject({attempt_kind:'REMEDIAL',evidence:{source:'rapid-correction'}});
  expect(result.student).toMatchObject({operation_kind:'student.rename',payload:{display_name:'Nama Baru'},status:'PENDING_SAFE'});
  expect(result.checkpoint).toMatchObject({operation_kind:'meeting.checkpoint',payload:{meeting_id:'m1',stopped_at:'Halaman 37',next_step:'Nomor 3'},status:'PENDING_SAFE'});

  expect(result.lostAck).toMatchObject({op_id:'normal-lost-ack',attempt_count:2,status:'PENDING_SAFE',payload:{attempt_kind:'ORIGINAL',evidence:{source:'teacher-explicit'}}});
  expect(result.normalLostAckCall?.args?.p_op_id).toBe('normal-lost-ack');
  expect(result.normalLostAckRemaining).toBeUndefined();
  expect(result.uncertainCalls).toEqual([]);
  expect(result.afterSyncAttempted).toEqual(result.attempted);
  expect(result.afterSyncFailed).toEqual(result.failed);
  expect(result.afterSyncConflict).toEqual(result.conflict);
});
