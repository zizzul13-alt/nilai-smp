import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AcademicClass,
  Activity,
  ActivityMeeting,
  Checkpoint,
  Lesson,
  LessonVersion,
  Material,
  Meeting,
} from '../../domain/academic';

export type TeachingCoreContext = {
  materials: Material[];
  lessons: Lesson[];
  lessonVersions: LessonVersion[];
  meetings: Meeting[];
  checkpoints: Checkpoint[];
  activities: Activity[];
  activityMeetings: ActivityMeeting[];
};

export type ClassContinuity = {
  classroom: AcademicClass;
  state: 'active'|'history'|'empty';
  activeMeeting: Meeting|null;
  latestActualMeeting: Meeting|null;
  latestMeaningfulCheckpoint: Checkpoint|null;
  /** Compatibility aliases for existing R3.4 UI/tests; semantics now follow the explicit fields above. */
  latestMeeting: Meeting|null;
  latestCheckpoint: Checkpoint|null;
  lesson: Lesson|null;
  lessonVersion: LessonVersion|null;
};

export type ContinuityContext = {
  classes: AcademicClass[];
  core: TeachingCoreContext;
  byClass: ClassContinuity[];
};

/**
 * Minimal diagnostic/read boundary for the canonical Teaching Core.
 * workspaceId is a query key only; PostgreSQL RLS remains authorization.
 */
export async function loadOwnedTeachingCore(client: SupabaseClient, workspaceId: string): Promise<TeachingCoreContext> {
  const tables = ['materials','lessons','lesson_versions','meetings','checkpoints','activities','activity_meetings'] as const;
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    const { data, error } = await client.from(table).select('*').eq('workspace_id', workspaceId);
    if (error) throw new Error(`Teaching core load failed for ${table}: ${error.message}`);
    rows[table] = data ?? [];
  }
  return {
    materials: rows.materials as Material[], lessons: rows.lessons as Lesson[],
    lessonVersions: rows.lesson_versions as LessonVersion[], meetings: rows.meetings as Meeting[],
    checkpoints: rows.checkpoints as Checkpoint[], activities: rows.activities as Activity[],
    activityMeetings: rows.activity_meetings as ActivityMeeting[],
  };
}

function byOccurrenceDesc(a:Meeting,b:Meeting){
  const time=b.occurred_at.localeCompare(a.occurred_at);
  return time!==0?time:b.id.localeCompare(a.id);
}
function checkpointsForMeetingDesc(meetingId:string,checkpoints:Checkpoint[]){
  return checkpoints.filter(c=>c.meeting_id===meetingId).sort((a,b)=>{
    if(b.sequence_no!==a.sequence_no)return b.sequence_no-a.sequence_no;
    const time=b.recorded_at.localeCompare(a.recorded_at);
    return time!==0?time:b.id.localeCompare(a.id);
  });
}
function latestCheckpointFor(meetingId:string,checkpoints:Checkpoint[]){
  return checkpointsForMeetingDesc(meetingId,checkpoints)[0]??null;
}
function latestMeaningfulCheckpoint(actual:Meeting[],activeMeeting:Meeting|null,checkpoints:Checkpoint[]){
  const activeCheckpoint=activeMeeting?latestCheckpointFor(activeMeeting.id,checkpoints):null;
  if(activeCheckpoint)return activeCheckpoint;
  for(const meeting of actual){
    const checkpoint=latestCheckpointFor(meeting.id,checkpoints);
    if(checkpoint)return checkpoint;
  }
  return null;
}

export function deriveClassContinuity(classes:AcademicClass[],core:TeachingCoreContext):ClassContinuity[]{
  return classes.map(classroom=>{
    const actual=core.meetings.filter(m=>m.class_id===classroom.id&&!['planned','archived'].includes(m.status)).sort(byOccurrenceDesc);
    const activeMeeting=actual.find(m=>m.status==='in_progress')??null;
    const latestActualMeeting=actual[0]??null;
    const meaningfulCheckpoint=latestMeaningfulCheckpoint(actual,activeMeeting,core.checkpoints);
    const contextMeeting=activeMeeting??latestActualMeeting;
    const lesson=contextMeeting?.lesson_id?core.lessons.find(l=>l.id===contextMeeting.lesson_id)??null:null;
    const lessonVersion=contextMeeting?.lesson_version_id?core.lessonVersions.find(v=>v.id===contextMeeting.lesson_version_id)??null:null;
    return{
      classroom,
      state:activeMeeting?'active':latestActualMeeting?'history':'empty',
      activeMeeting,
      latestActualMeeting,
      latestMeaningfulCheckpoint:meaningfulCheckpoint,
      latestMeeting:latestActualMeeting,
      latestCheckpoint:meaningfulCheckpoint,
      lesson,
      lessonVersion,
    };
  });
}

export async function loadContinuityContext(client:SupabaseClient,workspaceId:string):Promise<ContinuityContext>{
  const [core,classResult]=await Promise.all([
    loadOwnedTeachingCore(client,workspaceId),
    client.from('classes').select('*').eq('workspace_id',workspaceId).eq('status','active').order('display_name',{ascending:true}),
  ]);
  if(classResult.error)throw new Error(`Continuity class load failed: ${classResult.error.message}`);
  const classes=(classResult.data??[]) as AcademicClass[];
  return{classes,core,byClass:deriveClassContinuity(classes,core)};
}

export type StartTeachingMeetingResult={outcome:'started'|'continued';meeting_id:string;meeting_status:'in_progress';occurred_at:string;replayed:boolean};
export async function startTeachingMeeting(client:SupabaseClient,input:{opId:string;classId:string;lessonId?:string|null;lessonVersionId?:string|null}):Promise<StartTeachingMeetingResult>{
  const{data,error}=await client.rpc('start_teaching_meeting_operation',{p_op_id:input.opId,p_class_id:input.classId,p_lesson_id:input.lessonId??null,p_lesson_version_id:input.lessonVersionId??null});
  if(error)throw new Error(`Start Class belum terkonfirmasi: ${error.message}`);
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error('Start Class tidak mengembalikan Meeting.');
  return{outcome:row.outcome,meeting_id:row.meeting_id,meeting_status:row.meeting_status,occurred_at:row.occurred_at,replayed:Boolean(row.replayed)};
}

export type MeetingLifecycleAction='completed'|'cancelled';
export async function setTeachingMeetingStatus(client:SupabaseClient,input:{opId:string;meetingId:string;status:MeetingLifecycleAction}){
  const{data,error}=await client.rpc('set_teaching_meeting_status_operation',{p_op_id:input.opId,p_meeting_id:input.meetingId,p_status:input.status});
  if(error)throw new Error(`Lifecycle Meeting belum terkonfirmasi: ${error.message}`);
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error('Lifecycle Meeting tidak mengembalikan hasil.');
  return{outcome:String(row.outcome),meeting_status:row.meeting_status as MeetingLifecycleAction,replayed:Boolean(row.replayed)};
}
