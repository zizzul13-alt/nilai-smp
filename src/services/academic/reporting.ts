import type{SupabaseClient}from'@supabase/supabase-js';
import type{AcademicClass}from'../../domain/academic';

export type ReportingPolicy={
  id:string;workspace_id:string;academic_period_id:string;policy_key:string;version_no:number;name:string;
  aggregation:'SIMPLE_MEAN';missing_policy:'EXCLUDE'|'ZERO';excused_policy:'EXCLUDE';
  remedial_policy:'CURRENT_RESULT';rounding_mode:'NONE'|'INTEGER'|'ONE_DECIMAL';
  kkm:number|null;status:'active'|'archived';created_at:string;
};
export type ReportingCycle={
  id:string;workspace_id:string;class_id:string;academic_period_id:string;reporting_policy_id:string;
  status:'OPEN'|'FINALIZED';revision:number;current_snapshot_id:string|null;created_at:string;updated_at:string;
};
export type ReportSnapshot={
  id:string;workspace_id:string;cycle_id:string;class_id:string;academic_period_id:string;reporting_policy_id:string;
  snapshot_no:number;kind:'PROVISIONAL'|'FINALIZED';assessment_count:number;enrollment_count:number;source_summary:Record<string,unknown>;created_by:string;created_at:string;
};
export type ReportSnapshotRow={
  id:string;workspace_id:string;snapshot_id:string;class_id:string;enrollment_id:string;student_id:string;student_display_name:string;enrollment_status:string;
  reported_score:number|null;meets_kkm:boolean|null;assessment_count:number;graded_count:number;missing_count:number;excused_count:number;unchecked_count:number;included_count:number;calculation:Record<string,unknown>;
};
export type ReportingContext={classes:AcademicClass[];policies:ReportingPolicy[]};

export async function loadReportingContext(client:SupabaseClient,workspaceId:string):Promise<ReportingContext>{
  const[{data:classes,error:classError},{data:policies,error:policyError}]=await Promise.all([
    client.from('classes').select('id,workspace_id,academic_period_id,identity_key,display_name,status').eq('workspace_id',workspaceId).eq('status','active').order('display_name'),
    client.from('reporting_policies').select('*').eq('workspace_id',workspaceId).eq('status','active').order('created_at',{ascending:false}),
  ]);
  if(classError)throw new Error(`Class reporting load failed: ${classError.message}`);
  if(policyError)throw new Error(`Reporting policy load failed: ${policyError.message}`);
  return{classes:(classes??[])as AcademicClass[],policies:(policies??[])as ReportingPolicy[]};
}

export async function loadReportingCycle(client:SupabaseClient,workspaceId:string,classId:string):Promise<ReportingCycle|null>{
  const{data,error}=await client.from('reporting_cycles').select('*').eq('workspace_id',workspaceId).eq('class_id',classId).maybeSingle();
  if(error)throw new Error(`Reporting cycle load failed: ${error.message}`);
  return data as ReportingCycle|null;
}

export async function loadReportSnapshot(client:SupabaseClient,workspaceId:string,snapshotId:string):Promise<{snapshot:ReportSnapshot;rows:ReportSnapshotRow[]}>{
  const[{data:snapshot,error:snapshotError},{data:rows,error:rowsError}]=await Promise.all([
    client.from('report_snapshots').select('*').eq('workspace_id',workspaceId).eq('id',snapshotId).single(),
    client.from('report_snapshot_rows').select('*').eq('workspace_id',workspaceId).eq('snapshot_id',snapshotId).order('student_display_name'),
  ]);
  if(snapshotError||!snapshot)throw new Error(`Report snapshot load failed: ${snapshotError?.message??'not found'}`);
  if(rowsError)throw new Error(`Report rows load failed: ${rowsError.message}`);
  return{snapshot:snapshot as ReportSnapshot,rows:(rows??[])as ReportSnapshotRow[]};
}

export async function createReportingPolicy(client:SupabaseClient,input:{opId:string;academicPeriodId:string;name:string;policyKey?:string|null;missingPolicy:ReportingPolicy['missing_policy'];remedialPolicy:ReportingPolicy['remedial_policy'];roundingMode:ReportingPolicy['rounding_mode'];kkm:number|null}){
  const{data,error}=await client.rpc('create_reporting_policy_operation',{
    p_op_id:input.opId,p_academic_period_id:input.academicPeriodId,p_name:input.name,p_policy_key:input.policyKey??null,
    p_missing_policy:input.missingPolicy,p_remedial_policy:input.remedialPolicy,p_rounding_mode:input.roundingMode,p_kkm:input.kkm,
  });
  if(error)throw new Error(error.message);
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error('Reporting policy RPC returned no result.');
  return row as{policy_id:string;policy_key:string;version_no:number;replayed:boolean};
}

export async function calculateReportSnapshot(client:SupabaseClient,input:{opId:string;classId:string;policyId:string;finalize:boolean;expectedRevision:number}){
  const{data,error}=await client.rpc('calculate_report_snapshot_operation',{
    p_op_id:input.opId,p_class_id:input.classId,p_reporting_policy_id:input.policyId,p_finalize:input.finalize,p_expected_revision:input.expectedRevision,
  });
  if(error)throw new Error(error.message);
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error('Report snapshot RPC returned no result.');
  return row as{outcome:'saved'|'conflict';cycle_id:string|null;snapshot_id:string|null;revision:number;replayed:boolean};
}

export async function reopenReportingCycle(client:SupabaseClient,input:{opId:string;cycleId:string;reason:string;expectedRevision:number}){
  const{data,error}=await client.rpc('reopen_reporting_cycle_operation',{
    p_op_id:input.opId,p_cycle_id:input.cycleId,p_reason:input.reason,p_expected_revision:input.expectedRevision,
  });
  if(error)throw new Error(error.message);
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error('Reporting reopen RPC returned no result.');
  return row as{outcome:'saved'|'conflict';revision:number;replayed:boolean};
}

export function formatReportedScore(value:number|null){return value===null?'—':Number.isInteger(value)?String(value):String(Number(value.toFixed(2)));}
