import {createElement} from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{Today}from'../../../src/components/Today';
import{RapidCorrection}from'../../../src/components/RapidCorrection';
import{enqueueMeetingCheckpoint,markOperation,safeWorkDb}from'../../../src/services/safeWork/localQueue';
import type{TodayClassContext,TodayCorrection}from'../../../src/services/academic/today';

const USER='TODAY-U',WORKSPACE='TODAY-W';let root:Root|null=null;let classes:TodayClassContext[]=[];let correction:TodayCorrection|null=null;let nav:{surface:'continuity'|'rapid';id?:string}[]=[];let baselineWrites:{kind:string;classId:string;stoppedAt:string;nextStep:string|null}[]=[];let originalCheckpoint:{stoppedAt:string|null;nextStep:string|null}|null=null;let meetingRows:{id:string;workspace_id:string;class_id:string}[]=[];let rapidTables:Record<string,any[]>={};let activeClient:SupabaseClient|null=null;let followRapid=false;

type CheckpointSeed={meetingId:string;stoppedAt:string;nextStep:string|null;status?:'PENDING_SAFE'|'FAILED'|'CONFLICT'};
type HarnessOptions={pending?:boolean;failReads?:boolean;checkpoint?:CheckpointSeed;meetingMap?:Record<string,string>;followRapid?:boolean};

function context(input:Partial<TodayClassContext>={}):TodayClassContext{return{class_id:'C1',class_name:'VIII A',active_meeting_id:null,active_meeting_occurred_at:null,active_lesson_title:null,latest_actual_meeting_id:'M0',latest_actual_meeting_occurred_at:'2026-09-05T08:00:00Z',latest_actual_meeting_status:'completed',active_checkpoint_id:null,active_checkpoint_stopped_at:null,active_checkpoint_next_step:null,active_checkpoint_recorded_at:null,latest_checkpoint_id:'CP0',latest_checkpoint_meeting_id:'M0',latest_checkpoint_stopped_at:'Halaman 10',latest_checkpoint_next_step:'Nomor 2',latest_checkpoint_recorded_at:'2026-09-05T08:30:00Z',latest_baseline_id:null,latest_baseline_kind:null,latest_baseline_stopped_at:null,latest_baseline_next_step:null,latest_baseline_recorded_at:null,effective_source:'checkpoint',effective_stopped_at:'Halaman 10',effective_next_step:'Nomor 2',effective_recorded_at:'2026-09-05T08:30:00Z',...input};}

function scenario(name:string):{classes:TodayClassContext[];correction:TodayCorrection|null}{
  if(name==='active'||name==='pending')return{classes:[context({active_meeting_id:'M1',active_meeting_occurred_at:'2026-09-06T01:00:00Z',active_lesson_title:'Gaya',latest_actual_meeting_id:'M1',latest_actual_meeting_occurred_at:'2026-09-06T01:00:00Z',latest_actual_meeting_status:'in_progress',active_checkpoint_id:'CPA',active_checkpoint_stopped_at:name==='pending'?'Server LAST':'Halaman 37',active_checkpoint_next_step:name==='pending'?'Server NEXT':'Nomor 3',active_checkpoint_recorded_at:'2026-09-06T01:30:00Z',latest_checkpoint_id:'CPA',latest_checkpoint_meeting_id:'M1',latest_checkpoint_stopped_at:name==='pending'?'Server LAST':'Halaman 37',latest_checkpoint_next_step:name==='pending'?'Server NEXT':'Nomor 3',latest_checkpoint_recorded_at:'2026-09-06T01:30:00Z',effective_stopped_at:name==='pending'?'Server LAST':'Halaman 37',effective_next_step:name==='pending'?'Server NEXT':'Nomor 3',effective_recorded_at:'2026-09-06T01:30:00Z'})],correction:null};
  if(name==='correction')return{classes:[context()],correction:{session_id:'S1',assessment_id:'A1',assessment_title:'Kuis Gerak',class_id:'C1',class_name:'VIII A',current_enrollment_id:'E9',started_at:'2026-09-06T01:00:00Z',updated_at:'2026-09-06T02:00:00Z',active_count:1}};
  if(name==='stale')return{classes:[context({latest_actual_meeting_occurred_at:'2026-07-01T08:00:00Z',latest_checkpoint_recorded_at:'2026-07-01T09:00:00Z',effective_recorded_at:'2026-07-01T09:00:00Z',latest_checkpoint_stopped_at:'Bab lama',latest_checkpoint_next_step:'PR lama',effective_stopped_at:'Bab lama',effective_next_step:'PR lama'})],correction:null};
  if(name==='active-stale')return{classes:[context({active_meeting_id:'M1',active_meeting_occurred_at:'2026-09-06T01:00:00Z',latest_actual_meeting_id:'M1',latest_actual_meeting_status:'in_progress',latest_checkpoint_meeting_id:'M1',effective_recorded_at:'2026-07-01T09:00:00Z',effective_stopped_at:'Konteks lama aktif',effective_next_step:'Jangan re-entry'})],correction:null};
  if(name==='old-recovery')return{classes:[context({latest_actual_meeting_id:'M-new',latest_actual_meeting_occurred_at:'2026-09-06T01:00:00Z',latest_actual_meeting_status:'completed'})],correction:null};
  if(name==='outside-window')return{classes:Array.from({length:24},(_,i)=>context({class_id:`C${i+1}`,class_name:`Class ${i+1}`,latest_actual_meeting_id:`M${i+1}`})),correction:null};
  if(name==='empty')return{classes:[],correction:null};
  return{classes:[context()],correction:null};
}

function seedRapid(){
  rapidTables={
    assessments:[{id:'A1',workspace_id:WORKSPACE,class_id:'C1',academic_period_id:'P1',activity_id:null,scoring_profile_id:null,title:'Kuis Gerak',description:null,instructions:null,status:'active',created_at:'',updated_at:''}],
    classes:[{id:'C1',workspace_id:WORKSPACE,academic_period_id:'P1',display_name:'VIII A',status:'active'}],
    enrollments:[{id:'E9',workspace_id:WORKSPACE,class_id:'C1',student_id:'S9',status:'active'},{id:'E12',workspace_id:WORKSPACE,class_id:'C1',student_id:'S12',status:'active'}],
    students:[{id:'S9',workspace_id:WORKSPACE,display_name:'Siswa E9',nis:'9009',nisn:null},{id:'S12',workspace_id:WORKSPACE,display_name:'Siswa E12',nis:'9012',nisn:null}],
    assessment_results:[],scoring_profiles:[],
    correction_sessions:[{id:'S1',workspace_id:WORKSPACE,assessment_id:'A1',class_id:'C1',status:'active',current_enrollment_id:'E9',started_at:'2026-09-06T01:00:00Z',updated_at:'2026-09-06T02:00:00Z',completed_at:null}],
  };
}

function fakeClient(failReads=false){
  const client:any={rpc:async(name:string,args?:Record<string,unknown>)=>{
    if(name==='read_today_class_contexts')return failReads?{data:null,error:{message:'synthetic Today read failure'}}:{data:classes,error:null};
    if(name==='read_today_active_correction')return failReads?{data:null,error:{message:'synthetic Today read failure'}}:{data:correction?[correction]:[],error:null};
    if(name==='record_continuity_baseline_operation'){
      const classId=String(args?.p_class_id),kind=String(args?.p_baseline_kind),stoppedAt=String(args?.p_stopped_at),nextStep=(args?.p_next_step as string|null)??null;baselineWrites.push({kind,classId,stoppedAt,nextStep});
      classes=classes.map(item=>item.class_id===classId?{...item,latest_baseline_id:`B${baselineWrites.length}`,latest_baseline_kind:kind as 'QUICK_UPDATE'|'START_FROM_TODAY',latest_baseline_stopped_at:stoppedAt,latest_baseline_next_step:nextStep,latest_baseline_recorded_at:'2099-01-01T00:00:00Z',effective_source:'baseline',effective_stopped_at:stoppedAt,effective_next_step:nextStep,effective_recorded_at:'2099-01-01T00:00:00Z'}:item);
      return{data:[{outcome:'saved',baseline_id:`B${baselineWrites.length}`,recorded_at:'2099-01-01T00:00:00Z',replayed:false}],error:null};
    }
    return{data:null,error:{message:`unexpected RPC ${name}`}};
  },from(table:string){
    let filters:[string,unknown][]=[],orderBy:{key:string;ascending:boolean}|null=null,limitN:number|null=null,mutation:{kind:'update';patch:Record<string,unknown>}|null=null;
    const source=()=>table==='meetings'?meetingRows:(rapidTables[table]??[]);const matches=(row:any)=>filters.every(([key,value])=>row[key]===value);
    const execute=()=>{
      if(mutation){const changed:any[]=[];if(table==='meetings')return changed;rapidTables[table]=(rapidTables[table]??[]).map((row:any)=>{if(!matches(row))return row;const next={...row,...mutation!.patch};changed.push(next);return next;});return changed;}
      let rows=source().filter(matches);if(orderBy)rows=[...rows].sort((a:any,b:any)=>{const cmp=String(a[orderBy!.key]??'').localeCompare(String(b[orderBy!.key]??''));return orderBy!.ascending?cmp:-cmp;});if(limitN!==null)rows=rows.slice(0,limitN);return rows;
    };
    const builder:any={select(){return builder;},eq(key:string,value:unknown){filters.push([key,value]);return builder;},order(key:string,opts:{ascending:boolean}){orderBy={key,ascending:opts.ascending};return builder;},limit(n:number){limitN=n;return builder;},update(patch:Record<string,unknown>){mutation={kind:'update',patch};return builder;},async maybeSingle(){const rows=execute();return rows.length<=1?{data:rows[0]??null,error:null}:{data:null,error:{message:`Expected <=1 ${table} row`}};},async single(){const rows=execute();return rows.length===1?{data:rows[0],error:null}:{data:null,error:{message:`Expected one ${table} row, got ${rows.length}`}};},then(resolve:any,reject:any){return Promise.resolve({data:execute(),error:null}).then(resolve,reject);}};return builder;
  }};return client as SupabaseClient;
}

const worker={syncNamespace:async()=>undefined} as any;
function renderRapid(assessmentId='A1'){if(!root||!activeClient)return;root.render(createElement(RapidCorrection,{client:activeClient,worker,userId:USER,workspaceId:WORKSPACE,initialAssessmentId:assessmentId}));}

export async function mountTodayHarness(name:string,options:HarnessOptions={}){
  root?.unmount();document.getElementById('today-test-root')?.remove();await safeWorkDb.operations.clear();nav=[];baselineWrites=[];meetingRows=[];followRapid=Boolean(options.followRapid);seedRapid();
  const selected=scenario(name);classes=selected.classes;correction=selected.correction;originalCheckpoint=classes[0]?{stoppedAt:classes[0].latest_checkpoint_stopped_at,nextStep:classes[0].latest_checkpoint_next_step}:null;
  const seen=new Set<string>();for(const item of classes)for(const meetingId of[item.active_meeting_id,item.latest_actual_meeting_id])if(meetingId&&!seen.has(meetingId)){meetingRows.push({id:meetingId,workspace_id:WORKSPACE,class_id:item.class_id});seen.add(meetingId);}for(const[meetingId,classId]of Object.entries(options.meetingMap??{}))if(!seen.has(meetingId))meetingRows.push({id:meetingId,workspace_id:WORKSPACE,class_id:classId});
  const checkpoint=options.checkpoint??(options.pending?{meetingId:'M1',stoppedAt:'Local Pending',nextStep:'Belum sync',status:'PENDING_SAFE' as const}:null);if(checkpoint){const op=await enqueueMeetingCheckpoint(safeWorkDb,{authUserId:USER,workspaceId:WORKSPACE,meetingId:checkpoint.meetingId,stoppedAt:checkpoint.stoppedAt,nextStep:checkpoint.nextStep,opId:'d1000000-0000-0000-0000-000000000001'});if(checkpoint.status&&checkpoint.status!=='PENDING_SAFE')await markOperation(safeWorkDb,op.op_id,{status:checkpoint.status,last_error_code:checkpoint.status==='FAILED'?'TEST_FAILED':'REVISION_CONFLICT'});}
  const host=document.createElement('div');host.id='today-test-root';document.body.appendChild(host);root=createRoot(host);activeClient=fakeClient(Boolean(options.failReads));
  root.render(createElement(Today,{client:activeClient,userId:USER,workspaceId:WORKSPACE,onOpenContinuity:(id?:string)=>nav.push({surface:'continuity',id}),onOpenRapid:(id?:string)=>{nav.push({surface:'rapid',id});if(followRapid)renderRapid(id);}}));
}
export async function forceRapidStaleCursorAndRefresh(cursor='E9'){const session=rapidTables.correction_sessions?.find((row:any)=>row.id==='S1');if(session)session.current_enrollment_id=cursor;activeClient=fakeClient(false);renderRapid('A1');}
export async function remountTodayWithoutPending(name:string){return mountTodayHarness(name);}
export function todayHarnessSnapshot(){return{nav:[...nav],baselineWrites:[...baselineWrites],originalCheckpoint,currentCheckpoint:classes[0]?{stoppedAt:classes[0].latest_checkpoint_stopped_at,nextStep:classes[0].latest_checkpoint_next_step}:null,effective:classes[0]?{source:classes[0].effective_source,stoppedAt:classes[0].effective_stopped_at,nextStep:classes[0].effective_next_step}:null,rapidCursor:rapidTables.correction_sessions?.find((row:any)=>row.id==='S1')?.current_enrollment_id??null};}
