import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingOperation } from '../../domain/safeWork';
import { markOperation,markSavedAndMinimize,pendingForNamespace,type SafeWorkDb } from './localQueue';
import { applySafeWorkOperation } from './serverMutation';
export class SafeWorkSyncWorker{
  private running=false;
  constructor(private db:SafeWorkDb,private client:SupabaseClient){}
  async syncNamespace(authUserId:string,workspaceId:string):Promise<void>{
    if(this.running)return;this.running=true;
    try{
      const operations=(await pendingForNamespace(this.db,authUserId,workspaceId)).sort((a,b)=>a.created_at.localeCompare(b.created_at));
      const blocked=new Set<string>();
      for(const op of operations){
        if(op.auth_user_id!==authUserId||op.workspace_id!==workspaceId)continue;
        const key=op.causal_key||`${op.entity_type}:${op.entity_id}`;
        if(op.status==='FAILED'||op.status==='CONFLICT'){blocked.add(key);continue;}
        if(op.status!=='PENDING_SAFE'||blocked.has(key))continue;
        await markOperation(this.db,op.op_id,{attempt_count:op.attempt_count+1,last_attempt_at:new Date().toISOString()});
        const result=await this.apply(op);
        if(result.kind==='saved')await markSavedAndMinimize(this.db,op.op_id);
        else if(result.kind==='conflict'){await markOperation(this.db,op.op_id,{status:'CONFLICT',last_error_code:`REVISION_CONFLICT:${result.revision}`});blocked.add(key);}
        else if(result.kind==='retryable'){await markOperation(this.db,op.op_id,{status:'PENDING_SAFE',last_error_code:result.code});blocked.add(key);}
        else{await markOperation(this.db,op.op_id,{status:'FAILED',last_error_code:result.code});blocked.add(key);}
      }
    }finally{this.running=false;}
  }
  protected apply(op:PendingOperation){return applySafeWorkOperation(this.client,op);}
}
export function installReconnectSync(worker:SafeWorkSyncWorker,namespace:()=>{authUserId:string;workspaceId:string}|null){const retry=()=>{const current=namespace();if(current)void worker.syncNamespace(current.authUserId,current.workspaceId);};window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);}
