import {useCallback,useEffect,useMemo,useRef,useState} from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import type{AssessmentJudgementPayload,MeetingCheckpointPayload}from'../domain/safeWork';
import{pendingForNamespace,safeWorkDb}from'../services/safeWork/localQueue';
import{subscribeSafeWorkChanges}from'../services/safeWork/coordination';
import{classifyReentryAge,deriveTodayModel,latestLocalCheckpointForMeeting,loadTodayServer,recordContinuityBaseline,resolveMeetingClass,type ReentryKind,type TodayClassContext,type TodayServerSnapshot}from'../services/academic/today';
import{derivePlannedSuggestion,loadPlannedScheduleContexts,type PlannedSuggestion}from'../services/academic/plannedTimetable';

type Props={client:SupabaseClient;userId:string;workspaceId:string;onOpenContinuity:(classId?:string)=>void;onOpenRapid:(assessmentId?:string)=>void};
type LoadState={status:'loading'}|{status:'error'}|{status:'ready';snapshot:TodayServerSnapshot;ops:Awaited<ReturnType<typeof pendingForNamespace>>};
type Editor={classId:string;kind:ReentryKind;stoppedAt:string;nextStep:string};
const CHECKPOINT_RECONCILE_WARNING='Status checkpoint berubah. Halaman Hari ini belum dapat menyelaraskan konteks server; konteks lokal terakhir tetap ditampilkan.';
function localNow(){const d=new Date(),pad=(n:number)=>String(n).padStart(2,'0');return{date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,weekday:d.getDay()===0?7:d.getDay(),time:`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};}

export function Today({client,userId,workspaceId,onOpenContinuity,onOpenRapid}:Props){
  const[state,setState]=useState<LoadState>({status:'loading'}),[editor,setEditor]=useState<Editor|null>(null),[notice,setNotice]=useState(''),[planned,setPlanned]=useState<PlannedSuggestion>({kind:'none'});
  const baselineAttempt=useRef<{fingerprint:string;opId:string}|null>(null);
  const localRefreshSeq=useRef(0),checkpointRefreshSeq=useRef(0);
  const refresh=useCallback(async()=>{
    setState({status:'loading'});setNotice('');
    try{const[snapshot,ops,slots]=await Promise.all([loadTodayServer(client),pendingForNamespace(safeWorkDb,userId,workspaceId),loadPlannedScheduleContexts(client,workspaceId)]);setPlanned(derivePlannedSuggestion(slots,localNow()));setState({status:'ready',snapshot,ops});}
    catch{setState({status:'error'});}
  },[client,userId,workspaceId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>subscribeSafeWorkChanges(signal=>{
    if(signal.auth_user_id!==userId||signal.workspace_id!==workspaceId||state.status!=='ready')return;
    const localSeq=++localRefreshSeq.current;
    void pendingForNamespace(safeWorkDb,userId,workspaceId).then(ops=>{
      if(localRefreshSeq.current!==localSeq)return;
      setState(current=>{
        if(current.status!=='ready')return current;
        if(signal.operation_kind!=='meeting.checkpoint')return{...current,ops};
        const prior=current.ops.find(op=>op.op_id===signal.op_id);
        if(!prior||ops.some(op=>op.op_id===signal.op_id))return{...current,ops};
        return{...current,ops:[...ops,prior].sort((a,b)=>a.created_at.localeCompare(b.created_at))};
      });
    });
    if(signal.operation_kind!=='meeting.checkpoint')return;
    const checkpointSeq=++checkpointRefreshSeq.current;
    void loadTodayServer(client).then(async snapshot=>{
      if(checkpointRefreshSeq.current!==checkpointSeq)return;
      const ops=await pendingForNamespace(safeWorkDb,userId,workspaceId);
      if(checkpointRefreshSeq.current!==checkpointSeq)return;
      ++localRefreshSeq.current;
      setState(current=>current.status==='ready'?{status:'ready',snapshot,ops}:current);
      setNotice(current=>current===CHECKPOINT_RECONCILE_WARNING?'':current);
    }).catch(()=>{if(checkpointRefreshSeq.current===checkpointSeq)setNotice(CHECKPOINT_RECONCILE_WARNING);});
  }),[client,state.status,userId,workspaceId]);

  const model=useMemo(()=>state.status==='ready'?deriveTodayModel(state.snapshot,state.ops,new Date(),planned):null,[state,planned]);
  const classes=state.status==='ready'?state.snapshot.classes:[];
  const findClass=(id:string)=>classes.find(c=>c.class_id===id)??null;
  const openEditor=(context:TodayClassContext,kind:ReentryKind)=>{baselineAttempt.current=null;setEditor({classId:context.class_id,kind,stoppedAt:'',nextStep:''});setNotice('');};
  const edit=(patch:Partial<Editor>)=>{baselineAttempt.current=null;setEditor(current=>current?{...current,...patch}:current);};
  async function saveBaseline(){
    if(!editor||state.status!=='ready')return;
    const fingerprint=JSON.stringify(editor);if(baselineAttempt.current?.fingerprint!==fingerprint)baselineAttempt.current={fingerprint,opId:crypto.randomUUID()};
    try{await recordContinuityBaseline(client,{opId:baselineAttempt.current.opId,classId:editor.classId,kind:editor.kind,stoppedAt:editor.stoppedAt,nextStep:editor.nextStep});setNotice(editor.kind==='START_FROM_TODAY'?'Baseline baru disimpan. Riwayat lama tetap dipertahankan.':'Pembaruan cepat disimpan sebagai baseline baru; riwayat lama tidak diubah.');setEditor(null);baselineAttempt.current=null;try{const snapshot=await loadTodayServer(client);setState(current=>current.status==='ready'?{...current,snapshot}:current);}catch{setNotice('Baseline tersimpan di server. Halaman Hari ini belum dapat dimuat ulang; jangan anggap penulisan gagal.');}}
    catch(error){setNotice(error instanceof Error?error.message:'Baseline belum terkonfirmasi.');}
  }

  if(state.status==='loading')return<section className="today-shell"><p className="eyebrow">Hari ini</p><h1>Menentukan yang perlu dilanjutkan…</h1></section>;
  if(state.status==='error')return<section className="today-shell"><p className="eyebrow">Hari ini</p><h1>Halaman Hari ini belum dapat dimuat</h1><p>Keadaan saat ini belum diketahui. Ini bukan berarti tidak ada pekerjaan.</p><button type="button" onClick={()=>void refresh()}>Coba lagi</button></section>;
  if(!model)return null;
  const primary=model.primary;
  const primaryClass=primary&&'classId'in primary?findClass(primary.classId):null;
  const plannedPrimary=primary?.kind==='start-class'&&planned.kind!=='none'&&planned.slot.class_id===primary.classId?planned:null;
  const correction=state.snapshot.correction;
  const firstRecovery=state.ops.find(op=>op.operation_kind==='meeting.checkpoint'||op.operation_kind==='assessment.judgement')??null;
  const activeLocalCheckpoint=primary?.kind==='continue-class'&&primaryClass?latestLocalCheckpointForMeeting(state.ops,primaryClass.active_meeting_id):null;
  const activeLocalPayload=activeLocalCheckpoint?.payload as MeetingCheckpointPayload|undefined;
  const activeStoppedAt=activeLocalPayload?activeLocalPayload.stopped_at:primaryClass?.effective_stopped_at;
  const activeNextStep=activeLocalPayload?activeLocalPayload.next_step:primaryClass?.effective_next_step;
  async function openRecovery(){if(!firstRecovery)return;if(firstRecovery.operation_kind==='meeting.checkpoint'){try{const classId=await resolveMeetingClass(client,workspaceId,firstRecovery.entity_id);if(!classId){setNotice('Kelas untuk checkpoint ini belum dapat ditentukan.');return;}setNotice('');onOpenContinuity(classId);}catch{setNotice('Kelas untuk checkpoint ini belum dapat ditentukan.');}}else onOpenRapid((firstRecovery.payload as AssessmentJudgementPayload).assessment_id);}
  function runPrimary(){if(!primary)return;if(primary.kind==='continue-class'||primary.kind==='start-class')onOpenContinuity(primary.classId);else if(primary.kind==='resume-correction')onOpenRapid(primary.assessmentId);else if(primaryClass)openEditor(primaryClass,'QUICK_UPDATE');}
  const primaryLabel=primary?.kind==='continue-class'?'LANJUTKAN KELAS':primary?.kind==='resume-correction'?'LANJUTKAN KOREKSI':primary?.kind==='quick-update'?'PERBARUI KONTEKS':primary?.kind==='start-class'?'MULAI KELAS':'';

  return<section className="today-shell">
    <header><p className="eyebrow">Hari ini · ringkasan</p><h1>Apa yang penting sekarang?</h1></header>
    <section className="today-section today-now"><h2>SEKARANG</h2>
      {primary?.kind==='continue-class'&&primaryClass?<><strong>{primaryClass.class_name} · Pertemuan aktif</strong><div className="today-memory"><div><small>TERAKHIR</small><b>{activeStoppedAt??'Belum ada checkpoint'}</b></div><div><small>BERIKUTNYA</small><b>{activeNextStep??'Belum dicatat'}</b></div></div>{activeLocalCheckpoint?<p className="safety-badge">{activeLocalCheckpoint.status==='PENDING_SAFE'?'PENDING SAFE · belum terkonfirmasi server':`${activeLocalCheckpoint.status} · konteks lokal belum diterima server`}</p>:null}{primaryClass.active_lesson_title?<p className="muted">Pelajaran: {primaryClass.active_lesson_title}</p>:null}</>:null}
      {primary?.kind==='resume-correction'&&correction?<><strong>{correction.assessment_title}</strong><p>{correction.class_name} · koreksi aktif{correction.active_count>1?` · ${correction.active_count} sesi aktif`:''}</p></>:null}
      {plannedPrimary?<><strong>{plannedPrimary.slot.class_name}</strong><p className="muted">{plannedPrimary.kind==='likely-now'?'Sesuai jadwal sekarang':'Kelas terdekat berikutnya'} · {plannedPrimary.slot.local_start_time.slice(0,5)}–{plannedPrimary.slot.local_end_time.slice(0,5)}</p>{plannedPrimary.ambiguous.length?<p className="today-stale">Ada {plannedPrimary.ambiguous.length+1} jadwal yang sama-sama mungkin. Pilihan ini hanya saran; pilih kelas manual bila perlu.</p>:null}</>:null}
      {(primary?.kind==='start-class'||primary?.kind==='quick-update')&&primaryClass&&!plannedPrimary?<><strong>{primaryClass.class_name}</strong>{primaryClass.effective_stopped_at?<><p className={classifyReentryAge(primaryClass.effective_recorded_at)==='stale'?'today-stale':''}>{classifyReentryAge(primaryClass.effective_recorded_at)==='stale'?'Konteks lama — cek kembali sebelum dipakai sebagai kebenaran hari ini.':'Konteks terakhir masih baru.'}</p><div className="today-memory"><div><small>TERAKHIR</small><b>{primaryClass.effective_stopped_at}</b></div><div><small>BERIKUTNYA</small><b>{primaryClass.effective_next_step??'Belum dicatat'}</b></div></div></>:<p>Belum ada Pertemuan atau konteks sebelumnya. Mulai Kelas tetap eksplisit.</p>}</>:null}
      {primary?<button type="button" className="today-primary" onClick={runPrimary}>{primaryLabel}</button>:model.empty?<p><strong>Tidak ada pekerjaan yang perlu perhatian.</strong> Tidak ada jadwal yang perlu dikonfigurasi agar halaman Hari ini tetap aman. Mulai kelas tetap tersedia secara manual dari Mengajar.</p>:<p><strong>Tidak ada pekerjaan utama sekarang.</strong> Ada hal yang perlu diselesaikan sebelum meninggalkan pekerjaan.</p>}
      {primary?.kind==='quick-update'&&primaryClass?<button type="button" className="secondary" onClick={()=>openEditor(primaryClass,'START_FROM_TODAY')}>MULAI DARI HARI INI</button>:null}
    </section>
    {editor?<section className="today-section reentry-editor"><h2>{editor.kind==='QUICK_UPDATE'?'PERBARUI KONTEKS':'MULAI DARI HARI INI'}</h2><p>{editor.kind==='QUICK_UPDATE'?'Catat yang benar sekarang tanpa mengubah checkpoint lama.':'Buat baseline kerja baru; sejarah dan pekerjaan lama yang belum selesai tetap ada.'}</p><label className="field-label">TERAKHIR / BERHENTI DI<input value={editor.stoppedAt} onChange={e=>edit({stoppedAt:e.target.value})} placeholder="Kondisi nyata sekarang"/></label><label className="field-label">LANGKAH BERIKUTNYA<input value={editor.nextStep} onChange={e=>edit({nextStep:e.target.value})} placeholder="Langkah berikutnya"/></label><div className="today-actions"><button type="button" disabled={!editor.stoppedAt.trim()} onClick={()=>void saveBaseline()}>Simpan baseline</button><button type="button" className="secondary" onClick={()=>setEditor(null)}>Batal</button></div></section>:null}
    {notice?<p className="work-message" role="status">{notice}</p>:null}
    <section className="today-section"><h2>SEBELUM SELESAI</h2>{model.beforeLeaving.length===0?<p>Tidak ada hal yang perlu diamankan atau ditutup sekarang.</p>:<div className="today-list">{model.beforeLeaving.map((item,index)=><div className="today-item" key={`${item.kind}-${index}`}><strong>{item.title}</strong><span>{item.detail}</span>{item.classId?<button type="button" className="secondary" onClick={()=>onOpenContinuity(item.classId)}>Buka Mengajar</button>:item.assessmentId?<button type="button" className="secondary" onClick={()=>onOpenRapid(item.assessmentId)}>Lanjutkan koreksi</button>:item.kind==='safe-work'&&firstRecovery?<button type="button" className="secondary" onClick={()=>void openRecovery()}>Buka pemulihan</button>:null}</div>)}</div>}</section>
    <section className="today-section"><h2>NANTI · KONTEKS TERBARU</h2>{model.later.length===0?<p>Belum ada Kelas aktif atau konteks kontinuitas. Tidak ada “kelas berikutnya” yang dibuat-buat.</p>:<div className="today-list">{model.later.map(context=>{const age=classifyReentryAge(context.effective_recorded_at);return<div className="today-item" key={context.class_id}><strong>{context.class_name}{context.active_meeting_id?' · SEDANG BERJALAN':''}</strong>{context.effective_stopped_at?<><span className={age==='stale'?'today-stale':''}>{age==='stale'?'Konteks lama':'Konteks terbaru'} · TERAKHIR: {context.effective_stopped_at}</span><span>BERIKUTNYA: {context.effective_next_step??'—'}</span></>:<span>Belum ada fakta kontinuitas. Mulai Kelas tetap manual.</span>}<button type="button" className="secondary" onClick={()=>onOpenContinuity(context.class_id)}>Buka Mengajar</button>{age==='stale'&&!context.active_meeting_id?<div className="today-actions"><button type="button" className="secondary" onClick={()=>openEditor(context,'QUICK_UPDATE')}>Perbarui konteks</button><button type="button" className="secondary" onClick={()=>openEditor(context,'START_FROM_TODAY')}>Mulai dari hari ini</button></div>:null}</div>})}</div>}</section>
  </section>;
}
