import{useCallback,useEffect,useState}from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{readBrowserConfig}from'../config/env';
import{pendingForNamespace,safeWorkDb}from'../services/safeWork/localQueue';
import{loadTeacherBriefContext,narrateTeacherBrief,type TeacherBriefContext,type TeacherBriefNarrative,type TeacherBriefNarrator}from'../services/academic/teacherBrief';

type State={status:'loading'}|{status:'error';message:string}|{status:'ready';context:TeacherBriefContext;narrative:TeacherBriefNarrative};

function workersAiNarrator(client:SupabaseClient):TeacherBriefNarrator{return async context=>{
  const[{data:{session}},configResult]=await Promise.all([client.auth.getSession(),Promise.resolve(readBrowserConfig())]);
  if(!session?.access_token)throw new Error('AUTH_SESSION_MISSING');
  if(!configResult.ok)throw new Error('BROWSER_CONFIG_MISSING');
  const response=await fetch('/api/teacher-brief',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'X-Supabase-Publishable-Key':configResult.config.supabasePublishableKey},body:JSON.stringify({context})});
  if(!response.ok){let code='HTTP_ERROR';try{const value=await response.json() as {error?:unknown};if(typeof value.error==='string'&&/^[a-z0-9_]+$/i.test(value.error))code=value.error.toUpperCase();}catch{/* bounded diagnostic only */}throw new Error(`${code}_${response.status}`);}
  const value=await response.json() as {headline?:unknown;priorities?:unknown};
  if(typeof value.headline!=='string'||!Array.isArray(value.priorities)||!value.priorities.every(item=>typeof item==='string'))throw new Error('INVALID_AI_RESPONSE_SHAPE');
  return{headline:value.headline,priorities:value.priorities as string[]};
};}

export function TeacherBrief({client,userId,workspaceId}:{client:SupabaseClient;userId:string;workspaceId:string}){
  const[state,setState]=useState<State>({status:'loading'});
  const refresh=useCallback(async()=>{
    setState({status:'loading'});
    try{
      const ops=await pendingForNamespace(safeWorkDb,userId,workspaceId);
      const safe={pending:ops.filter(op=>op.status==='PENDING_SAFE').length,failed:ops.filter(op=>op.status==='FAILED').length,conflict:ops.filter(op=>op.status==='CONFLICT').length};
      const context=await loadTeacherBriefContext(client,workspaceId,safe);
      const narrative=await narrateTeacherBrief(context,workersAiNarrator(client));
      setState({status:'ready',context,narrative});
    }catch(error){setState({status:'error',message:error instanceof Error?error.message:'Teacher Brief belum dapat dimuat.'});}
  },[client,userId,workspaceId]);
  useEffect(()=>{void refresh();},[refresh]);

  if(state.status==='loading')return<section className="today-shell"><p className="eyebrow">Brief Guru</p><h1>Menyusun perhatian dari data kanonik…</h1></section>;
  if(state.status==='error')return<section className="today-shell"><p className="eyebrow">Brief Guru</p><h1>Brief belum dapat dimuat</h1><p>{state.message}</p><button type="button" onClick={()=>void refresh()}>Coba lagi</button></section>;
  const{context,narrative}=state;
  return<section className="today-shell teacher-brief-shell">
    <header><p className="eyebrow">F2 · Brief Guru</p><h1>{narrative.headline}</h1><p className="muted">Ringkasan deterministik dari data kanonik dengan narasi AI opsional. Tidak mengubah nilai, Meeting, laporan, atau dokumen. AI/provider bersifat opsional; bila provider gagal, brief deterministik tetap dipakai.</p></header>
    <section className="today-section"><h2>PRIORITAS</h2>{narrative.priorities.length?<div className="today-list">{narrative.priorities.map((item,index)=><div className="today-item" key={`${index}-${item}`}><strong>{index+1}</strong><span>{item}</span></div>)}</div>:<p>Tidak ada perhatian utama yang terdeteksi dari konteks yang dibaca.</p>}</section>
    <section className="today-section"><h2>BUKTI RINGKAS</h2><div className="today-memory"><div><small>MEETING AKTIF</small><b>{context.active_meetings.length}</b></div><div><small>KOREKSI AKTIF</small><b>{context.active_correction?'1':'0'}</b></div><div><small>SAFE WORK</small><b>{context.pending_safe_summary.pending+context.pending_safe_summary.failed+context.pending_safe_summary.conflict}</b></div><div><small>UNCHECKED</small><b>{context.assessment_attention.unchecked}</b></div><div><small>MISSING</small><b>{context.assessment_attention.missing}</b></div><div><small>PACING COMPRESSED</small><b>{context.pacing_attention.compressed}</b></div><div><small>LAPORAN OPEN</small><b>{context.reporting_attention.open}</b></div></div></section>
    {context.continuity_attention.length?<section className="today-section"><h2>KONTINUITAS</h2><div className="today-list">{context.continuity_attention.map(item=><div className="today-item" key={`${item.class_id}-${item.reason}`}><strong>{item.class_name}</strong><span>{item.reason==='NO_CHECKPOINT'?'Meeting aktif belum punya checkpoint kanonik.':'Konteks terakhir sudah lama; verifikasi sebelum dipakai.'}</span></div>)}</div></section>:null}
    <p className="muted">Dibuat {new Date(context.generated_at).toLocaleString('id-ID')} · sumber narasi: {narrative.source==='deterministic'?'deterministik (fallback)':'Cloudflare Workers AI'}.{narrative.source==='deterministic'&&narrative.fallback_reason?` · diagnostik: ${narrative.fallback_reason}`:''}</p>
  </section>;
}
