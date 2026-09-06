import{useEffect,useMemo,useRef,useState}from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{joinPacingLines,loadActiveCorrectionCount,loadLessonPacingPlan,projectPacingPlan,saveLessonPacingPlan,splitPacingLines,type LessonPacingPlan,type PacingMode}from'../services/academic/pacing';

type Props={client:SupabaseClient;workspaceId:string;classId:string;lessonId:string;lessonVersionId:string|null;actualMeetingCount:number};
type Editor={normalMeetings:string;availableMeetings:string;correctionReserve:string;core:string;practice:string;stretch:string;exit:string;teacherMode:''|PacingMode};
type LoadState={status:'loading'}|{status:'error';message:string}|{status:'ready';plan:LessonPacingPlan|null;activeCorrectionCount:number};

function editorFromPlan(plan:LessonPacingPlan):Editor{return{normalMeetings:String(plan.normal_meetings),availableMeetings:String(plan.available_meetings),correctionReserve:String(plan.correction_reserve),core:joinPacingLines(plan.core_targets),practice:joinPacingLines(plan.practice_targets),stretch:joinPacingLines(plan.stretch_targets),exit:joinPacingLines(plan.minimum_exit_criteria),teacherMode:plan.teacher_mode??''};}
function blankEditor():Editor{return{normalMeetings:'',availableMeetings:'',correctionReserve:'0',core:'',practice:'',stretch:'',exit:'',teacherMode:''};}
function List({title,items}:{title:string;items:string[]}){return<div className="pacing-list"><strong>{title}</strong>{items.length?<ul>{items.map((item,index)=><li key={`${index}-${item}`}>{item}</li>)}</ul>:<p className="muted">Tidak ada.</p>}</div>;}

export function PacingPanel({client,workspaceId,classId,lessonId,lessonVersionId,actualMeetingCount}:Props){
  const[state,setState]=useState<LoadState>({status:'loading'}),[editor,setEditor]=useState<Editor|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const saveAttempt=useRef<{fingerprint:string;opId:string}|null>(null),loadSeq=useRef(0),selectionEpoch=useRef(0);
  const selectionKey=`${workspaceId}:${classId}:${lessonId}`,selectionKeyRef=useRef(selectionKey);selectionKeyRef.current=selectionKey;
  async function reload(expectedEpoch=selectionEpoch.current){
    const requestedSelection=selectionKey;
    if(selectionKeyRef.current!==requestedSelection||selectionEpoch.current!==expectedEpoch)return;
    const seq=++loadSeq.current;
    try{
      const[plan,activeCorrectionCount]=await Promise.all([loadLessonPacingPlan(client,workspaceId,classId,lessonId),loadActiveCorrectionCount(client,workspaceId,classId)]);
      if(selectionKeyRef.current!==requestedSelection||selectionEpoch.current!==expectedEpoch||loadSeq.current!==seq)return;
      setState({status:'ready',plan,activeCorrectionCount});
    }catch(error){
      if(selectionKeyRef.current!==requestedSelection||selectionEpoch.current!==expectedEpoch||loadSeq.current!==seq)return;
      setState({status:'error',message:error instanceof Error?error.message:String(error)});
    }
  }
  useEffect(()=>{
    const epoch=++selectionEpoch.current;++loadSeq.current;
    setEditor(null);setNotice('');setBusy(false);saveAttempt.current=null;setState({status:'loading'});void reload(epoch);
    return()=>{if(selectionEpoch.current===epoch){++selectionEpoch.current;++loadSeq.current;}};
  },[client,workspaceId,classId,lessonId]);
  const plan=state.status==='ready'?state.plan:null;
  const projection=useMemo(()=>plan?projectPacingPlan(plan):null,[plan]);
  const remaining=projection?Math.max(0,projection.effectiveMeetings-actualMeetingCount):0;
  function edit(patch:Partial<Editor>){saveAttempt.current=null;setEditor(current=>current?{...current,...patch}:current);}
  async function save(){
    if(!editor||busy)return;
    const saveSelection=selectionKey,saveEpoch=selectionEpoch.current;
    const normal=Number(editor.normalMeetings),available=Number(editor.availableMeetings),reserve=Number(editor.correctionReserve),core=splitPacingLines(editor.core),practice=splitPacingLines(editor.practice),stretch=splitPacingLines(editor.stretch),exit=splitPacingLines(editor.exit);
    if(!Number.isInteger(normal)||normal<1||normal>20||!Number.isInteger(available)||available<0||available>20||!Number.isInteger(reserve)||reserve<0||reserve>available){setNotice('Kapasitas pacing tidak valid. Normal 1–20; available 0–20; correction reserve tidak boleh melebihi available.');return;}
    if(core.length===0||exit.length===0){setNotice('CORE dan Minimum Exit Criteria wajib punya minimal satu baris konkret.');return;}
    const persistedLessonVersionId=plan?plan.lesson_version_id:lessonVersionId;
    const payload={classId,lessonId,lessonVersionId:persistedLessonVersionId,normalMeetings:normal,availableMeetings:available,correctionReserve:reserve,coreTargets:core,practiceTargets:practice,stretchTargets:stretch,minimumExitCriteria:exit,teacherMode:editor.teacherMode||null,expectedRevision:plan?.revision??0};
    const fingerprint=JSON.stringify(payload);if(saveAttempt.current?.fingerprint!==fingerprint)saveAttempt.current={fingerprint,opId:crypto.randomUUID()};
    setBusy(true);setNotice('');
    try{
      const result=await saveLessonPacingPlan(client,{opId:saveAttempt.current.opId,...payload});
      if(selectionKeyRef.current!==saveSelection||selectionEpoch.current!==saveEpoch)return;
      if(result.outcome==='conflict'){setNotice('Pacing berubah di tempat lain. Data terbaru dimuat; cek lalu simpan lagi.');saveAttempt.current=null;await reload(saveEpoch);return;}
      saveAttempt.current=null;setEditor(null);setNotice(result.replayed?'Pacing sudah tersimpan sebelumnya; hasil idempotent dipakai kembali.':'Pacing tersimpan. Teacher override tetap eksplisit.');await reload(saveEpoch);
    }catch(error){
      if(selectionKeyRef.current===saveSelection&&selectionEpoch.current===saveEpoch)setNotice(`${error instanceof Error?error.message:String(error)} Retry dengan isi yang sama akan memakai operation id yang sama.`);
    }finally{if(selectionKeyRef.current===saveSelection&&selectionEpoch.current===saveEpoch)setBusy(false);}
  }

  if(state.status==='loading')return<section className="pacing-panel"><p className="muted">Memuat pacing…</p></section>;
  if(state.status==='error')return<section className="pacing-panel"><h2>Pacing</h2><p className="form-error" role="alert">Pacing belum dapat dimuat: {state.message}</p><button type="button" className="secondary" onClick={()=>void reload()}>Coba lagi</button></section>;

  return<section className="pacing-panel">
    <div className="pacing-heading"><div><p className="eyebrow">Pacing · teacher judgement</p><h2>Effective Meetings</h2></div>{plan&&!editor?<button type="button" className="secondary" onClick={()=>setEditor(editorFromPlan(plan))}>Edit pacing</button>:null}</div>
    {!plan&&!editor?<><p>Belum ada pacing plan untuk Class + Lesson ini. Nilai SMP tidak menebak jumlah pertemuan atau menjadikan schedule sebagai actual Meeting.</p><button type="button" onClick={()=>setEditor(blankEditor())}>Atur pacing</button></>:null}

    {plan&&projection&&!editor?<>
      <div className="pacing-metrics"><div><small>MODE AKTIF</small><strong>{projection.mode}</strong><span>{projection.teacherOverride?'Teacher override':'Recommendation'}</span></div><div><small>EFFECTIVE</small><strong>{projection.effectiveMeetings}</strong><span>{plan.available_meetings} available − {plan.correction_reserve} correction reserve</span></div><div><small>ACTUAL</small><strong>{actualMeetingCount}</strong><span>Hanya in-progress/completed Meeting aktual</span></div><div><small>REMAINING</small><strong>{remaining}</strong><span>Budget, bukan jadwal otomatis</span></div></div>
      <p className="muted">Recommendation: <strong>{projection.recommendation}</strong>. Override guru selalu menang. Planned/cancelled Meeting tidak dihitung sebagai actual.</p>
      {state.activeCorrectionCount>0?<p className="safety-badge">{state.activeCorrectionCount} correction session aktif terdeteksi. Sistem tidak menebak berapa Meeting yang termakan; correction reserve tetap judgement guru.</p>:null}
      {projection.mode==='COMPRESSED'?<p className="safety-badge">COMPRESSED: kurangi breadth lebih dulu. CORE, Practice untuk pemahaman, dan Minimum Exit Criteria tidak dibuang otomatis.</p>:projection.mode==='RELAXED'?<p className="muted">RELAXED: ruang tersedia untuk Stretch setelah CORE/Practice aman.</p>:<p className="muted">NORMAL: jalankan CORE + Practice; Stretch tetap opsional.</p>}
      <List title="CORE · selalu dijaga" items={projection.coreTargets}/>
      <List title={`PRACTICE · ${projection.practicePolicy}`} items={projection.practiceTargets}/>
      <List title={`STRETCH · ${projection.stretchPolicy}`} items={projection.stretchTargets}/>
      <List title="MINIMUM EXIT CRITERIA · selalu terlihat" items={projection.minimumExitCriteria}/>
    </>:null}

    {editor?<div className="pacing-editor">
      <p className="muted">Isi kapasitas realistis. Effective Meetings = Available − Correction reserve. Ini bukan timetable.</p>
      <div className="pacing-number-grid"><label>Normal Meetings<input type="number" min="1" max="20" value={editor.normalMeetings} onChange={e=>edit({normalMeetings:e.target.value})}/></label><label>Available Meetings<input type="number" min="0" max="20" value={editor.availableMeetings} onChange={e=>edit({availableMeetings:e.target.value})}/></label><label>Correction reserve<input type="number" min="0" max="20" value={editor.correctionReserve} onChange={e=>edit({correctionReserve:e.target.value})}/></label></div>
      <label className="field-label">Mode override<select value={editor.teacherMode} onChange={e=>edit({teacherMode:e.target.value as Editor['teacherMode']})}><option value="">Ikuti recommendation</option><option value="RELAXED">RELAXED</option><option value="NORMAL">NORMAL</option><option value="COMPRESSED">COMPRESSED</option></select></label>
      <label className="field-label">CORE · satu target per baris<textarea value={editor.core} onChange={e=>edit({core:e.target.value})}/></label>
      <label className="field-label">PRACTICE · satu target per baris<textarea value={editor.practice} onChange={e=>edit({practice:e.target.value})}/></label>
      <label className="field-label">STRETCH · breadth tambahan<textarea value={editor.stretch} onChange={e=>edit({stretch:e.target.value})}/></label>
      <label className="field-label">MINIMUM EXIT CRITERIA · satu per baris<textarea value={editor.exit} onChange={e=>edit({exit:e.target.value})}/></label>
      <div className="today-actions"><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan pacing'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setEditor(null);saveAttempt.current=null;setNotice('');}}>Batal</button></div>
    </div>:null}
    {notice?<p className="work-message" role="status">{notice}</p>:null}
  </section>;
}
