import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingOperation } from '../../domain/safeWork';

export type TodayClassContext={
  class_id:string;class_name:string;
  active_meeting_id:string|null;active_meeting_occurred_at:string|null;active_lesson_title:string|null;
  latest_actual_meeting_id:string|null;latest_actual_meeting_occurred_at:string|null;latest_actual_meeting_status:string|null;
  active_checkpoint_id:string|null;active_checkpoint_stopped_at:string|null;active_checkpoint_next_step:string|null;active_checkpoint_recorded_at:string|null;
  latest_checkpoint_id:string|null;latest_checkpoint_meeting_id:string|null;latest_checkpoint_stopped_at:string|null;latest_checkpoint_next_step:string|null;latest_checkpoint_recorded_at:string|null;
  latest_baseline_id:string|null;latest_baseline_kind:'QUICK_UPDATE'|'START_FROM_TODAY'|null;latest_baseline_stopped_at:string|null;latest_baseline_next_step:string|null;latest_baseline_recorded_at:string|null;
  effective_source:'checkpoint'|'baseline'|null;effective_stopped_at:string|null;effective_next_step:string|null;effective_recorded_at:string|null;
};
export type TodayCorrection={session_id:string;assessment_id:string;assessment_title:string;class_id:string;class_name:string;current_enrollment_id:string|null;started_at:string;updated_at:string;active_count:number};
export type TodayServerSnapshot={classes:TodayClassContext[];correction:TodayCorrection|null};
export type ReentryKind='QUICK_UPDATE'|'START_FROM_TODAY';
export type ReentryAge='recent'|'stale'|'none';

export async function loadTodayServer(client:SupabaseClient):Promise<TodayServerSnapshot>{
  const [classQ,correctionQ]=await Promise.all([
    client.rpc('read_today_class_contexts'),
    client.rpc('read_today_active_correction'),
  ]);
  if(classQ.error)throw new Error(`Today continuity belum dapat dimuat: ${classQ.error.message}`);
  if(correctionQ.error)throw new Error(`Today correction belum dapat dimuat: ${correctionQ.error.message}`);
  return{classes:(classQ.data??[]) as TodayClassContext[],correction:((correctionQ.data??[])[0]??null) as TodayCorrection|null};
}

/** Exact-id recovery lookup. Existing meetings RLS is the ownership authority; foreign ids resolve to no row. */
export async function resolveMeetingClass(client:SupabaseClient,workspaceId:string,meetingId:string):Promise<string|null>{
  const{data,error}=await client.from('meetings').select('class_id').eq('workspace_id',workspaceId).eq('id',meetingId).maybeSingle();
  if(error)throw new Error(`Class untuk checkpoint ini belum dapat ditentukan: ${error.message}`);
  const classId=(data as{class_id?:unknown}|null)?.class_id;
  return typeof classId==='string'&&classId?classId:null;
}

/** pendingForNamespace is created_at ordered; sort again with op_id tie-break so callers get deterministic newest durable fact. */
export function latestLocalCheckpointForMeeting(safeOps:PendingOperation[],meetingId:string|null){
  if(!meetingId)return null;
  const rows=safeOps.filter(op=>op.operation_kind==='meeting.checkpoint'&&op.entity_id===meetingId).slice().sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.op_id.localeCompare(b.op_id));
  return rows.length?rows[rows.length-1]:null;
}

function startOfLocalWeek(input:Date){
  const d=new Date(input.getFullYear(),input.getMonth(),input.getDate());
  const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  return d;
}

/**
 * Re-entry rule: context is recent throughout the current and immediately previous local calendar week.
 * It becomes stale only when it predates the start of the previous local week. This avoids hour-level
 * fake precision while treating a clearly abandoned context differently from a normal weekend gap.
 */
export function classifyReentryAge(recordedAt:string|null,now=new Date()):ReentryAge{
  if(!recordedAt)return'none';
  const previousWeekStart=startOfLocalWeek(now);previousWeekStart.setDate(previousWeekStart.getDate()-7);
  return new Date(recordedAt)<previousWeekStart?'stale':'recent';
}

export type TodayPrimaryAction=
  |{kind:'continue-class';classId:string;label:'CONTINUE CLASS'}
  |{kind:'resume-correction';assessmentId:string;label:'RESUME CORRECTION'}
  |{kind:'quick-update';classId:string;label:'QUICK UPDATE'}
  |{kind:'start-class';classId:string;label:'START CLASS'}
  |null;
export type TodayAttention={kind:'checkpoint'|'meeting'|'correction'|'safe-work';title:string;detail:string;classId?:string;assessmentId?:string};
export type TodayModel={primary:TodayPrimaryAction;beforeLeaving:TodayAttention[];later:TodayClassContext[];safeSummary:{pending:number;failed:number;conflict:number};empty:boolean};

export function deriveTodayModel(snapshot:TodayServerSnapshot,safeOps:PendingOperation[],now=new Date()):TodayModel{
  const active=snapshot.classes.filter(c=>c.active_meeting_id);
  const strongest=snapshot.classes.find(c=>c.effective_stopped_at)||snapshot.classes[0]||null;
  let primary:TodayPrimaryAction=null;
  if(active[0])primary={kind:'continue-class',classId:active[0].class_id,label:'CONTINUE CLASS'};
  else if(snapshot.correction)primary={kind:'resume-correction',assessmentId:snapshot.correction.assessment_id,label:'RESUME CORRECTION'};
  else if(strongest){
    primary=classifyReentryAge(strongest.effective_recorded_at,now)==='stale'
      ?{kind:'quick-update',classId:strongest.class_id,label:'QUICK UPDATE'}
      :{kind:'start-class',classId:strongest.class_id,label:'START CLASS'};
  }

  const pending=safeOps.filter(o=>o.status==='PENDING_SAFE').length;
  const failed=safeOps.filter(o=>o.status==='FAILED').length;
  const conflict=safeOps.filter(o=>o.status==='CONFLICT').length;
  const beforeLeaving:TodayAttention[]=[];
  for(const item of active){
    const localCheckpoint=safeOps.some(o=>o.operation_kind==='meeting.checkpoint'&&o.entity_id===item.active_meeting_id);
    if(!item.active_checkpoint_id&&!localCheckpoint)beforeLeaving.push({kind:'checkpoint',title:`${item.class_name}: checkpoint belum dicatat`,detail:'Catat LAST / NEXT sebelum Meeting selesai.',classId:item.class_id});
  }
  for(const item of active.slice(1))beforeLeaving.push({kind:'meeting',title:`${item.class_name}: Meeting masih aktif`,detail:'Lanjutkan atau selesaikan secara eksplisit.',classId:item.class_id});
  if(snapshot.correction)beforeLeaving.push({kind:'correction',title:`${snapshot.correction.assessment_title}: koreksi belum selesai`,detail:`${snapshot.correction.class_name} · posisi workflow tetap dipertahankan.`,assessmentId:snapshot.correction.assessment_id});
  if(pending+failed+conflict>0){
    const parts=[pending?`${pending} Pending Safe`:'',failed?`${failed} FAILED`:'',conflict?`${conflict} CONFLICT`:''].filter(Boolean);
    beforeLeaving.push({kind:'safe-work',title:'Safe Work perlu perhatian',detail:parts.join(' · ')});
  }
  return{primary,beforeLeaving,later:snapshot.classes.slice(0,8),safeSummary:{pending,failed,conflict},empty:!primary&&beforeLeaving.length===0};
}

export async function recordContinuityBaseline(client:SupabaseClient,input:{opId:string;classId:string;kind:ReentryKind;stoppedAt:string;nextStep?:string|null}){
  const stopped=input.stoppedAt.trim();if(!stopped)throw new Error('LAST / STOPPED AT wajib diisi.');
  const{data,error}=await client.rpc('record_continuity_baseline_operation',{p_op_id:input.opId,p_class_id:input.classId,p_baseline_kind:input.kind,p_stopped_at:stopped,p_next_step:input.nextStep?.trim()||null});
  if(error)throw new Error(`Re-entry baseline belum terkonfirmasi: ${error.message}`);
  const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('Re-entry baseline tidak mengembalikan hasil.');
  return{outcome:String(row.outcome),baselineId:String(row.baseline_id),recordedAt:String(row.recorded_at),replayed:Boolean(row.replayed)};
}
