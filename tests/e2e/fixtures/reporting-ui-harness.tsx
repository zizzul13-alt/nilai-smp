import{createElement}from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{Reporting}from'../../../src/components/Reporting';

const W='REP-W',P='REP-P',POL='REP-POL';
const C='REP-C',CY='REP-CY',SN='REP-SN',EN='REP-EN',ST='REP-ST';
const C2='REP-C-2',CY2='REP-CY-2',SN2='REP-SN-2',EN2='REP-EN-2',ST2='REP-ST-2';
let root:Root|null=null;

type State={cycles:Record<string,any>;snapshots:Record<string,any>;rows:Record<string,any[]>};
function initialState():State{return{
  cycles:{
    [C]:{id:CY,workspace_id:W,class_id:C,academic_period_id:P,reporting_policy_id:POL,status:'FINALIZED',revision:2,current_snapshot_id:SN,created_at:'2026-09-06T00:00:00Z',updated_at:'2026-09-06T00:00:00Z'},
    [C2]:{id:CY2,workspace_id:W,class_id:C2,academic_period_id:P,reporting_policy_id:POL,status:'OPEN',revision:1,current_snapshot_id:SN2,created_at:'2026-09-06T00:00:00Z',updated_at:'2026-09-06T00:00:00Z'},
  },
  snapshots:{
    [SN]:{id:SN,workspace_id:W,cycle_id:CY,class_id:C,academic_period_id:P,reporting_policy_id:POL,snapshot_no:1,kind:'FINALIZED',assessment_count:2,enrollment_count:1,source_summary:{},created_by:'U',created_at:'2026-09-06T00:00:00Z'},
    [SN2]:{id:SN2,workspace_id:W,cycle_id:CY2,class_id:C2,academic_period_id:P,reporting_policy_id:POL,snapshot_no:1,kind:'PROVISIONAL',assessment_count:1,enrollment_count:1,source_summary:{},created_by:'U',created_at:'2026-09-06T00:00:00Z'},
  },
  rows:{
    [SN]:[{id:'ROW',workspace_id:W,snapshot_id:SN,class_id:C,enrollment_id:EN,student_id:ST,student_display_name:'Siswa Reporting',enrollment_status:'active',reported_score:65,meets_kkm:true,assessment_count:2,graded_count:1,missing_count:1,excused_count:0,unchecked_count:0,included_count:1,calculation:{}}],
    [SN2]:[{id:'ROW-2',workspace_id:W,snapshot_id:SN2,class_id:C2,enrollment_id:EN2,student_id:ST2,student_display_name:'Siswa Class B',enrollment_status:'active',reported_score:77,meets_kkm:true,assessment_count:1,graded_count:1,missing_count:0,excused_count:0,unchecked_count:0,included_count:1,calculation:{}}],
  },
};}

function policy(){return{id:POL,workspace_id:W,academic_period_id:P,policy_key:'SERIES',version_no:1,name:'Rapor Test',aggregation:'SIMPLE_MEAN',missing_policy:'EXCLUDE',excused_policy:'EXCLUDE',remedial_policy:'CURRENT_RESULT',rounding_mode:'INTEGER',kkm:60,status:'active',created_at:'2026-09-06T00:00:00Z'};}

function fakeClient(state:State,{twoClasses=false,delayClassId=null}:{twoClasses?:boolean;delayClassId?:string|null}={}){
  const classes=[{id:C,workspace_id:W,academic_period_id:P,identity_key:'viii-a',display_name:'VIII A',status:'active'},...(twoClasses?[{id:C2,workspace_id:W,academic_period_id:P,identity_key:'viii-b',display_name:'VIII B',status:'active'}]:[])];
  const policies=[policy()];
  const client:any={
    from(table:string){
      let filters:[string,unknown][]=[];
      const source=()=>table==='classes'?classes:table==='reporting_policies'?policies:table==='reporting_cycles'?Object.values(state.cycles):table==='report_snapshots'?Object.values(state.snapshots):table==='report_snapshot_rows'?Object.values(state.rows).flat():[];
      const execute=()=>source().filter((row:any)=>filters.every(([key,value])=>row[key]===value));
      const builder:any={select(){return builder;},eq(key:string,value:unknown){filters.push([key,value]);return builder;},order(){return builder;},async maybeSingle(){return{data:execute()[0]??null,error:null};},async single(){return{data:execute()[0]??null,error:null};},then(resolve:any,reject:any){return Promise.resolve({data:execute(),error:null}).then(resolve,reject);}};
      return builder;
    },
    async rpc(name:string,args:Record<string,any>){
      if(name==='reopen_reporting_cycle_operation'){
        const target=Object.values(state.cycles).find((item:any)=>item.id===args.p_cycle_id) as any;
        if(target){state.cycles[target.class_id]={...target,status:'OPEN',revision:target.revision+1,updated_at:'2026-09-06T01:00:00Z'};}
        return{data:[{outcome:'saved',revision:(target?.revision??0)+1,replayed:false}],error:null};
      }
      if(name==='calculate_report_snapshot_operation'){
        if(delayClassId&&args.p_class_id===delayClassId){
          const w=window as Window&{__reportingSnapshotPending?:boolean;__releaseReportingSnapshot?:()=>void};
          w.__reportingSnapshotPending=true;
          await new Promise<void>(resolve=>{w.__releaseReportingSnapshot=()=>{w.__reportingSnapshotPending=false;resolve();};});
        }
        const current=state.cycles[args.p_class_id];
        const newId=`${current.id}-NEXT`;
        const nextSnapshot={...(state.snapshots[current.current_snapshot_id]??state.snapshots[SN]),id:newId,cycle_id:current.id,class_id:args.p_class_id,snapshot_no:2,kind:args.p_finalize?'FINALIZED':'PROVISIONAL',created_at:'2026-09-06T01:05:00Z'};
        state.snapshots[newId]=nextSnapshot;
        const sourceRows=state.rows[current.current_snapshot_id]??[];
        state.rows[newId]=sourceRows.map((row:any)=>({...row,id:`${row.id}-NEXT`,snapshot_id:newId,class_id:args.p_class_id,student_display_name:args.p_class_id===C?'Siswa Class A Updated':row.student_display_name}));
        state.cycles[args.p_class_id]={...current,status:args.p_finalize?'FINALIZED':'OPEN',revision:current.revision+1,current_snapshot_id:newId,reporting_policy_id:args.p_reporting_policy_id};
        return{data:[{outcome:'saved',cycle_id:current.id,snapshot_id:newId,revision:current.revision+1,replayed:false}],error:null};
      }
      return{data:null,error:{message:`unexpected RPC ${name}`}};
    },
  };
  return client as SupabaseClient;
}

function mount(client:SupabaseClient){
  root?.unmount();document.getElementById('reporting-test-root')?.remove();
  const host=document.createElement('div');host.id='reporting-test-root';document.body.appendChild(host);root=createRoot(host);
  root.render(createElement(Reporting,{client,workspaceId:W}));
}

export function mountReportingHarness(){mount(fakeClient(initialState()));}

export function mountReportingClassRaceHarness(){
  const w=window as Window&{__reportingSnapshotPending?:boolean;__releaseReportingSnapshot?:()=>void};
  delete w.__reportingSnapshotPending;delete w.__releaseReportingSnapshot;
  const state=initialState();
  state.cycles[C]={...state.cycles[C],status:'OPEN',revision:1,current_snapshot_id:SN};
  state.snapshots[SN]={...state.snapshots[SN],kind:'PROVISIONAL'};
  mount(fakeClient(state,{twoClasses:true,delayClassId:C}));
}

export function releaseReportingSnapshot(){
  const w=window as Window&{__releaseReportingSnapshot?:()=>void};
  w.__releaseReportingSnapshot?.();
}
