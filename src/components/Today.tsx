import {useCallback,useEffect,useMemo,useRef,useState} from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import type{AssessmentJudgementPayload,MeetingCheckpointPayload}from'../domain/safeWork';
import{pendingForNamespace,safeWorkDb}from'../services/safeWork/localQueue';
import{subscribeSafeWorkChanges}from'../services/safeWork/coordination';
import{classifyReentryAge,deriveTodayModel,latestLocalCheckpointForMeeting,loadTodayServer,recordContinuityBaseline,resolveMeetingClass,type ReentryKind,type TodayClassContext,type TodayServerSnapshot}from'../services/academic/today';

type Props={client:SupabaseClient;userId:string;workspaceId:string;onOpenContinuity:(classId?:string)=>void;onOpenRapid:(assessmentId?:string)=>void};
type LoadState={status:'loading'}|{status:'error'}|{status:'ready';snapshot:TodayServerSnapshot;ops:Awaited<ReturnType<typeof pendingForNamespace>>};
type Editor={classId:string;kind:ReentryKind;stoppedAt:string;nextStep:string};

export function Today({client,userId,workspaceId,onOpenContinuity,onOpenRapid}:Props){
  const[state,setState]=useState<LoadState>({status:'loading'}),[editor,setEditor]=useState<Editor|null>(null),[notice,setNotice]=useState('');
  const baselineAttempt=useRef<{fingerprint:string;opId:string}|null>(null);
  const refresh=useCallback(async()=>{
    setState({status:'loading'});setNotice('');
    try{const[snapshot,ops]=await Promise.all([loadTodayServer(client),pendingForNamespace(safeWorkDb,userId,workspaceId)]);setState({status:'ready',snapshot,ops});}
    catch{setState({status:'error'});}
  },[client,userId,workspaceId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>subscribeSafeWorkChanges(signal=>{if(signal.auth_user_id===userId&&signal.workspace_id===workspaceId&&state.status==='ready')void pendingForNamespace(safeWorkDb,userId,workspaceId).then(ops=>setState(current=>current.status==='ready'?{...current,ops}:current));}),[state.status,userId,workspaceId]);

  const model=useMemo(()=>state.status==='ready'?deriveTodayModel(state.snapshot,state.ops):null,[state]);
  const classes=state.status==='ready'?state.snapshot.classes:[];
  const findClass=(id:string)=>classes.find(c=>c.class_id===id)??null;
  const openEditor=(context:TodayClassContext,kind:ReentryKind)=>{baselineAttempt.current=null;setEditor({classId:context.class_id,kind,stoppedAt:'',nextStep:''});setNotice('');};
  const edit=(patch:Partial<Editor>)=>{baselineAttempt.current=null;setEditor(current=>current?{...current,...patch}:current);};
  async function saveBaseline(){
    if(!editor||state.status!=='ready')return;
    const fingerprint=JSON.stringify(editor);if(baselineAttempt.current?.fingerprint!==fingerprint)baselineAttempt.current={fingerprint,opId:crypto.randomUUID()};
    try{
      await recordContinuityBaseline(client,{opId:baselineAttempt.current.opId,classId:editor.classId,kind:editor.kind,stoppedAt:editor.stoppedAt,nextStep:editor.nextStep});
      setNotice(editor.kind==='START_FROM_TODAY'?'Baseline baru disimpan. Riwayat lama tetap dipertahankan.':'Quick Update disimpan sebagai baseline baru; riwayat lama tidak diubah.');setEditor(null);baselineAttempt.current=null;
      try{const snapshot=await loadTodayServer(client);setState(current=>current.status==='ready'?{...current,snapshot}:current);}catch{setNotice('Baseline tersimpan di server. Today belum dapat refresh; jangan anggap penulisan gagal.');}
    }catch(error){setNotice(error instanceof Error?error.message:'Baseline belum terkonfirmasi.');}
  }

  if(state.status==='loading')return<section className="today-shell"><p className="eyebrow">Today</p><h1>Menentukan yang perlu dilanjutkan…</h1></section>;
  if(state.status==='error')return<section className="today-shell"><p className="eyebrow">Today</p><h1>Today belum dapat dimuat</h1><p>Keadaan saat ini belum diketahui. Ini bukan berarti tidak ada pekerjaan.</p><button type="button" onClick={()=>void refresh()}>Coba lagi</button></section>;
  if(!model)return null;
  const primary=model.primary;
  const primaryClass=primary&&'classId'in primary?findClass(primary.classId):null;
  const correction=state.snapshot.correction;
  const firstRecovery=state.ops.find(op=>op.operation_kind==='meeting.checkpoint'||op.operation_kind==='assessment.judgement')??null;
  const activeLocalCheckpoint=primary?.kind==='continue-class'&&primaryClass?latestLocalCheckpointForMeeting(state.ops,primaryClass.active_meeting_id):null;
  const activeLocalPayload=activeLocalCheckpoint?.payload as MeetingCheckpointPayload|undefined;
  const activeStoppedAt=activeLocalPayload?activeLocalPayload.stopped_at:primaryClass?.effective_stopped_at;
  const activeNextStep=activeLocalPayload?activeLocalPayload.next_step:primaryClass?.effective_next_step;
  async function openRecovery(){
    if(!firstRecovery)return;
    if(firstRecovery.operation_kind==='meeting.checkpoint'){
      try{const classId=await resolveMeetingClass(client,workspaceId,firstRecovery.entity_id);if(!classId){setNotice('Class untuk checkpoint ini belum dapat ditentukan.');return;}setNotice('');onOpenContinuity(classId);}
      catch{setNotice('Class untuk checkpoint ini belum dapat ditentukan.');}
    }else onOpenRapid((firstRecovery.payload as AssessmentJudgementPayload).assessment_id);
  }
  function runPrimary(){
    if(!primary)return;
    if(primary.kind==='continue-class'||primary.kind==='start-class')onOpenContinuity(primary.classId);
    else if(primary.kind==='resume-correction')onOpenRapid(primary.assessmentId);
    else if(primaryClass)openEditor(primaryClass,'QUICK_UPDATE');
  }

  return<section className="today-shell">
    <header><p className="eyebrow">Today · dispatcher</p><h1>Apa yang penting sekarang?</h1></header>
    <section className="today-section today-now"><h2>NOW</h2>
      {primary?.kind==='continue-class'&&primaryClass?<><strong>{primaryClass.class_name} · Meeting aktif</strong><div className="today-memory"><div><small>LAST</small><b>{activeStoppedAt??'Belum ada checkpoint'}</b></div><div><small>NEXT</small><b>{activeNextStep??'Belum dicatat'}</b></div></div>{activeLocalCheckpoint?<p className="safety-badge">{activeLocalCheckpoint.status==='PENDING_SAFE'?'PENDING SAFE · belum terkonfirmasi server':`${activeLocalCheckpoint.status} · konteks lokal belum diterima server`}</p>:null}{primaryClass.active_lesson_title?<p className="muted">Lesson: {primaryClass.active_lesson_title}</p>:null}</>:null}
      {primary?.kind==='resume-correction'&&correction?<><strong>{correction.assessment_title}</strong><p>{correction.class_name} · koreksi aktif{correction.active_count>1?` · ${correction.active_count} sesi aktif`:''}</p></>:null}
      {(primary?.kind==='start-class'||primary?.kind==='quick-update')&&primaryClass?<><strong>{primaryClass.class_name}</strong>{primaryClass.effective_stopped_at?<><p className={classifyReentryAge(primaryClass.effective_recorded_at)==='stale'?'today-stale':''}>{classifyReentryAge(primaryClass.effective_recorded_at)==='stale'?'Konteks lama — cek kembali sebelum dipakai sebagai kebenaran hari ini.':'Konteks terakhir masih recent.'}</p><div className="today-memory"><div><small>LAST</small><b>{primaryClass.effective_stopped_at}</b></div><div><small>NEXT</small><b>{primaryClass.effective_next_step??'Belum dicatat'}</b></div></div></>:<p>Belum ada Meeting atau konteks sebelumnya. Tidak perlu timetable untuk mulai manual.</p>}</>:null}
      {primary?<button type="button" className="today-primary" onClick={runPrimary}>{primary.label}</button>:model.empty?<p><strong>Tidak ada work yang perlu perhatian.</strong> Tidak ada jadwal yang perlu dikonfigurasi agar Today tetap aman.</p>:<p><strong>Tidak ada pekerjaan utama di NOW.</strong> Ada hal yang perlu diselesaikan sebelum meninggalkan.</p>}
      {primary?.kind==='quick-update'&&primaryClass?<button type="button" className="secondary" onClick={()=>openEditor(primaryClass,'START_FROM_TODAY')}>START FROM TODAY</button>:null}
    </section>

    {editor?<section className="today-section reentry-editor"><h2>{editor.kind==='QUICK_UPDATE'?'QUICK UPDATE':'START FROM TODAY'}</h2><p>{editor.kind==='QUICK_UPDATE'?'Catat yang benar sekarang tanpa mengubah checkpoint lama.':'Buat baseline kerja baru; sejarah dan unfinished lama tetap ada.'}</p><label className="field-label">LAST / STOPPED AT<input value={editor.stoppedAt} onChange={e=>edit({stoppedAt:e.target.value})} placeholder="Kondisi nyata sekarang"/></label><label className="field-label">NEXT STEP<input value={editor.nextStep} onChange={e=>edit({nextStep:e.target.value})} placeholder="Langkah berikutnya"/></label><div className="today-actions"><button type="button" disabled={!editor.stoppedAt.trim()} onClick={()=>void saveBaseline()}>Simpan baseline</button><button type="button" className="secondary" onClick={()=>setEditor(null)}>Batal</button></div></section>:null}
    {notice?<p className="work-message" role="status">{notice}</p>:null}

    <section className="today-section"><h2>BEFORE LEAVING</h2>{model.beforeLeaving.length===0?<p>Tidak ada hal yang perlu diamankan atau ditutup sekarang.</p>:<div className="today-list">{model.beforeLeaving.map((item,index)=><div className="today-item" key={`${item.kind}-${index}`}><strong>{item.title}</strong><span>{item.detail}</span>{item.classId?<button type="button" className="secondary" onClick={()=>onOpenContinuity(item.classId)}>Open Teaching</button>:item.assessmentId?<button type="button" className="secondary" onClick={()=>onOpenRapid(item.assessmentId)}>Resume correction</button>:item.kind==='safe-work'&&firstRecovery?<button type="button" className="secondary" onClick={()=>void openRecovery()}>Open recovery surface</button>:null}</div>)}</div>}</section>

    <section className="today-section"><h2>LATER · RECENT CONTEXT</h2>{model.later.length===0?<p>Belum ada Class aktif atau continuity context. Tidak ada "next class" yang difabrikasi.</p>:<div className="today-list">{model.later.map(context=>{const age=classifyReentryAge(context.effective_recorded_at);return<div className="today-item" key={context.class_id}><strong>{context.class_name}{context.active_meeting_id?' · IN PROGRESS':''}</strong>{context.effective_stopped_at?<><span className={age==='stale'?'today-stale':''}>{age==='stale'?'Konteks lama':'Recent context'} · LAST: {context.effective_stopped_at}</span><span>NEXT: {context.effective_next_step??'—'}</span></>:<span>Belum ada continuity fact. Start Class tetap manual.</span>}<button type="button" className="secondary" onClick={()=>onOpenContinuity(context.class_id)}>Open Teaching</button>{age==='stale'&&!context.active_meeting_id?<div className="today-actions"><button type="button" className="secondary" onClick={()=>openEditor(context,'QUICK_UPDATE')}>Quick Update</button><button type="button" className="secondary" onClick={()=>openEditor(context,'START_FROM_TODAY')}>Start From Today</button></div>:null}</div>})}</div>}</section>
  </section>;
}
