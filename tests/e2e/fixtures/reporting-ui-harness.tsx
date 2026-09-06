import{createElement}from'react';
import{createRoot,type Root}from'react-dom/client';
import type{SupabaseClient}from'@supabase/supabase-js';
import{Reporting}from'../../../src/components/Reporting';

const W='REP-W',C='REP-C',P='REP-P',POL='REP-POL',CY='REP-CY',SN='REP-SN',EN='REP-EN',ST='REP-ST';
let root:Root|null=null;
let cycle:any={id:CY,workspace_id:W,class_id:C,academic_period_id:P,reporting_policy_id:POL,status:'FINALIZED',revision:2,current_snapshot_id:SN,created_at:'2026-09-06T00:00:00Z',updated_at:'2026-09-06T00:00:00Z'};
let snapshot:any={id:SN,workspace_id:W,cycle_id:CY,class_id:C,academic_period_id:P,reporting_policy_id:POL,snapshot_no:1,kind:'FINALIZED',assessment_count:2,enrollment_count:1,source_summary:{},created_by:'U',created_at:'2026-09-06T00:00:00Z'};
let rows:any[]=[{id:'ROW',workspace_id:W,snapshot_id:SN,class_id:C,enrollment_id:EN,student_id:ST,student_display_name:'Siswa Reporting',enrollment_status:'active',reported_score:65,meets_kkm:true,assessment_count:2,graded_count:1,missing_count:1,excused_count:0,unchecked_count:0,included_count:1,calculation:{}}];

function fakeClient(){
  const classes=[{id:C,workspace_id:W,academic_period_id:P,identity_key:'viii-a',display_name:'VIII A',status:'active'}];
  const policies=[{id:POL,workspace_id:W,academic_period_id:P,policy_key:'SERIES',version_no:1,name:'Rapor Test',aggregation:'SIMPLE_MEAN',missing_policy:'EXCLUDE',excused_policy:'EXCLUDE',remedial_policy:'CURRENT_RESULT',rounding_mode:'INTEGER',kkm:60,status:'active',created_at:'2026-09-06T00:00:00Z'}];
  const client:any={
    from(table:string){
      let filters:[string,unknown][]=[];
      const source=()=>table==='classes'?classes:table==='reporting_policies'?policies:table==='reporting_cycles'?[cycle]:table==='report_snapshots'?[snapshot]:table==='report_snapshot_rows'?rows:[];
      const execute=()=>source().filter((row:any)=>filters.every(([key,value])=>row[key]===value));
      const builder:any={select(){return builder;},eq(key:string,value:unknown){filters.push([key,value]);return builder;},order(){return builder;},async maybeSingle(){return{data:execute()[0]??null,error:null};},async single(){return{data:execute()[0]??null,error:null};},then(resolve:any,reject:any){return Promise.resolve({data:execute(),error:null}).then(resolve,reject);}};
      return builder;
    },
    async rpc(name:string,args:Record<string,any>){
      if(name==='reopen_reporting_cycle_operation'){
        cycle={...cycle,status:'OPEN',revision:3,updated_at:'2026-09-06T01:00:00Z'};
        return{data:[{outcome:'saved',revision:3,replayed:false}],error:null};
      }
      if(name==='calculate_report_snapshot_operation'){
        snapshot={...snapshot,id:'REP-SN-2',snapshot_no:2,kind:args.p_finalize?'FINALIZED':'PROVISIONAL',created_at:'2026-09-06T01:05:00Z'};
        rows=rows.map(row=>({...row,id:'ROW-2',snapshot_id:snapshot.id}));
        cycle={...cycle,status:args.p_finalize?'FINALIZED':'OPEN',revision:cycle.revision+1,current_snapshot_id:snapshot.id,reporting_policy_id:args.p_reporting_policy_id};
        return{data:[{outcome:'saved',cycle_id:CY,snapshot_id:snapshot.id,revision:cycle.revision,replayed:false}],error:null};
      }
      return{data:null,error:{message:`unexpected RPC ${name}`}};
    },
  };
  return client as SupabaseClient;
}

export function mountReportingHarness(){
  root?.unmount();document.getElementById('reporting-test-root')?.remove();
  cycle={...cycle,status:'FINALIZED',revision:2,current_snapshot_id:SN};snapshot={...snapshot,id:SN,snapshot_no:1,kind:'FINALIZED'};rows=rows.map(row=>({...row,id:'ROW',snapshot_id:SN}));
  const host=document.createElement('div');host.id='reporting-test-root';document.body.appendChild(host);root=createRoot(host);
  root.render(createElement(Reporting,{client:fakeClient(),workspaceId:W}));
}
