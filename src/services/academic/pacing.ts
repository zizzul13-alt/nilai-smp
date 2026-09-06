import type{SupabaseClient}from'@supabase/supabase-js';
import type{Meeting}from'../../domain/academic';

export type PacingMode='RELAXED'|'NORMAL'|'COMPRESSED';
export type LessonPacingPlan={
  id:string;workspace_id:string;class_id:string;lesson_id:string;lesson_version_id:string|null;
  normal_meetings:number;available_meetings:number;correction_reserve:number;
  core_targets:string[];practice_targets:string[];stretch_targets:string[];minimum_exit_criteria:string[];
  teacher_mode:PacingMode|null;revision:number;created_at:string;updated_at:string;
};
export type PacingDraft=Omit<LessonPacingPlan,'id'|'workspace_id'|'revision'|'created_at'|'updated_at'>;
export type PacingProjection={
  recommendation:PacingMode;mode:PacingMode;teacherOverride:boolean;effectiveMeetings:number;
  coreTargets:string[];practiceTargets:string[];stretchTargets:string[];minimumExitCriteria:string[];
  practicePolicy:'FULL'|'SELECTIVE';stretchPolicy:'IN_SCOPE'|'OPTIONAL'|'DEFER_FIRST';
};

export function effectiveMeetings(input:{available_meetings:number;correction_reserve:number}){
  return Math.max(0,input.available_meetings-input.correction_reserve);
}

export function recommendPacingMode(input:{normal_meetings:number;available_meetings:number;correction_reserve:number}):PacingMode{
  const effective=effectiveMeetings(input);
  if(effective>input.normal_meetings)return'RELAXED';
  if(effective<input.normal_meetings)return'COMPRESSED';
  return'NORMAL';
}

export function projectPacingPlan(plan:Pick<LessonPacingPlan,'normal_meetings'|'available_meetings'|'correction_reserve'|'core_targets'|'practice_targets'|'stretch_targets'|'minimum_exit_criteria'|'teacher_mode'>):PacingProjection{
  const recommendation=recommendPacingMode(plan),mode=plan.teacher_mode??recommendation;
  return{
    recommendation,mode,teacherOverride:plan.teacher_mode!==null,effectiveMeetings:effectiveMeetings(plan),
    coreTargets:[...plan.core_targets],practiceTargets:[...plan.practice_targets],stretchTargets:[...plan.stretch_targets],minimumExitCriteria:[...plan.minimum_exit_criteria],
    practicePolicy:mode==='COMPRESSED'?'SELECTIVE':'FULL',
    stretchPolicy:mode==='RELAXED'?'IN_SCOPE':mode==='NORMAL'?'OPTIONAL':'DEFER_FIRST',
  };
}

export function countActualLessonMeetings(meetings:Meeting[],classId:string,lessonId:string){
  return meetings.filter(m=>m.class_id===classId&&m.lesson_id===lessonId&&(m.status==='in_progress'||m.status==='completed')).length;
}

function asPlan(row:any):LessonPacingPlan{
  return{...row,core_targets:row.core_targets??[],practice_targets:row.practice_targets??[],stretch_targets:row.stretch_targets??[],minimum_exit_criteria:row.minimum_exit_criteria??[]}as LessonPacingPlan;
}

export async function loadLessonPacingPlan(client:SupabaseClient,workspaceId:string,classId:string,lessonId:string){
  const{data,error}=await client.from('lesson_pacing_plans').select('*').eq('workspace_id',workspaceId).eq('class_id',classId).eq('lesson_id',lessonId).maybeSingle();
  if(error)throw error;return data?asPlan(data):null;
}

export async function loadActiveCorrectionCount(client:SupabaseClient,workspaceId:string,classId:string){
  const{data,error}=await client.from('correction_sessions').select('id').eq('workspace_id',workspaceId).eq('class_id',classId).eq('status','active');
  if(error)throw error;return(data??[]).length;
}

export async function saveLessonPacingPlan(client:SupabaseClient,input:{opId:string;classId:string;lessonId:string;lessonVersionId:string|null;normalMeetings:number;availableMeetings:number;correctionReserve:number;coreTargets:string[];practiceTargets:string[];stretchTargets:string[];minimumExitCriteria:string[];teacherMode:PacingMode|null;expectedRevision:number}){
  const{data,error}=await client.rpc('upsert_lesson_pacing_plan_operation',{
    p_op_id:input.opId,p_class_id:input.classId,p_lesson_id:input.lessonId,p_lesson_version_id:input.lessonVersionId,
    p_normal_meetings:input.normalMeetings,p_available_meetings:input.availableMeetings,p_correction_reserve:input.correctionReserve,
    p_core_targets:input.coreTargets,p_practice_targets:input.practiceTargets,p_stretch_targets:input.stretchTargets,
    p_minimum_exit_criteria:input.minimumExitCriteria,p_teacher_mode:input.teacherMode,p_expected_revision:input.expectedRevision,
  });
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error('Pacing save tidak mengembalikan hasil.');
  return row as{outcome:'saved'|'conflict';revision:number;replayed:boolean;plan_id:string|null};
}

export function splitPacingLines(value:string){return value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);}
export function joinPacingLines(value:string[]){return value.join('\n');}
