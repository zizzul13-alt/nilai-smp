import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MeetingCheckpointPayload, PendingOperation } from '../domain/safeWork';
import {
  loadContinuityContext,
  setTeachingMeetingStatus,
  startTeachingMeeting,
  type ContinuityContext,
  type MeetingLifecycleAction,
} from '../services/academic/teachingCore';
import { withMeetingContinuityLock, withMeetingLifecyclePreflight } from '../services/academic/continuitySafety';
import {
  enqueueMeetingCheckpoint,
  pendingForNamespace,
  retryOperation,
  safeWorkDb,
} from '../services/safeWork/localQueue';
import { checkpointSafetyNotice, withCheckpointRefreshFailure } from '../services/safeWork/checkpointSafety';
import { subscribeSafeWorkChanges } from '../services/safeWork/coordination';
import type { SafeWorkSyncWorker } from '../services/safeWork/syncWorker';

type Props={client:SupabaseClient;worker:SafeWorkSyncWorker;userId:string;workspaceId:string};
type Notice={kind:'info'|'error';text:string}|null;

function checkpointPayload(op:PendingOperation){return op.payload as MeetingCheckpointPayload;}

export function TeachingContinuity({client,worker,userId,workspaceId}:Props){
  const[context,setContext]=useState<ContinuityContext|null>(null);
  const[classId,setClassId]=useState('');
  const[lessonId,setLessonId]=useState('');
  const[lessonVersionId,setLessonVersionId]=useState('');
  const[stoppedAt,setStoppedAt]=useState('');
  const[nextStep,setNextStep]=useState('');
  const[pendingOps,setPendingOps]=useState<PendingOperation[]>([]);
  const[startOpId,setStartOpId]=useState<string|null>(null);
  const[lifecycleAttempt,setLifecycleAttempt]=useState<{meetingId:string;status:MeetingLifecycleAction;opId:string}|null>(null);
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState<Notice>(null);
  const stoppedInput=useRef<HTMLInputElement>(null);

  async function refreshPendingOnly(){
    const pending=await pendingForNamespace(safeWorkDb,userId,workspaceId);
    setPendingOps(pending);
    return pending;
  }

  async function refreshContinuityOnly(){
    const continuity=await loadContinuityContext(client,workspaceId);
    setContext(continuity);
    setClassId(current=>continuity.classes.some(c=>c.id===current)?current:(continuity.classes[0]?.id??''));
    return continuity;
  }

  async function readSnapshot(sync:boolean){
    if(sync)await worker.syncNamespace(userId,workspaceId);
    const[continuity,pending]=await Promise.all([
      loadContinuityContext(client,workspaceId),
      pendingForNamespace(safeWorkDb,userId,workspaceId),
    ]);
    return{continuity,pending};
  }

  useEffect(()=>{
    let mounted=true;
    void readSnapshot(true).then(snapshot=>{
      if(!mounted)return;
      setContext(snapshot.continuity);
      setPendingOps(snapshot.pending);
      setClassId(snapshot.continuity.classes[0]?.id??'');
    }).catch(error=>{
      if(mounted)setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});
    });
    return()=>{mounted=false;};
  },[client,userId,workspaceId,worker]);

  useEffect(()=>subscribeSafeWorkChanges(signal=>{
    if(signal.auth_user_id!==userId||signal.workspace_id!==workspaceId||signal.operation_kind!=='meeting.checkpoint')return;
    void refreshPendingOnly().catch(()=>{/* Durable preflight still re-reads IndexedDB before lifecycle mutation. */});
  }),[userId,workspaceId]);

  const selected=useMemo(()=>context?.byClass.find(item=>item.classroom.id===classId)??null,[context,classId]);
  const activeMeeting=selected?.activeMeeting??null;
  const activeLessons=useMemo(()=>context?.core.lessons.filter(l=>l.status==='active')??[],[context]);
  const versions=useMemo(()=>context?.core.lessonVersions.filter(v=>v.lesson_id===lessonId).sort((a,b)=>b.version_number-a.version_number)??[],[context,lessonId]);
  const selectedClassPending=useMemo(()=>pendingOps.filter(op=>{
    if(op.operation_kind!=='meeting.checkpoint'||!context)return false;
    const meeting=context.core.meetings.find(m=>m.id===op.entity_id);
    return meeting?.class_id===classId;
  }),[pendingOps,context,classId]);
  const currentMeetingPending=activeMeeting?selectedClassPending.filter(op=>op.entity_id===activeMeeting.id):[];
  const latestLocal=currentMeetingPending.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]??null;
  const visibleStopped=latestLocal?checkpointPayload(latestLocal).stopped_at:selected?.latestMeaningfulCheckpoint?.stopped_at??null;
  const visibleNext=latestLocal?checkpointPayload(latestLocal).next_step:selected?.latestMeaningfulCheckpoint?.next_step??null;

  function changeClass(value:string){
    setClassId(value);setLessonId('');setLessonVersionId('');setStartOpId(null);setLifecycleAttempt(null);setNotice(null);
  }
  function changeLesson(value:string){setLessonId(value);setLessonVersionId('');setStartOpId(null);}

  async function startClass(){
    if(!classId||busy)return;
    const opId=startOpId??crypto.randomUUID();
    if(!startOpId)setStartOpId(opId);
    setBusy(true);setNotice(null);
    try{
      const result=await startTeachingMeeting(client,{opId,classId,lessonId:lessonId||null,lessonVersionId:lessonVersionId||null});
      setStartOpId(null);
      const savedText=result.outcome==='continued'?'Meeting aktif sudah ada — konteks yang sama dilanjutkan.':'Class dimulai. Meeting aktual tercatat.';
      setNotice({kind:'info',text:savedText});
      try{await refreshContinuityOnly();}catch{setNotice({kind:'info',text:`${savedText} Latest view belum dapat refresh; coba refresh tampilan.`});}
    }catch(error){
      setNotice({kind:'error',text:`${error instanceof Error?error.message:String(error)} Retry Start Class akan memakai operation id yang sama.`});
    }finally{setBusy(false);}
  }

  async function saveCheckpoint(){
    if(!activeMeeting||busy)return;
    setBusy(true);setNotice(null);
    let op:PendingOperation;

    // Phase 1: durable enqueue only. Nothing after the durable commit may downgrade this truth.
    try{
      op=await withMeetingContinuityLock(userId,workspaceId,activeMeeting.id,()=>enqueueMeetingCheckpoint(safeWorkDb,{authUserId:userId,workspaceId,meetingId:activeMeeting.id,stoppedAt,nextStep}));
    }catch(error){
      setNotice({kind:'error',text:`Failed — checkpoint belum tersimpan aman di perangkat: ${error instanceof Error?error.message:String(error)}`});
      setBusy(false);
      return;
    }
    setNotice({kind:'info',text:'Pending Safe — checkpoint sudah durable di perangkat, belum diklaim Saved.'});
    try{await refreshPendingOnly();}catch{/* Pending Safe remains truthful after the durable enqueue. */}

    // Phase 2: sync, then inspect the exact persisted operation state.
    try{await worker.syncNamespace(userId,workspaceId);}catch{/* Persisted operation below remains authoritative. */}
    let remaining:PendingOperation|undefined;
    try{remaining=await safeWorkDb.operations.get(op.op_id);}catch{
      setNotice({kind:'info',text:'Pending Safe — durable enqueue berhasil; hasil sync belum dapat dibaca. Recovery lokal tetap ada sampai diverifikasi.'});
      setBusy(false);
      return;
    }

    const safetyNotice=checkpointSafetyNotice(remaining);
    setNotice(safetyNotice);
    try{await refreshPendingOnly();}catch{/* Safety state above is independent from recovery-list refresh availability. */}

    if(remaining){
      setBusy(false);
      return;
    }

    // Missing minimized row after sync means server-confirmed Saved.
    setStoppedAt('');setNextStep('');

    // Phase 3: canonical read-model refresh is independent from write safety.
    try{await refreshContinuityOnly();}
    catch(error){setNotice(withCheckpointRefreshFailure(safetyNotice,error));}
    finally{setBusy(false);}
  }

  async function retryCheckpoint(opId:string){
    if(busy)return;
    setBusy(true);setNotice(null);
    try{
      const before=await safeWorkDb.operations.get(opId);
      if(!before){
        const saved=checkpointSafetyNotice(undefined);
        setNotice(saved);
        try{await refreshContinuityOnly();}catch(error){setNotice(withCheckpointRefreshFailure(saved,error));}
        return;
      }
      if(before.status==='CONFLICT'){
        setNotice(checkpointSafetyNotice(before));
        return;
      }
      if(before.status==='FAILED')await retryOperation(safeWorkDb,opId);
      try{await worker.syncNamespace(userId,workspaceId);}catch{/* Persisted status below is authoritative. */}
      const remaining=await safeWorkDb.operations.get(opId);
      const safetyNotice=checkpointSafetyNotice(remaining);
      setNotice(safetyNotice);
      try{await refreshPendingOnly();}catch{/* Persisted operation status already rendered. */}
      if(!remaining){
        try{await refreshContinuityOnly();}catch(error){setNotice(withCheckpointRefreshFailure(safetyNotice,error));}
      }
    }catch(error){setNotice({kind:'error',text:`Status checkpoint tidak dapat diverifikasi: ${error instanceof Error?error.message:String(error)}`});}
    finally{setBusy(false);}
  }

  async function changeMeetingStatus(status:MeetingLifecycleAction){
    if(!activeMeeting||busy)return;
    const attempt=lifecycleAttempt?.meetingId===activeMeeting.id&&lifecycleAttempt.status===status
      ?lifecycleAttempt
      :{meetingId:activeMeeting.id,status,opId:crypto.randomUUID()};
    setLifecycleAttempt(attempt);setBusy(true);setNotice(null);
    try{
      const gate=await withMeetingLifecyclePreflight(safeWorkDb,userId,workspaceId,attempt.meetingId,()=>setTeachingMeetingStatus(client,{opId:attempt.opId,meetingId:attempt.meetingId,status:attempt.status}));
      if(gate.blocked){
        try{await refreshPendingOnly();}catch{/* Fresh durable preflight already proved blocking work exists. */}
        setNotice({kind:'error',text:'Checkpoint belum tersinkron untuk Meeting ini. Selesaikan recovery/sync checkpoint sebelum Complete atau Cancel.'});
        return;
      }
      setLifecycleAttempt(null);
      const savedText=status==='completed'?'Meeting selesai secara eksplisit. Riwayat dan checkpoint dipertahankan.':'Meeting dibatalkan secara eksplisit.';
      setNotice({kind:'info',text:savedText});
      try{await refreshContinuityOnly();await refreshPendingOnly();}
      catch{setNotice({kind:'info',text:`${savedText} Latest view belum dapat refresh; coba refresh tampilan.`});}
    }catch(error){
      setNotice({kind:'error',text:`${error instanceof Error?error.message:String(error)} Retry memakai operation id lifecycle yang sama.`});
    }finally{setBusy(false);}
  }

  if(!context)return <section className="continuity-shell"><p>Memulihkan continuity…</p>{notice?<p role="alert">{notice.text}</p>:null}</section>;

  return <section className="continuity-shell">
    <header>
      <p className="eyebrow">Teaching Continuity</p>
      <h1>Continue without archaeology</h1>
      <label className="field-label">Class
        <select value={classId} onChange={e=>changeClass(e.target.value)}>
          {context.classes.length===0?<option value="">Belum ada Class aktif</option>:null}
          {context.classes.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}
        </select>
      </label>
    </header>

    {!selected?<div className="continuity-empty"><strong>Belum ada Class aktif.</strong><p>Buat/aktifkan Class melalui data akademik sebelum memulai Meeting.</p></div>:<>
      <div className={`continuity-card continuity-card--${selected.state}`}>
        <div className="continuity-status"><strong>{selected.classroom.display_name}</strong><span>{activeMeeting?'IN PROGRESS':selected.latestActualMeeting?selected.latestActualMeeting.status.toUpperCase():'NO MEETING'}</span></div>
        <div className="continuity-memory">
          <div><small>LAST</small><strong>{visibleStopped??'Belum ada checkpoint'}</strong></div>
          <div><small>NEXT</small><strong>{visibleNext??'Belum dicatat'}</strong></div>
        </div>
        {selected.lesson?<p className="muted">Lesson: {selected.lesson.title}{selected.lessonVersion?` · v${selected.lessonVersion.version_number}`:''}</p>:null}
        {latestLocal?<p className="safety-badge">{latestLocal.status} · konteks lokal terbaru</p>:null}
      </div>

      {activeMeeting?<>
        <button type="button" className="continue-primary" onClick={()=>stoppedInput.current?.focus()}>CONTINUE CLASS</button>
        <div className="checkpoint-card">
          <h2>Checkpoint</h2>
          <label className="field-label">STOPPED AT
            <input ref={stoppedInput} value={stoppedAt} onChange={e=>setStoppedAt(e.target.value)} placeholder="Halaman 37, contoh gaya gesek nomor 2" />
          </label>
          <label className="field-label">NEXT STEP
            <input value={nextStep} onChange={e=>setNextStep(e.target.value)} placeholder="Bahas nomor 3 lalu latihan mandiri" />
          </label>
          <button type="button" disabled={busy||!stoppedAt.trim()} onClick={()=>void saveCheckpoint()}>Simpan checkpoint</button>
          <div className="meeting-actions">
            <button type="button" className="secondary" disabled={busy||currentMeetingPending.length>0} onClick={()=>void changeMeetingStatus('cancelled')}>Cancel Meeting</button>
            <button type="button" disabled={busy||currentMeetingPending.length>0} onClick={()=>void changeMeetingStatus('completed')}>Complete Class</button>
          </div>
        </div>
      </>:<div className="start-card">
        <h2>Start Class</h2>
        {selected.latestActualMeeting?<p className="muted">Meeting sebelumnya adalah riwayat. Start Class akan membuat Meeting aktual baru tanpa menghapus LAST/NEXT terakhir.</p>:<p className="muted">Belum ada Meeting sebelumnya untuk Class ini.</p>}
        <label className="field-label">Lesson (opsional)
          <select value={lessonId} onChange={e=>changeLesson(e.target.value)}><option value="">Tanpa Lesson</option>{activeLessons.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select>
        </label>
        {lessonId?<label className="field-label">Exact LessonVersion (opsional)
          <select value={lessonVersionId} onChange={e=>{setLessonVersionId(e.target.value);setStartOpId(null);}}><option value="">Tanpa version pin</option>{versions.map(v=><option key={v.id} value={v.id}>v{v.version_number}</option>)}</select>
        </label>:null}
        <button type="button" className="continue-primary" disabled={busy} onClick={()=>void startClass()}>START CLASS</button>
      </div>}

      {selectedClassPending.length?<div className="recovery-panel">
        <h2>Checkpoint recovery</h2>
        {selectedClassPending.map(op=>{const p=checkpointPayload(op);return <div className="recovery-item" key={op.op_id}><strong>{op.status}</strong><span>LAST: {p.stopped_at}</span><span>NEXT: {p.next_step??'—'}</span><small>{op.last_error_code??'Belum dikonfirmasi server'}</small>{op.status!=='CONFLICT'?<button type="button" className="secondary" disabled={busy} onClick={()=>void retryCheckpoint(op.op_id)}>Coba sync lagi</button>:null}</div>;})}
      </div>:null}
    </>}

    {notice?<p className={notice.kind==='error'?'work-message form-error':'work-message'} role={notice.kind==='error'?'alert':'status'}>{notice.text}</p>:null}
  </section>;
}
