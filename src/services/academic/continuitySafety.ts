import type { PendingOperation } from '../../domain/safeWork';
import { pendingMeetingCheckpoints, type SafeWorkDb } from '../safeWork/localQueue';

function lockName(authUserId:string,workspaceId:string,meetingId:string){
  return `nilai-smp:continuity:${authUserId}:${workspaceId}:${meetingId}`;
}

export async function withMeetingContinuityLock<T>(authUserId:string,workspaceId:string,meetingId:string,task:()=>Promise<T>):Promise<T>{
  const locks=typeof navigator!=='undefined'?navigator.locks:undefined;
  if(locks)return locks.request(lockName(authUserId,workspaceId,meetingId),{mode:'exclusive'},task);
  return task();
}

export type LifecyclePreflightResult<T>=
  | {blocked:true;pending:PendingOperation[];result:null}
  | {blocked:false;pending:PendingOperation[];result:T};

/**
 * The durable queue is re-read while the per-Meeting browser lock is held and
 * the lifecycle RPC runs before that lock is released. Cached React state is
 * deliberately not an input to this safety decision.
 */
export async function withMeetingLifecyclePreflight<T>(
  db:SafeWorkDb,
  authUserId:string,
  workspaceId:string,
  meetingId:string,
  lifecycleRpc:()=>Promise<T>,
):Promise<LifecyclePreflightResult<T>>{
  return withMeetingContinuityLock(authUserId,workspaceId,meetingId,async()=>{
    const pending=await pendingMeetingCheckpoints(db,authUserId,workspaceId,meetingId);
    if(pending.length)return{blocked:true,pending,result:null};
    return{blocked:false,pending,result:await lifecycleRpc()};
  });
}
