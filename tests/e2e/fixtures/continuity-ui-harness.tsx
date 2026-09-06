import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TeachingContinuity } from '../../../src/components/TeachingContinuity';
import { safeWorkDb } from '../../../src/services/safeWork/localQueue';
import type { SafeWorkSyncWorker } from '../../../src/services/safeWork/syncWorker';

const USER_ID='A';
const WORKSPACE_ID='WA';
const CLASS_ID='C1';
let root:Root|null=null;
let meetingId='M1';
let meetingStatus:'in_progress'|'completed'|'cancelled'='in_progress';
let lifecycleCalls:{completed:number;cancelled:number}={completed:0,cancelled:0};

const classroom={id:CLASS_ID,workspace_id:WORKSPACE_ID,academic_period_id:'P1',identity_key:'viii-a',display_name:'VIII A',status:'active'};

function rowsFor(table:string){
  if(table==='classes')return[classroom];
  if(table==='meetings')return[{id:meetingId,workspace_id:WORKSPACE_ID,class_id:CLASS_ID,lesson_id:null,lesson_version_id:null,occurred_at:'2026-09-05T08:00:00Z',status:meetingStatus}];
  if(table==='continuity_baselines')return[];
  return[];
}

function fakeClient(){
  return{
    from(table:string){
      const filters:Array<[string,unknown]>=[];
      let take:number|null=null;
      const rows=()=>rowsFor(table).filter(row=>filters.every(([column,value])=>(row as Record<string,unknown>)[column]===value)).slice(0,take??undefined);
      const result=()=>({data:rows(),error:null});
      const query:any={
        select:()=>query,
        eq:(column:string,value:unknown)=>{filters.push([column,value]);return query;},
        order:()=>query,
        limit:(value:number)=>{take=value;return query;},
        maybeSingle:async()=>({data:rows()[0]??null,error:null}),
        then:(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject),
      };
      return query;
    },
    async rpc(name:string,args:Record<string,unknown>){
      if(name!=='set_teaching_meeting_status_operation')return{data:null,error:{message:`Unexpected RPC ${name}`}};
      if(args.p_meeting_id!==meetingId)return{data:null,error:{message:'wrong Meeting'}};
      const next=args.p_status as 'completed'|'cancelled';
      lifecycleCalls[next]++;
      meetingStatus=next;
      return{data:[{outcome:'saved',meeting_status:next,replayed:false}],error:null};
    },
  } as unknown as SupabaseClient;
}

const noSyncWorker={syncNamespace:async()=>{}} as unknown as SafeWorkSyncWorker;

export async function mountContinuityUiHarness(nextMeetingId:string){
  root?.unmount();
  document.getElementById('continuity-test-root')?.remove();
  await safeWorkDb.operations.clear();
  meetingId=nextMeetingId;
  meetingStatus='in_progress';
  lifecycleCalls={completed:0,cancelled:0};
  const host=document.createElement('div');
  host.id='continuity-test-root';
  document.body.appendChild(host);
  root=createRoot(host);
  root.render(createElement(TeachingContinuity,{client:fakeClient(),worker:noSyncWorker,userId:USER_ID,workspaceId:WORKSPACE_ID}));
}

export function continuityHarnessSnapshot(){
  return{meetingId,meetingStatus,lifecycleCalls:{...lifecycleCalls}};
}
