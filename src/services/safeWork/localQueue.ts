import Dexie, { type EntityTable } from 'dexie';
import type { PendingOperation, StudentRenamePayload } from '../../domain/safeWork';
export class SafeWorkDb extends Dexie {
  operations!: EntityTable<PendingOperation, 'op_id'>;
  constructor(name = 'nilai-smp-safe-work') { super(name); this.version(1).stores({ operations: '&op_id, auth_user_id, [auth_user_id+workspace_id], [auth_user_id+workspace_id+status], [auth_user_id+workspace_id+entity_type+entity_id], created_at' }); }
}
export const safeWorkDb = new SafeWorkDb();
export type EnqueueStudentRename = { authUserId:string; workspaceId:string; studentId:string; displayName:string; expectedRevision:number; opId?:string };
export async function enqueueStudentRename(db:SafeWorkDb,input:EnqueueStudentRename):Promise<PendingOperation>{
  const displayName=input.displayName.trim(); if(!displayName) throw new Error('Student name must not be blank.');
  const payload:StudentRenamePayload={display_name:displayName};
  const operation:PendingOperation={op_id:input.opId??crypto.randomUUID(),auth_user_id:input.authUserId,workspace_id:input.workspaceId,entity_type:'student',entity_id:input.studentId,operation_kind:'student.rename',payload,created_at:new Date().toISOString(),attempt_count:0,last_attempt_at:null,status:'PENDING_SAFE',expected_revision:input.expectedRevision,last_error_code:null};
  await db.transaction('rw',db.operations,async()=>{await db.operations.add(operation);});
  return operation;
}
export async function pendingForNamespace(db:SafeWorkDb,authUserId:string,workspaceId:string){return db.operations.where('[auth_user_id+workspace_id]').equals([authUserId,workspaceId]).filter(op=>['PENDING_SAFE','FAILED','CONFLICT'].includes(op.status)).sortBy('created_at');}
export async function hasUnsyncedWork(db:SafeWorkDb,authUserId:string,workspaceId:string){return (await pendingForNamespace(db,authUserId,workspaceId)).length>0;}
export async function hasUnsyncedForUser(db:SafeWorkDb,authUserId:string){return (await db.operations.where('auth_user_id').equals(authUserId).count())>0;}
export async function markSavedAndMinimize(db:SafeWorkDb,opId:string){await db.operations.delete(opId);}
export async function markOperation(db:SafeWorkDb,opId:string,patch:Partial<PendingOperation>){await db.operations.update(opId,patch);}
