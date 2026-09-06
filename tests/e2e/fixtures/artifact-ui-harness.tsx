import{createElement}from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{Artifacts}from'../../../src/components/Artifacts';

const W='ART-W',L='ART-L',V1='ART-LV1',V2='ART-LV2',R='ART-R';let root:Root|null=null;let lastState:State|null=null;
type State={artifacts:any[];versions:any[];objects:any[];applied:Map<string,any>;lostCreate:boolean;lostAppend:boolean};
type Options={loseCreateAckOnce?:boolean;loseAppendAckOnce?:boolean};
function fakeClient(state:State,options:Options={}){
  const lessons=[{id:L,title:'Gerak Lurus',workspace_id:W,status:'active'}];
  const lessonVersions=[{id:V2,workspace_id:W,lesson_id:L,version_number:2,content_text:'Lesson terbaru v2'},{id:V1,workspace_id:W,lesson_id:L,version_number:1,content_text:'Lesson lama v1'}];
  const reports=[{id:R,workspace_id:W,cycle_id:'ART-CYCLE',class_id:'C',snapshot_no:2,kind:'FINALIZED',created_at:'2026-09-06T00:00:00Z'}];
  const client:any={
    from(table:string){let filters:[string,unknown][]=[];const source=()=>table==='artifacts'?state.artifacts:table==='artifact_versions'?state.versions:table==='artifact_objects'?state.objects:table==='lessons'?lessons:table==='lesson_versions'?lessonVersions:table==='report_snapshots'?reports:[];const execute=()=>source().filter((row:any)=>filters.every(([key,value])=>row[key]===value));const builder:any={select(){return builder;},eq(key:string,value:unknown){filters.push([key,value]);return builder;},order(){return builder;},then(resolve:any,reject:any){return Promise.resolve({data:execute(),error:null}).then(resolve,reject);}};return builder;},
    async rpc(name:string,args:Record<string,any>){
      const prior=state.applied.get(args.p_op_id);
      if(prior)return{data:[{...prior,replayed:true}],error:null};
      if(name==='create_artifact_operation'){
        const id=`ART-${state.artifacts.length+1}`,version=`ART-V${state.versions.length+1}`;const result={artifact_id:id,version_id:version,revision:1,replayed:false};
        state.artifacts.push({id,workspace_id:W,artifact_type:args.p_artifact_type,title:args.p_title,status:'active',revision:1,current_version_id:version,created_at:'2026-09-06T00:00:00Z',updated_at:'2026-09-06T00:00:00Z'});
        state.versions.unshift({id:version,workspace_id:W,artifact_id:id,version_no:1,source_kind:args.p_source_kind,lesson_id:args.p_lesson_id,lesson_version_id:args.p_lesson_version_id,report_snapshot_id:args.p_report_snapshot_id,canonical_text:args.p_canonical_text,structured_content:{},template_key:null,generator_provider:null,provenance:{},created_by:'U',created_at:'2026-09-06T00:00:00Z'});
        state.applied.set(args.p_op_id,result);
        if(options.loseCreateAckOnce&&!state.lostCreate){state.lostCreate=true;return{data:null,error:{message:'simulated lost ACK after create commit'}};}
        return{data:[result],error:null};
      }
      if(name==='append_artifact_version_operation'){
        const art=state.artifacts.find(item=>item.id===args.p_artifact_id);if(!art)return{data:null,error:{message:'artifact missing'}};
        const version=`ART-V${state.versions.length+1}`,versionNo=state.versions.filter(item=>item.artifact_id===art.id).length+1,result={outcome:'saved',version_id:version,version_no:versionNo,revision:art.revision+1,replayed:false};
        state.versions.unshift({id:version,workspace_id:W,artifact_id:art.id,version_no:versionNo,source_kind:args.p_source_kind,lesson_id:args.p_lesson_id,lesson_version_id:args.p_lesson_version_id,report_snapshot_id:args.p_report_snapshot_id,canonical_text:args.p_canonical_text,structured_content:{},template_key:null,generator_provider:null,provenance:{},created_by:'U',created_at:'2026-09-06T01:00:00Z'});
        Object.assign(art,{current_version_id:version,revision:art.revision+1,updated_at:'2026-09-06T01:00:00Z'});state.applied.set(args.p_op_id,result);
        if(options.loseAppendAckOnce&&!state.lostAppend){state.lostAppend=true;return{data:null,error:{message:'simulated lost ACK after append commit'}};}
        return{data:[result],error:null};
      }
      if(name==='archive_artifact_operation'){const art=state.artifacts.find(item=>item.id===args.p_artifact_id);if(!art)return{data:null,error:{message:'artifact missing'}};Object.assign(art,{status:'archived',revision:art.revision+1});const result={outcome:'saved',revision:art.revision,replayed:false};state.applied.set(args.p_op_id,result);return{data:[result],error:null};}
      return{data:null,error:{message:`unexpected RPC ${name}`}};
    },
    storage:{from(){return{upload:async()=>({error:null}),download:async()=>({data:new Blob(['x']),error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://example.invalid/file'},error:null})};}},
  };return client as SupabaseClient;
}
function mount(options:Options={}){root?.unmount();document.getElementById('artifact-test-root')?.remove();const host=document.createElement('div');host.id='artifact-test-root';document.body.appendChild(host);const state:State={artifacts:[],versions:[],objects:[],applied:new Map(),lostCreate:false,lostAppend:false};lastState=state;root=createRoot(host);root.render(createElement(Artifacts,{client:fakeClient(state,options),workspaceId:W}));}
export function mountArtifactHarness(){mount();}
export function mountArtifactLostAckHarness(){mount({loseCreateAckOnce:true,loseAppendAckOnce:true});}
export function artifactHarnessCounts(){return{artifacts:lastState?.artifacts.length??0,versions:lastState?.versions.length??0,operations:lastState?.applied.size??0};}
