import Dexie, { type EntityTable } from 'dexie';
import type {
  AssessmentConflictSnapshot,
  AssessmentJudgementPayload,
  MeetingCheckpointPayload,
  PendingOperation,
  StudentRenamePayload,
} from '../../domain/safeWork';
import type { AttemptKind, ResultState } from '../../domain/academic';
import { publishSafeWorkChange } from './coordination';

export class SafeWorkDb extends Dexie {
  operations!:EntityTable<PendingOperation,'op_id'>;
  constructor(name='nilai-smp-safe-work') {
    super(name);
    this.version(1).stores({operations:'&op_id, auth_user_id, [auth_user_id+workspace_id], [auth_user_id+workspace_id+status], [auth_user_id+workspace_id+entity_type+entity_id], created_at'});
    this.version(2).stores({operations:'&op_id, auth_user_id, [auth_user_id+workspace_id], [auth_user_id+workspace_id+status], [auth_user_id+workspace_id+causal_key], created_at'}).upgrade(async tx=>{
      await tx.table('operations').toCollection().modify(op=>{
        if(!op.causal_key)op.causal_key=`${op.entity_type}:${op.entity_id}`;
      });
    });
  }
}

export const safeWorkDb=new SafeWorkDb();

function signal(op:PendingOperation|undefined){if(op)publishSafeWorkChange(op);}

export type EnqueueStudentRename={authUserId:string;workspaceId:string;studentId:string;displayName:string;expectedRevision:number;opId?:string};
export async function enqueueStudentRename(db:SafeWorkDb,input:EnqueueStudentRename):Promise<PendingOperation>{
  const displayName=input.displayName.trim();
  if(!displayName)throw new Error('Student name must not be blank.');
  const payload:StudentRenamePayload={display_name:displayName};
  const operation:PendingOperation={op_id:input.opId??crypto.randomUUID(),auth_user_id:input.authUserId,workspace_id:input.workspaceId,entity_type:'student',entity_id:input.studentId,causal_key:`student:${input.studentId}`,operation_kind:'student.rename',payload,created_at:new Date().toISOString(),attempt_count:0,last_attempt_at:null,status:'PENDING_SAFE',expected_revision:input.expectedRevision,last_error_code:null,conflict_snapshot:null};
  await db.transaction('rw',db.operations,async()=>{await db.operations.add(operation);});
  signal(operation);
  return operation;
}

export type EnqueueAssessmentJudgement={authUserId:string;workspaceId:string;assessmentId:string;enrollmentId:string;state:ResultState;score:number|null;attemptKind:AttemptKind|null;rawScore:number|null;evidence?:Record<string,unknown>;expectedRevision:number;opId?:string};
export async function enqueueAssessmentJudgement(db:SafeWorkDb,input:EnqueueAssessmentJudgement):Promise<PendingOperation>{
  if(input.state==='GRADED'&&input.score===null)throw new Error('GRADED requires a numeric score.');
  if(input.state!=='GRADED'&&input.score!==null)throw new Error('Only GRADED may carry a score.');
  const payload:AssessmentJudgementPayload={assessment_id:input.assessmentId,enrollment_id:input.enrollmentId,state:input.state,score:input.score,attempt_kind:input.attemptKind,raw_score:input.rawScore,evidence:input.evidence??{}};
  const operation:PendingOperation={op_id:input.opId??crypto.randomUUID(),auth_user_id:input.authUserId,workspace_id:input.workspaceId,entity_type:'assessment_result',entity_id:input.enrollmentId,causal_key:`assessment_result:${input.assessmentId}:${input.enrollmentId}`,operation_kind:'assessment.judgement',payload,created_at:new Date().toISOString(),attempt_count:0,last_attempt_at:null,status:'PENDING_SAFE',expected_revision:input.expectedRevision,last_error_code:null,conflict_snapshot:null};
  await db.transaction('rw',db.operations,async()=>{await db.operations.add(operation);});
  signal(operation);
  return operation;
}

export type EnqueueMeetingCheckpoint={authUserId:string;workspaceId:string;meetingId:string;stoppedAt:string;nextStep?:string|null;opId?:string};
export async function enqueueMeetingCheckpoint(db:SafeWorkDb,input:EnqueueMeetingCheckpoint):Promise<PendingOperation>{
  const stoppedAt=input.stoppedAt.trim();
  if(!stoppedAt)throw new Error('STOPPED AT wajib diisi.');
  const normalizedNext=input.nextStep?.trim()||null;
  const payload:MeetingCheckpointPayload={meeting_id:input.meetingId,stopped_at:stoppedAt,next_step:normalizedNext};
  const operation:PendingOperation={
    op_id:input.opId??crypto.randomUUID(),auth_user_id:input.authUserId,workspace_id:input.workspaceId,
    entity_type:'meeting_checkpoint',entity_id:input.meetingId,causal_key:`meeting_checkpoint:${input.meetingId}`,
    operation_kind:'meeting.checkpoint',payload,created_at:new Date().toISOString(),attempt_count:0,last_attempt_at:null,
    status:'PENDING_SAFE',expected_revision:0,last_error_code:null,conflict_snapshot:null,
  };
  // PENDING_SAFE is returned only after the durable IndexedDB transaction commits.
  await db.transaction('rw',db.operations,async()=>{await db.operations.add(operation);});
  signal(operation);
  return operation;
}

export async function pendingForNamespace(db:SafeWorkDb,authUserId:string,workspaceId:string){
  return db.operations.where('[auth_user_id+workspace_id]').equals([authUserId,workspaceId]).filter(op=>['PENDING_SAFE','FAILED','CONFLICT'].includes(op.status)).sortBy('created_at');
}
export async function pendingMeetingCheckpoints(db:SafeWorkDb,authUserId:string,workspaceId:string,meetingId:string){
  return (await pendingForNamespace(db,authUserId,workspaceId)).filter(op=>op.operation_kind==='meeting.checkpoint'&&op.entity_id===meetingId);
}
export async function hasUnsyncedWork(db:SafeWorkDb,authUserId:string,workspaceId:string){return(await pendingForNamespace(db,authUserId,workspaceId)).length>0;}
export async function hasUnsyncedForUser(db:SafeWorkDb,authUserId:string){return(await db.operations.where('auth_user_id').equals(authUserId).count())>0;}
export async function markSavedAndMinimize(db:SafeWorkDb,opId:string){const op=await db.operations.get(opId);await db.operations.delete(opId);signal(op);}
export async function markOperation(db:SafeWorkDb,opId:string,patch:Partial<PendingOperation>){await db.operations.update(opId,patch);signal(await db.operations.get(opId));}
export async function retryOperation(db:SafeWorkDb,opId:string){await db.operations.update(opId,{status:'PENDING_SAFE',last_error_code:null,conflict_snapshot:null});signal(await db.operations.get(opId));}
export async function discardOperation(db:SafeWorkDb,opId:string){const op=await db.operations.get(opId);await db.operations.delete(opId);signal(op);}

async function sameCausalRows(db:SafeWorkDb,op:PendingOperation){return db.operations.where('[auth_user_id+workspace_id+causal_key]').equals([op.auth_user_id,op.workspace_id,op.causal_key]).sortBy('created_at');}
async function rebaseRows(db:SafeWorkDb,rows:PendingOperation[],baseRevision:number){let revision=baseRevision;for(const row of rows){await db.operations.update(row.op_id,{expected_revision:revision,status:'PENDING_SAFE',last_error_code:null,conflict_snapshot:null});revision++;}}
export async function useServerForConflict(db:SafeWorkDb,opId:string){await db.transaction('rw',db.operations,async()=>{const op=await db.operations.get(opId);if(!op||op.status!=='CONFLICT'||!op.conflict_snapshot)throw new Error('Conflict snapshot is unavailable.');const rows=(await sameCausalRows(db,op)).filter(x=>x.op_id!==op.op_id);await db.operations.delete(opId);await rebaseRows(db,rows,op.conflict_snapshot.canonical_revision);});}
export async function applyLocalAsNewJudgement(db:SafeWorkDb,opId:string):Promise<PendingOperation>{let replacement!:PendingOperation;await db.transaction('rw',db.operations,async()=>{const op=await db.operations.get(opId);if(!op||op.status!=='CONFLICT'||op.operation_kind!=='assessment.judgement'||!op.conflict_snapshot)throw new Error('Assessment conflict snapshot is unavailable.');const snapshot:AssessmentConflictSnapshot=op.conflict_snapshot,successors=(await sameCausalRows(db,op)).filter(x=>x.op_id!==op.op_id);replacement={...op,op_id:crypto.randomUUID(),created_at:op.created_at,attempt_count:0,last_attempt_at:null,status:'PENDING_SAFE',expected_revision:snapshot.canonical_revision,last_error_code:null,conflict_snapshot:null};await db.operations.delete(opId);await db.operations.add(replacement);await rebaseRows(db,successors,snapshot.canonical_revision+1);});return replacement;}
