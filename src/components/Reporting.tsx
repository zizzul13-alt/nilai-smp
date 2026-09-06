import{useEffect,useMemo,useRef,useState}from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{
  calculateReportSnapshot,createReportingPolicy,formatReportedScore,loadReportSnapshot,loadReportingContext,loadReportingCycle,reopenReportingCycle,
  type ReportSnapshot,type ReportSnapshotRow,type ReportingContext,type ReportingCycle,type ReportingPolicy,
}from'../services/academic/reporting';

type Props={client:SupabaseClient;workspaceId:string};
type Notice={kind:'info'|'error';text:string}|null;

type PolicyDraft={policyKey:string|null;name:string;missingPolicy:ReportingPolicy['missing_policy'];remedialPolicy:ReportingPolicy['remedial_policy'];roundingMode:ReportingPolicy['rounding_mode'];kkm:string};
const blankPolicy=():PolicyDraft=>({policyKey:null,name:'Nilai rapor',missingPolicy:'EXCLUDE',remedialPolicy:'CURRENT_RESULT',roundingMode:'INTEGER',kkm:''});

export function Reporting({client,workspaceId}:Props){
  const[context,setContext]=useState<ReportingContext|null>(null);
  const[classId,setClassId]=useState('');
  const[policyId,setPolicyId]=useState('');
  const[cycle,setCycle]=useState<ReportingCycle|null>(null);
  const[snapshot,setSnapshot]=useState<ReportSnapshot|null>(null);
  const[rows,setRows]=useState<ReportSnapshotRow[]>([]);
  const[policyDraft,setPolicyDraft]=useState<PolicyDraft|null>(null);
  const[reopenReason,setReopenReason]=useState('');
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState<Notice>(null);
  const baseGeneration=useRef(0);
  const cycleGeneration=useRef(0);
  const classIdRef=useRef('');

  async function loadBase(){
    const token=++baseGeneration.current;
    const next=await loadReportingContext(client,workspaceId);
    if(token!==baseGeneration.current)return;
    setContext(next);
    setClassId(current=>{
      const nextClass=next.classes.some(c=>c.id===current)?current:(next.classes[0]?.id??'');
      classIdRef.current=nextClass;
      return nextClass;
    });
  }
  useEffect(()=>{void loadBase().catch(error=>setNotice({kind:'error',text:error instanceof Error?error.message:String(error)}));},[client,workspaceId]);

  const selectedClass=useMemo(()=>context?.classes.find(c=>c.id===classId)??null,[context,classId]);
  const policies=useMemo(()=>selectedClass?context?.policies.filter(p=>p.academic_period_id===selectedClass.academic_period_id)??[]:[],[context,selectedClass]);
  const selectedPolicy=useMemo(()=>policies.find(p=>p.id===policyId)??null,[policies,policyId]);

  useEffect(()=>{
    setPolicyId(current=>policies.some(p=>p.id===current)?current:(policies[0]?.id??''));
  },[classId,context]);

  async function refreshCycle(targetClassId=classIdRef.current){
    if(!targetClassId){
      if(classIdRef.current===''){setCycle(null);setSnapshot(null);setRows([]);}
      return;
    }
    const token=++cycleGeneration.current;
    const next=await loadReportingCycle(client,workspaceId,targetClassId);
    if(token!==cycleGeneration.current||classIdRef.current!==targetClassId)return;
    setCycle(next);
    if(next?.current_snapshot_id){
      const loaded=await loadReportSnapshot(client,workspaceId,next.current_snapshot_id);
      if(token!==cycleGeneration.current||classIdRef.current!==targetClassId)return;
      setSnapshot(loaded.snapshot);setRows(loaded.rows);
    }else if(classIdRef.current===targetClassId){setSnapshot(null);setRows([]);}
  }
  useEffect(()=>{void refreshCycle(classId).catch(error=>{if(classIdRef.current===classId)setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});});},[classId,client,workspaceId]);

  function switchClass(value:string){cycleGeneration.current++;classIdRef.current=value;setClassId(value);setCycle(null);setSnapshot(null);setRows([]);setPolicyDraft(null);setNotice(null);setReopenReason('');}

  async function savePolicy(){
    if(!selectedClass||!policyDraft||busy)return;
    const actionClassId=classId;
    const kkm=policyDraft.kkm.trim()===''?null:Number(policyDraft.kkm);
    if(policyDraft.name.trim()===''||kkm!==null&&!Number.isFinite(kkm)){setNotice({kind:'error',text:'Nama policy wajib dan KKM harus angka atau kosong.'});return;}
    setBusy(true);setNotice(null);
    try{
      const result=await createReportingPolicy(client,{opId:crypto.randomUUID(),academicPeriodId:selectedClass.academic_period_id,name:policyDraft.name.trim(),policyKey:policyDraft.policyKey,missingPolicy:policyDraft.missingPolicy,remedialPolicy:'CURRENT_RESULT',roundingMode:policyDraft.roundingMode,kkm});
      await loadBase();
      if(classIdRef.current!==actionClassId)return;
      setPolicyId(result.policy_id);setPolicyDraft(null);setNotice({kind:'info',text:`Reporting policy v${result.version_no} dibuat. Formula tetap SIMPLE_MEAN dan policy tersimpan sebagai versi baru.`});
    }catch(error){if(classIdRef.current===actionClassId)setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}
  }

  function createNewPolicyVersion(){
    if(!selectedPolicy)return;
    setPolicyDraft({policyKey:selectedPolicy.policy_key,name:selectedPolicy.name,missingPolicy:selectedPolicy.missing_policy,remedialPolicy:'CURRENT_RESULT',roundingMode:selectedPolicy.rounding_mode,kkm:selectedPolicy.kkm===null?'':String(selectedPolicy.kkm)});
  }

  async function snapshotAction(finalize:boolean){
    if(!selectedPolicy||!classId||busy)return;
    const actionClassId=classId;
    const actionPolicyId=selectedPolicy.id;
    const actionRevision=cycle?.revision??0;
    setBusy(true);setNotice(null);
    try{
      const result=await calculateReportSnapshot(client,{opId:crypto.randomUUID(),classId:actionClassId,policyId:actionPolicyId,finalize,expectedRevision:actionRevision});
      if(classIdRef.current!==actionClassId)return;
      if(result.outcome==='conflict'){
        setNotice({kind:'error',text:'Reporting berubah di tempat lain. Data terbaru dimuat; cek ulang sebelum mencoba lagi.'});
        await refreshCycle(actionClassId);
        return;
      }
      await refreshCycle(actionClassId);
      if(classIdRef.current!==actionClassId)return;
      setNotice({kind:'info',text:finalize?'Finalized — snapshot rapor ditutup secara eksplisit. Koreksi berikutnya wajib Reopen dulu.':'Provisional snapshot dibuat dari canonical Result saat ini.'});
    }catch(error){if(classIdRef.current===actionClassId)setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}
  }

  async function reopen(){
    if(!cycle||cycle.status!=='FINALIZED'||busy)return;
    const actionClassId=classId;
    const actionCycle=cycle;
    if(reopenReason.trim()===''){setNotice({kind:'error',text:'Alasan Reopen wajib supaya koreksi faktual dapat diaudit.'});return;}
    setBusy(true);setNotice(null);
    try{
      const result=await reopenReportingCycle(client,{opId:crypto.randomUUID(),cycleId:actionCycle.id,reason:reopenReason.trim(),expectedRevision:actionCycle.revision});
      if(classIdRef.current!==actionClassId)return;
      if(result.outcome==='conflict'){setNotice({kind:'error',text:'Reporting berubah di tempat lain. Data terbaru dimuat.'});await refreshCycle(actionClassId);return;}
      setReopenReason('');await refreshCycle(actionClassId);
      if(classIdRef.current!==actionClassId)return;
      setNotice({kind:'info',text:'Reporting cycle dibuka kembali. Snapshot FINALIZED lama tetap utuh sebagai history; buat provisional/final baru setelah koreksi.'});
    }catch(error){if(classIdRef.current===actionClassId)setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}
  }

  if(!context)return<section className="continuity-shell"><p>Memuat reporting…</p>{notice?<p role="alert">{notice.text}</p>:null}</section>;
  return<section className="continuity-shell reporting-shell">
    <header><p className="eyebrow">Reporting · canonical academic outcome</p><h1>Report truthfully, then close it</h1><label className="field-label">Class<select value={classId} onChange={e=>switchClass(e.target.value)}>{context.classes.length===0?<option value="">Belum ada Class aktif</option>:null}{context.classes.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label></header>
    {!selectedClass?<div className="continuity-empty"><strong>Belum ada Class aktif.</strong></div>:<>
      <div className="checkpoint-card"><h2>Reporting Policy</h2>{policies.length?<><label className="field-label">Policy<select value={policyId} disabled={busy} onChange={e=>setPolicyId(e.target.value)}>{policies.map(p=><option key={p.id} value={p.id}>{p.name} · v{p.version_no}</option>)}</select></label>{selectedPolicy?<p className="muted">SIMPLE_MEAN · Missing {selectedPolicy.missing_policy} · Remedial CURRENT_RESULT · Rounding {selectedPolicy.rounding_mode} · KKM {selectedPolicy.kkm??'—'}</p>:null}<button type="button" className="secondary" disabled={busy} onClick={createNewPolicyVersion}>Buat versi policy baru</button></>:<p>Belum ada reporting policy untuk periode Class ini.</p>}<button type="button" className="secondary" disabled={busy} onClick={()=>setPolicyDraft(blankPolicy())}>Policy baru</button></div>
      {policyDraft?<div className="checkpoint-card"><h2>{policyDraft.policyKey?'Versi policy baru':'Policy baru'}</h2><label className="field-label">Nama<input value={policyDraft.name} onChange={e=>setPolicyDraft({...policyDraft,name:e.target.value})}/></label><label className="field-label">Missing<select value={policyDraft.missingPolicy} onChange={e=>setPolicyDraft({...policyDraft,missingPolicy:e.target.value as PolicyDraft['missingPolicy']})}><option value="EXCLUDE">EXCLUDE</option><option value="ZERO">ZERO</option></select></label><p className="muted">Remedial: CURRENT_RESULT. Raw REMEDIAL Attempt tetap evidence dan tidak otomatis dipromosikan menjadi nilai rapor.</p><label className="field-label">Rounding<select value={policyDraft.roundingMode} onChange={e=>setPolicyDraft({...policyDraft,roundingMode:e.target.value as PolicyDraft['roundingMode']})}><option value="NONE">NONE</option><option value="INTEGER">INTEGER</option><option value="ONE_DECIMAL">ONE_DECIMAL</option></select></label><label className="field-label">KKM (terpisah dari formula)<input inputMode="decimal" value={policyDraft.kkm} onChange={e=>setPolicyDraft({...policyDraft,kkm:e.target.value})} placeholder="opsional"/></label><div className="today-actions"><button type="button" disabled={busy} onClick={()=>void savePolicy()}>Simpan policy version</button><button type="button" className="secondary" disabled={busy} onClick={()=>setPolicyDraft(null)}>Batal</button></div></div>:null}
      {selectedPolicy?<div className="checkpoint-card"><div className="continuity-status"><strong>Reporting cycle</strong><span>{cycle?.status??'OPEN'}</span></div><p className="muted">Finalization hanya boleh lewat explicit action. UNCHECKED memblok Finalize; MISSING dan EXCUSED tetap state nyata dan diperlakukan oleh policy.</p>{cycle?.status==='FINALIZED'?<><label className="field-label">Alasan Reopen<input value={reopenReason} onChange={e=>setReopenReason(e.target.value)} placeholder="contoh: koreksi nilai siswa setelah bukti ditemukan"/></label><button type="button" disabled={busy} onClick={()=>void reopen()}>Reopen untuk koreksi faktual</button></>:<div className="today-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void snapshotAction(false)}>Preview provisional</button><button type="button" disabled={busy} onClick={()=>void snapshotAction(true)}>Finalize reporting</button></div>}</div>:null}
      {snapshot?<div className="checkpoint-card"><div className="continuity-status"><strong>Snapshot #{snapshot.snapshot_no}</strong><span>{snapshot.kind}</span></div><p className="muted">{snapshot.assessment_count} assessment · {snapshot.enrollment_count} enrollment · snapshot append-only.</p><div className="report-table" role="table"><div className="report-row report-row--head" role="row"><strong>Siswa</strong><strong>Nilai</strong><strong>Evidence state</strong><strong>KKM</strong></div>{rows.map(row=><div className="report-row" role="row" key={row.id}><span>{row.student_display_name}</span><strong>{formatReportedScore(row.reported_score)}</strong><span>{row.graded_count} GRADED · {row.missing_count} MISSING · {row.excused_count} EXCUSED · {row.unchecked_count} UNCHECKED</span><span>{row.meets_kkm===null?'—':row.meets_kkm?'PASS':'BELOW'}</span></div>)}</div></div>:null}
    </>}
    {notice?<p className={notice.kind==='error'?'form-error':'work-message'} role={notice.kind==='error'?'alert':'status'}>{notice.text}</p>:null}
  </section>;
}
