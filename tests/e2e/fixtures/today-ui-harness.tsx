import {createElement} from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{Today}from'../../../src/components/Today';
import{enqueueMeetingCheckpoint,safeWorkDb}from'../../../src/services/safeWork/localQueue';
import type{TodayClassContext,TodayCorrection}from'../../../src/services/academic/today';

const USER='TODAY-U',WORKSPACE='TODAY-W';let root:Root|null=null;let classes:TodayClassContext[]=[];let correction:TodayCorrection|null=null;let nav:{surface:'continuity'|'rapid';id?:string}[]=[];let baselineWrites:{kind:string;classId:string;stoppedAt:string;nextStep:string|null}[]=[];let originalCheckpoint:{stoppedAt:string|null;nextStep:string|null}|null=null;

function context(input:Partial<TodayClassContext>={}):TodayClassContext{return{class_id:'C1',class_name:'VIII A',active_meeting_id:null,active_meeting_occurred_at:null,active_lesson_title:null,latest_actual_meeting_id:'M0',latest_actual_meeting_occurred_at:'2026-09-05T08:00:00Z',latest_actual_meeting_status:'completed',active_checkpoint_id:null,active_checkpoint_stopped_at:null,active_checkpoint_next_step:null,active_checkpoint_recorded_at:null,latest_checkpoint_id:'CP0',latest_checkpoint_meeting_id:'M0',latest_checkpoint_stopped_at:'Halaman 10',latest_checkpoint_next_step:'Nomor 2',latest_checkpoint_recorded_at:'2026-09-05T08:30:00Z',latest_baseline_id:null,latest_baseline_kind:null,latest_baseline_stopped_at:null,latest_baseline_next_step:null,latest_baseline_recorded_at:null,effective_source:'checkpoint',effective_stopped_at:'Halaman 10',effective_next_step:'Nomor 2',effective_recorded_at:'2026-09-05T08:30:00Z',...input};}

function scenario(name:string){
  if(name==='active')return{classes:[context({active_meeting_id:'M1',active_meeting_occurred_at:'2026-09-06T01:00:00Z',active_lesson_title:'Gaya',latest_actual_meeting_id:'M1',latest_actual_meeting_occurred_at:'2026-09-06T01:00:00Z',latest_actual_meeting_status:'in_progress',active_checkpoint_id:'CPA',active_checkpoint_stopped_at:'Halaman 37',active_checkpoint_next_step:'Nomor 3',active_checkpoint_recorded_at:'2026-09-06T01:30:00Z',latest_checkpoint_id:'CPA',latest_checkpoint_meeting_id:'M1',latest_checkpoint_stopped_at:'Halaman 37',latest_checkpoint_next_step:'Nomor 3',latest_checkpoint_recorded_at:'2026-09-06T01:30:00Z',effective_stopped_at:'Halaman 37',effective_next_step:'Nomor 3',effective_recorded_at:'2026-09-06T01:30:00Z'})],correction:null};
  if(name==='correction')return{classes:[context()],correction:{session_id:'S1',assessment_id:'A1',assessment_title:'Kuis Gerak',class_id:'C1',class_name:'VIII A',current_enrollment_id:'E9',started_at:'2026-09-06T01:00:00Z',updated_at:'2026-09-06T02:00:00Z',active_count:1}};
  if(name==='stale')return{classes:[context({latest_actual_meeting_occurred_at:'2026-07-01T08:00:00Z',latest_checkpoint_recorded_at:'2026-07-01T09:00:00Z',effective_recorded_at:'2026-07-01T09:00:00Z',latest_checkpoint_stopped_at:'Bab lama',latest_checkpoint_next_step:'PR lama',effective_stopped_at:'Bab lama',effective_next_step:'PR lama'})],correction:null};
  if(name==='empty')return{classes:[],correction:null};
  if(name==='pending')return{classes:[context({active_meeting_id:'M1',active_meeting_occurred_at:'2026-09-06T01:00:00Z',latest_actual_meeting_id:'M1',latest_actual_meeting_occurred_at:'2026-09-06T01:00:00Z',latest_actual_meeting_status:'in_progress',active_checkpoint_id:'CPA',active_checkpoint_stopped_at:'Server LAST',active_checkpoint_next_step:'Server NEXT',active_checkpoint_recorded_at:'2026-09-06T01:10:00Z',latest_checkpoint_id:'CPA',latest_checkpoint_meeting_id:'M1',latest_checkpoint_stopped_at:'Server LAST',latest_checkpoint_next_step:'Server NEXT',latest_checkpoint_recorded_at:'2026-09-06T01:10:00Z',effective_stopped_at:'Server LAST',effective_next_step:'Server NEXT',effective_recorded_at:'2026-09-06T01:10:00Z'})],correction:null};
  return{classes:[context()],correction:null};
}

function fakeClient(failReads=false){return{rpc:async(name:string,args?:Record<string,unknown>)=>{
  if(name==='read_today_class_contexts')return failReads?{data:null,error:{message:'synthetic Today read failure'}}:{data:classes,error:null};
  if(name==='read_today_active_correction')return failReads?{data:null,error:{message:'synthetic Today read failure'}}:{data:correction?[correction]:[],error:null};
  if(name==='record_continuity_baseline_operation'){
    const classId=String(args?.p_class_id),kind=String(args?.p_baseline_kind),stoppedAt=String(args?.p_stopped_at),nextStep=(args?.p_next_step as string|null)??null;baselineWrites.push({kind,classId,stoppedAt,nextStep});
    classes=classes.map(item=>item.class_id===classId?{...item,latest_baseline_id:`B${baselineWrites.length}`,latest_baseline_kind:kind as 'QUICK_UPDATE'|'START_FROM_TODAY',latest_baseline_stopped_at:stoppedAt,latest_baseline_next_step:nextStep,latest_baseline_recorded_at:'2099-01-01T00:00:00Z',effective_source:'baseline',effective_stopped_at:stoppedAt,effective_next_step:nextStep,effective_recorded_at:'2099-01-01T00:00:00Z'}:item);
    return{data:[{outcome:'saved',baseline_id:`B${baselineWrites.length}`,recorded_at:'2099-01-01T00:00:00Z',replayed:false}],error:null};
  }
  return{data:null,error:{message:`unexpected RPC ${name}`}};
}} as unknown as SupabaseClient;}

export async function mountTodayHarness(name:string,options:{pending?:boolean;failReads?:boolean}={}){
  root?.unmount();document.getElementById('today-test-root')?.remove();await safeWorkDb.operations.clear();nav=[];baselineWrites=[];
  const selected=scenario(name);classes=selected.classes;correction=selected.correction;originalCheckpoint=classes[0]?{stoppedAt:classes[0].latest_checkpoint_stopped_at,nextStep:classes[0].latest_checkpoint_next_step}:null;
  if(options.pending)await enqueueMeetingCheckpoint(safeWorkDb,{authUserId:USER,workspaceId:WORKSPACE,meetingId:'M1',stoppedAt:'Local Pending',nextStep:'Belum sync',opId:'d1000000-0000-0000-0000-000000000001'});
  const host=document.createElement('div');host.id='today-test-root';document.body.appendChild(host);root=createRoot(host);
  root.render(createElement(Today,{client:fakeClient(Boolean(options.failReads)),userId:USER,workspaceId:WORKSPACE,onOpenContinuity:(id?:string)=>nav.push({surface:'continuity',id}),onOpenRapid:(id?:string)=>nav.push({surface:'rapid',id})}));
}
export async function remountTodayWithoutPending(name:string){return mountTodayHarness(name);}
export function todayHarnessSnapshot(){return{nav:[...nav],baselineWrites:[...baselineWrites],originalCheckpoint,currentCheckpoint:classes[0]?{stoppedAt:classes[0].latest_checkpoint_stopped_at,nextStep:classes[0].latest_checkpoint_next_step}:null,effective:classes[0]?{source:classes[0].effective_source,stoppedAt:classes[0].effective_stopped_at,nextStep:classes[0].effective_next_step}:null};}
