import{createElement}from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{PacingPanel}from'../../../src/components/PacingPanel';

const WORKSPACE='PACE-W',CLASS='PACE-C',LESSON='PACE-L',VERSION='PACE-V';
let root:Root|null=null,plan:any=null,activeCorrectionCount=1;

function fakeClient(){
  const client:any={
    from(table:string){
      let filters:[string,unknown][]=[];
      const source=()=>table==='lesson_pacing_plans'?(plan?[plan]:[]):table==='correction_sessions'?Array.from({length:activeCorrectionCount},(_,i)=>({id:`S${i+1}`,workspace_id:WORKSPACE,class_id:CLASS,status:'active'})):[];
      const execute=()=>source().filter(row=>filters.every(([key,value])=>row[key]===value));
      const builder:any={select(){return builder;},eq(key:string,value:unknown){filters.push([key,value]);return builder;},async maybeSingle(){const rows=execute();return{data:rows[0]??null,error:null};},then(resolve:any,reject:any){return Promise.resolve({data:execute(),error:null}).then(resolve,reject);}};
      return builder;
    },
    async rpc(name:string,args:Record<string,any>){
      if(name!=='upsert_lesson_pacing_plan_operation')return{data:null,error:{message:`unexpected RPC ${name}`}};
      const currentRevision=plan?.revision??0;
      if(args.p_expected_revision!==currentRevision)return{data:[{outcome:'conflict',revision:currentRevision,replayed:false,plan_id:plan?.id??null}],error:null};
      const revision=currentRevision+1;
      plan={id:plan?.id??'PACE-P',workspace_id:WORKSPACE,class_id:args.p_class_id,lesson_id:args.p_lesson_id,lesson_version_id:args.p_lesson_version_id,normal_meetings:args.p_normal_meetings,available_meetings:args.p_available_meetings,correction_reserve:args.p_correction_reserve,core_targets:args.p_core_targets,practice_targets:args.p_practice_targets,stretch_targets:args.p_stretch_targets,minimum_exit_criteria:args.p_minimum_exit_criteria,teacher_mode:args.p_teacher_mode,revision,created_at:'2026-09-06T00:00:00Z',updated_at:'2026-09-06T00:00:00Z'};
      return{data:[{outcome:'saved',revision,replayed:false,plan_id:plan.id}],error:null};
    },
  };
  return client as SupabaseClient;
}

export function mountPacingHarness(){
  root?.unmount();document.getElementById('pacing-test-root')?.remove();plan=null;activeCorrectionCount=1;
  const host=document.createElement('div');host.id='pacing-test-root';document.body.appendChild(host);root=createRoot(host);
  root.render(createElement(PacingPanel,{client:fakeClient(),workspaceId:WORKSPACE,classId:CLASS,lessonId:LESSON,lessonVersionId:VERSION,actualMeetingCount:2}));
}
