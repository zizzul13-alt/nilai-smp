import type{SupabaseClient}from'@supabase/supabase-js';
import{loadTodayServer,type TodayServerSnapshot}from'./today';
import{recommendPacingMode}from'./pacing';

export type TeacherBriefSafeSummary={pending:number;failed:number;conflict:number};
export type TeacherBriefContext={
  generated_at:string;
  active_meetings:Array<{class_id:string;class_name:string;meeting_id:string}>;
  continuity_attention:Array<{class_id:string;class_name:string;reason:'NO_CHECKPOINT'|'STALE_CONTEXT'}>;
  active_correction:null|{assessment_id:string;assessment_title:string;class_id:string;class_name:string};
  pending_safe_summary:TeacherBriefSafeSummary;
  pacing_attention:{compressed:number;total:number};
  assessment_attention:{unchecked:number;missing:number;total:number};
  reporting_attention:{open:number;finalized:number;total:number};
};
export type TeacherBriefNarrative={headline:string;priorities:string[];source:'deterministic'|'provider'};
export type TeacherBriefNarrator=(context:TeacherBriefContext)=>Promise<{headline:string;priorities:string[]}>;
type ResultStateRow={state:'UNCHECKED'|'GRADED'|'MISSING'|'EXCUSED'|string};
type PacingRow={normal_meetings:number;available_meetings:number;correction_reserve:number};
type ReportingRow={status:'OPEN'|'FINALIZED'|string};
function stale(recordedAt:string|null,now:Date){if(!recordedAt)return false;const d=new Date(now.getFullYear(),now.getMonth(),now.getDate());const mondayOffset=(d.getDay()+6)%7;d.setDate(d.getDate()-mondayOffset-7);return new Date(recordedAt)<d;}

export function deriveTeacherBriefContext(input:{now:Date;today:TodayServerSnapshot;safe:TeacherBriefSafeSummary;results:ResultStateRow[];pacing:PacingRow[];reporting:ReportingRow[]}):TeacherBriefContext{
  const active=input.today.classes.filter(row=>row.active_meeting_id).map(row=>({class_id:row.class_id,class_name:row.class_name,meeting_id:row.active_meeting_id!}));
  const continuity_attention:TeacherBriefContext['continuity_attention']=[];
  for(const row of input.today.classes){
    if(row.active_meeting_id&&!row.active_checkpoint_id)continuity_attention.push({class_id:row.class_id,class_name:row.class_name,reason:'NO_CHECKPOINT'});
    else if(row.effective_stopped_at&&stale(row.effective_recorded_at,input.now))continuity_attention.push({class_id:row.class_id,class_name:row.class_name,reason:'STALE_CONTEXT'});
  }
  const correction=input.today.correction?{assessment_id:input.today.correction.assessment_id,assessment_title:input.today.correction.assessment_title,class_id:input.today.correction.class_id,class_name:input.today.correction.class_name}:null;
  const compressed=input.pacing.filter(row=>recommendPacingMode(row)==='COMPRESSED').length;
  const unchecked=input.results.filter(row=>row.state==='UNCHECKED').length;
  const missing=input.results.filter(row=>row.state==='MISSING').length;
  const open=input.reporting.filter(row=>row.status==='OPEN').length;
  const finalized=input.reporting.filter(row=>row.status==='FINALIZED').length;
  return{generated_at:input.now.toISOString(),active_meetings:active,continuity_attention,active_correction:correction,pending_safe_summary:{...input.safe},pacing_attention:{compressed,total:input.pacing.length},assessment_attention:{unchecked,missing,total:input.results.length},reporting_attention:{open,finalized,total:input.reporting.length}};
}

export async function loadTeacherBriefContext(client:SupabaseClient,workspaceId:string,safe:TeacherBriefSafeSummary,now=new Date()):Promise<TeacherBriefContext>{
  const[today,resultQ,pacingQ,reportQ]=await Promise.all([loadTodayServer(client),client.from('assessment_results').select('state').eq('workspace_id',workspaceId),client.from('lesson_pacing_plans').select('normal_meetings,available_meetings,correction_reserve').eq('workspace_id',workspaceId),client.from('reporting_cycles').select('status').eq('workspace_id',workspaceId)]);
  if(resultQ.error)throw new Error(`Teacher Brief assessment context gagal: ${resultQ.error.message}`);
  if(pacingQ.error)throw new Error(`Teacher Brief pacing context gagal: ${pacingQ.error.message}`);
  if(reportQ.error)throw new Error(`Teacher Brief reporting context gagal: ${reportQ.error.message}`);
  return deriveTeacherBriefContext({now,today,safe,results:(resultQ.data??[])as ResultStateRow[],pacing:(pacingQ.data??[])as PacingRow[],reporting:(reportQ.data??[])as ReportingRow[]});
}

export function deterministicTeacherBrief(context:TeacherBriefContext):TeacherBriefNarrative{
  const priorities:string[]=[];
  if(context.active_meetings.length)priorities.push(`${context.active_meetings.length} kelas masih memiliki Meeting aktif.`);
  if(context.active_correction)priorities.push(`Koreksi ${context.active_correction.assessment_title} masih aktif.`);
  const safe=context.pending_safe_summary.pending+context.pending_safe_summary.failed+context.pending_safe_summary.conflict;
  if(safe)priorities.push(`${safe} operasi Safe Work perlu perhatian.`);
  if(context.continuity_attention.length)priorities.push(`${context.continuity_attention.length} kelas perlu pemeriksaan konteks kontinuitas.`);
  if(context.assessment_attention.unchecked||context.assessment_attention.missing)priorities.push(`${context.assessment_attention.unchecked} hasil belum diperiksa · ${context.assessment_attention.missing} MISSING.`);
  if(context.pacing_attention.compressed)priorities.push(`${context.pacing_attention.compressed} rencana pacing terindikasi COMPRESSED.`);
  if(context.reporting_attention.open)priorities.push(`${context.reporting_attention.open} siklus laporan masih OPEN.`);
  return{headline:priorities.length?'Ada pekerjaan yang layak diperhatikan.':'Tidak ada perhatian utama dari konteks kanonik yang dibaca.',priorities,source:'deterministic'};
}
export async function narrateTeacherBrief(context:TeacherBriefContext,narrator?:TeacherBriefNarrator):Promise<TeacherBriefNarrative>{if(!narrator)return deterministicTeacherBrief(context);try{const result=await narrator(context);return{headline:result.headline,priorities:result.priorities,source:'provider'};}catch{return deterministicTeacherBrief(context);}}
