import{createElement}from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{Today}from'../../../src/components/Today';
import{enqueueMeetingCheckpoint,safeWorkDb}from'../../../src/services/safeWork/localQueue';
import type{TodayClassContext}from'../../../src/services/academic/today';

const USER='TODAY-RECON-U',WORKSPACE='TODAY-RECON-W';
let root:Root|null=null,failTodayReads=false;

const activeClass:TodayClassContext={
  class_id:'C1',class_name:'VIII A',
  active_meeting_id:'M1',active_meeting_occurred_at:'2026-09-06T01:00:00Z',active_lesson_title:'Gaya',
  latest_actual_meeting_id:'M1',latest_actual_meeting_occurred_at:'2026-09-06T01:00:00Z',latest_actual_meeting_status:'in_progress',
  active_checkpoint_id:'CP-SERVER',active_checkpoint_stopped_at:'Server LAST',active_checkpoint_next_step:'Server NEXT',active_checkpoint_recorded_at:'2026-09-06T01:30:00Z',
  latest_checkpoint_id:'CP-SERVER',latest_checkpoint_meeting_id:'M1',latest_checkpoint_stopped_at:'Server LAST',latest_checkpoint_next_step:'Server NEXT',latest_checkpoint_recorded_at:'2026-09-06T01:30:00Z',
  latest_baseline_id:null,latest_baseline_kind:null,latest_baseline_stopped_at:null,latest_baseline_next_step:null,latest_baseline_recorded_at:null,
  effective_source:'checkpoint',effective_stopped_at:'Server LAST',effective_next_step:'Server NEXT',effective_recorded_at:'2026-09-06T01:30:00Z',
};

function fakeClient(){
  const client:any={
    rpc:async(name:string)=>{
      if(name==='read_today_class_contexts')return failTodayReads?{data:null,error:{message:'synthetic canonical outage'}}:{data:[activeClass],error:null};
      if(name==='read_today_active_correction')return failTodayReads?{data:null,error:{message:'synthetic canonical outage'}}:{data:[],error:null};
      return{data:null,error:{message:`unexpected RPC ${name}`}};
    },
    from(){throw new Error('table query not expected in checkpoint reconciliation harness');},
  };
  return client as SupabaseClient;
}

export async function mountTodayCheckpointReconcileHarness(){
  root?.unmount();document.getElementById('today-reconcile-root')?.remove();
  await safeWorkDb.operations.clear();failTodayReads=false;
  const host=document.createElement('div');host.id='today-reconcile-root';document.body.appendChild(host);root=createRoot(host);
  root.render(createElement(Today,{client:fakeClient(),userId:USER,workspaceId:WORKSPACE,onOpenContinuity:()=>undefined,onOpenRapid:()=>undefined}));
}

export function setTodayCanonicalReadFailure(value:boolean){failTodayReads=value;}

export async function enqueueCheckpointWhileCanonicalUnavailable(){
  return enqueueMeetingCheckpoint(safeWorkDb,{authUserId:USER,workspaceId:WORKSPACE,meetingId:'M1',stoppedAt:'Local Offline LAST',nextStep:'Local Offline NEXT',opId:'d2000000-0000-0000-0000-000000000001'});
}
