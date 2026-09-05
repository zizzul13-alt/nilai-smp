import { createRoot, type Root } from 'react-dom/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkspaceBootstrapGate } from '../../../src/components/WorkspaceBootstrapGate';
import type { SafeWorkSyncWorker } from '../../../src/services/safeWork/syncWorker';

let root:Root|null=null;
let bootstrapCalls=0;
let syncCalls:Array<{authUserId:string;workspaceId:string}>=[];
let installCalls=0;
let cleanupCalls=0;
let logoutCalls=0;
let resolveRetry:((workspace:unknown)=>void)|null=null;

const fakeClient={} as SupabaseClient;
const worker={
  async syncNamespace(authUserId:string,workspaceId:string){
    syncCalls.push({authUserId,workspaceId});
  },
} as unknown as SafeWorkSyncWorker;

async function bootstrap(){
  bootstrapCalls++;
  if(bootstrapCalls===1)throw new Error('synthetic bootstrap failure with secret-like detail');
  return new Promise<any>(resolve=>{resolveRetry=resolve;});
}

function installReconnect(_worker:SafeWorkSyncWorker,namespace:()=>{authUserId:string;workspaceId:string}|null){
  installCalls++;
  if(!namespace())throw new Error('expected live namespace');
  return()=>{cleanupCalls++;};
}

function renderHarness(){
  if(!root)return;
  root.render(
    <WorkspaceBootstrapGate
      client={fakeClient}
      userId="USER-A"
      worker={worker}
      bootstrap={bootstrap as any}
      installReconnect={installReconnect}
      onLogout={()=>{logoutCalls++;}}
    >
      {workspaceId=><div data-testid="teacher-workspace">Teacher workspace {workspaceId}</div>}
    </WorkspaceBootstrapGate>,
  );
}

export function mountBootstrapUiHarness(){
  root?.unmount();
  document.getElementById('bootstrap-test-root')?.remove();
  bootstrapCalls=0;
  syncCalls=[];
  installCalls=0;
  cleanupCalls=0;
  logoutCalls=0;
  resolveRetry=null;
  const host=document.createElement('div');
  host.id='bootstrap-test-root';
  document.body.appendChild(host);
  root=createRoot(host);
  renderHarness();
}

export function resolveBootstrapRetry(workspaceId='WORKSPACE-A'){
  if(!resolveRetry)throw new Error('retry bootstrap is not pending');
  const resolve=resolveRetry;
  resolveRetry=null;
  resolve({id:workspaceId,identity_key:'personal',display_name:'Personal',owner_user_id:'USER-A',status:'active'});
}

export function rerenderBootstrapUiHarness(){renderHarness();}

export function unmountBootstrapUiHarness(){root?.unmount();root=null;}

export function bootstrapHarnessSnapshot(){
  return{
    bootstrapCalls,
    syncCalls:[...syncCalls],
    installCalls,
    cleanupCalls,
    logoutCalls,
    retryPending:resolveRetry!==null,
  };
}
