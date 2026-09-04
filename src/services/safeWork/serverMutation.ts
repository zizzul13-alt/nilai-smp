import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentJudgementPayload, PendingOperation, StudentRenamePayload, SyncResult } from '../../domain/safeWork';
const permanentServerErrors:Record<string,string>={P3201:'WORKSPACE_INTEGRITY',P3202:'OP_ID_MISMATCH',P3203:'TARGET_NOT_OWNED_OR_FOUND',P3401:'WORKSPACE_INTEGRITY',P3402:'ASSESSMENT_NOT_OWNED_OR_FOUND',P3403:'ENROLLMENT_NOT_IN_CLASS','22023':'INVALID_OPERATION'};
function classifyError(error:{code?:string|null}):SyncResult|null{
  if(error.code==='PGRST301'||error.code==='28000')return{kind:'retryable',code:'AUTH_REQUIRED'};
  if(!navigator.onLine||error.code==='PGRST000')return{kind:'retryable',code:'NETWORK'};
  const code=permanentServerErrors[error.code??''];return code?{kind:'failed',code}:null;
}
export async function applyStudentRename(client:SupabaseClient,op:PendingOperation):Promise<SyncResult>{
  const payload=op.payload as StudentRenamePayload;
  const{data,error}=await client.rpc('apply_student_rename_operation',{p_op_id:op.op_id,p_student_id:op.entity_id,p_display_name:payload.display_name,p_expected_revision:op.expected_revision});
  if(error)return classifyError(error)??{kind:'failed',code:error.code||'SERVER_ERROR'};
  const row=Array.isArray(data)?data[0]:data;if(!row)return{kind:'failed',code:'EMPTY_SERVER_RESULT'};
  if(row.outcome==='conflict')return{kind:'conflict',revision:Number(row.revision)};
  return{kind:'saved',revision:Number(row.revision),replayed:Boolean(row.replayed)};
}
export async function applyAssessmentJudgement(client:SupabaseClient,op:PendingOperation):Promise<SyncResult>{
  const p=op.payload as AssessmentJudgementPayload;
  const{data,error}=await client.rpc('apply_assessment_judgement_operation',{p_op_id:op.op_id,p_assessment_id:p.assessment_id,p_enrollment_id:p.enrollment_id,p_state:p.state,p_score:p.score,p_attempt_kind:p.attempt_kind,p_raw_score:p.raw_score,p_evidence:p.evidence,p_expected_revision:op.expected_revision});
  if(error)return classifyError(error)??{kind:'failed',code:error.code||'SERVER_ERROR'};
  const row=Array.isArray(data)?data[0]:data;if(!row)return{kind:'failed',code:'EMPTY_SERVER_RESULT'};
  if(row.outcome==='conflict')return{kind:'conflict',revision:Number(row.revision),canonical:{state:row.state??null,score:row.score===null?null:Number(row.score)}};
  return{kind:'saved',revision:Number(row.revision),replayed:Boolean(row.replayed)};
}
export function applySafeWorkOperation(client:SupabaseClient,op:PendingOperation){return op.operation_kind==='assessment.judgement'?applyAssessmentJudgement(client,op):applyStudentRename(client,op);}
