import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcademicClass,Assessment,CorrectionSession,Enrollment,Result,ScoringProfile,Student } from '../../domain/academic';
import { enqueueAssessmentJudgement,pendingForNamespace,type SafeWorkDb } from '../safeWork/localQueue';
export type CorrectionContext={assessment:Assessment;academicClass:AcademicClass;scoringProfile:ScoringProfile|null;enrollments:Enrollment[];students:Student[];results:Result[];session:CorrectionSession|null};
export async function loadCorrectionContext(client:SupabaseClient,workspaceId:string,assessmentId:string):Promise<CorrectionContext>{
  const{data:assessment,error:aerr}=await client.from('assessments').select('*').eq('workspace_id',workspaceId).eq('id',assessmentId).single();if(aerr)throw aerr;
  const a=assessment as Assessment;
  const [classQ,enrollQ,studentQ,resultQ,profileQ,sessionQ]=await Promise.all([
    client.from('classes').select('*').eq('workspace_id',workspaceId).eq('id',a.class_id).single(),
    client.from('enrollments').select('*').eq('workspace_id',workspaceId).eq('class_id',a.class_id),
    client.from('students').select('*').eq('workspace_id',workspaceId),
    client.from('assessment_results').select('*').eq('workspace_id',workspaceId).eq('assessment_id',assessmentId),
    a.scoring_profile_id?client.from('scoring_profiles').select('*').eq('workspace_id',workspaceId).eq('id',a.scoring_profile_id).single():Promise.resolve({data:null,error:null}),
    client.from('correction_sessions').select('*').eq('workspace_id',workspaceId).eq('assessment_id',assessmentId).order('updated_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  for(const q of [classQ,enrollQ,studentQ,resultQ,profileQ,sessionQ])if(q.error)throw q.error;
  const studentIds=new Set((enrollQ.data??[]).map((e:any)=>e.student_id));
  return{assessment:a,academicClass:classQ.data as AcademicClass,scoringProfile:profileQ.data as ScoringProfile|null,enrollments:(enrollQ.data??[]) as Enrollment[],students:(studentQ.data??[]).filter((s:any)=>studentIds.has(s.id)) as Student[],results:(resultQ.data??[]) as Result[],session:sessionQ.data as CorrectionSession|null};
}
export async function startOrResumeCorrection(client:SupabaseClient,workspaceId:string,assessment:Assessment,existing:CorrectionSession|null){
  if(existing?.status==='active')return existing;
  const row={id:crypto.randomUUID(),workspace_id:workspaceId,assessment_id:assessment.id,class_id:assessment.class_id,status:'active',current_enrollment_id:null};
  const{data,error}=await client.from('correction_sessions').insert(row).select('*').single();if(error)throw error;return data as CorrectionSession;
}
export async function setCorrectionPosition(client:SupabaseClient,session:CorrectionSession,enrollmentId:string|null){const{data,error}=await client.from('correction_sessions').update({current_enrollment_id:enrollmentId,updated_at:new Date().toISOString()}).eq('id',session.id).select('*').single();if(error)throw error;return data as CorrectionSession;}
export async function completeCorrection(client:SupabaseClient,session:CorrectionSession){const now=new Date().toISOString();const{data,error}=await client.from('correction_sessions').update({status:'completed',completed_at:now,updated_at:now}).eq('id',session.id).select('*').single();if(error)throw error;return data as CorrectionSession;}
export function searchCorrectionStudents(context:CorrectionContext,query:string){const q=query.trim().toLocaleLowerCase('id-ID');return context.enrollments.map(enrollment=>({enrollment,student:context.students.find(s=>s.id===enrollment.student_id)!})).filter(x=>x.student&&(q===''||x.student.display_name.toLocaleLowerCase('id-ID').includes(q)||(x.student.nis??'').includes(q)||(x.student.nisn??'').includes(q)));}
export async function queueCorrectionJudgement(db:SafeWorkDb,input:{authUserId:string;workspaceId:string;assessmentId:string;enrollmentId:string;state:Result['state'];score:number|null;result:Result|null}){
  const causalKey=`assessment_result:${input.assessmentId}:${input.enrollmentId}`;const pending=(await pendingForNamespace(db,input.authUserId,input.workspaceId)).filter(op=>op.causal_key===causalKey);
  const expectedRevision=pending.length?Math.max(...pending.map(op=>op.expected_revision))+1:(input.result?.revision??0);
  // Rapid Correction is only workflow identity. Without an explicit academic-evidence choice,
  // it must not fabricate ORIGINAL/MAKEUP/REMEDIAL/CORRECTION Attempt history.
  return enqueueAssessmentJudgement(db,{...input,expectedRevision,attemptKind:null,rawScore:null,evidence:{}});
}
