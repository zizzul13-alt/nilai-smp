import{createElement}from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{Artifacts}from'../../../src/components/Artifacts';

const W='ART-W',L='ART-L',V1='ART-LV1',V2='ART-LV2',R='ART-R';let root:Root|null=null;
type State={artifacts:any[];versions:any[];objects:any[]};
function fakeClient(state:State){
  const lessons=[{id:L,title:'Gerak Lurus',workspace_id:W,status:'active'}];
  const lessonVersions=[{id:V2,lesson_id:L,version_number:2,content_text:'Lesson terbaru v2'},{id:V1,lesson_id:L,version_number:1,content_text:'Lesson lama v1'}];
  const reports=[{id:R,class_id:'C',snapshot_no:2,kind:'FINALIZED',created_at:'2026-09-06T00:00:00Z'}];
  const client:any={
    from(table:string){let filters:[string,unknown][]=[];const source=()=>table==='artifacts'?state.artifacts:table==='artifact_versions'?state.versions:table==='artifact_objects'?state.objects:table==='lessons'?lessons:table==='lesson_versions'?lessonVersions:table==='report_snapshots'?reports:[];const execute=()=>source().filter((row:any)=>filters.every(([key,value])=>row[key]===value));const builder:any={select(){return builder;},eq(key:string,value:unknown){filters.push([key,value]);return builder;},order(){return builder;},then(resolve:any,reject:any){return Promise.resolve({data:execute(),error:null}).then(resolve,reject);}};return builder;},
    async rpc(name:string,args:Record<string,any>){
      if(name==='create_artifact_operation'){const id='ART-1',version='ART-V1';state.artifacts=[{id,workspace_id:W,artifact_type:args.p_artifact_type,title:args.p_title,status:'active',revision:1,current_version_id:version,created_at:'2026-09-06T00:00:00Z',updated_at:'2026-09-06T00:00:00Z'}];state.versions=[{id:version,workspace_id:W,artifact_id:id,version_no:1,source_kind:args.p_source_kind,lesson_id:args.p_lesson_id,lesson_version_id:args.p_lesson_version_id,report_snapshot_id:args.p_report_snapshot_id,canonical_text:args.p_canonical_text,structured_content:{},template_key:null,generator_provider:null,provenance:{},created_by:'U',created_at:'2026-09-06T00:00:00Z'}];return{data:[{artifact_id:id,version_id:version,revision:1,replayed:false}],error:null};}
      if(name==='append_artifact_version_operation'){const art=state.artifacts[0];const version='ART-V2';state.versions.unshift({id:version,workspace_id:W,artifact_id:art.id,version_no:2,source_kind:args.p_source_kind,lesson_id:args.p_lesson_id,lesson_version_id:args.p_lesson_version_id,report_snapshot_id:args.p_report_snapshot_id,canonical_text:args.p_canonical_text,structured_content:{},template_key:null,generator_provider:null,provenance:{},created_by:'U',created_at:'2026-09-06T01:00:00Z'});state.artifacts[0]={...art,current_version_id:version,revision:2,updated_at:'2026-09-06T01:00:00Z'};return{data:[{outcome:'saved',version_id:version,version_no:2,revision:2,replayed:false}],error:null};}
      if(name==='archive_artifact_operation'){state.artifacts[0]={...state.artifacts[0],status:'archived',revision:3};return{data:[{outcome:'saved',revision:3,replayed:false}],error:null};}
      return{data:null,error:{message:`unexpected RPC ${name}`}};
    },
    storage:{from(){return{upload:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://example.invalid/file'},error:null})};}},
  };return client as SupabaseClient;
}
export function mountArtifactHarness(){root?.unmount();document.getElementById('artifact-test-root')?.remove();const host=document.createElement('div');host.id='artifact-test-root';document.body.appendChild(host);root=createRoot(host);root.render(createElement(Artifacts,{client:fakeClient({artifacts:[],versions:[],objects:[]}),workspaceId:W}));}
