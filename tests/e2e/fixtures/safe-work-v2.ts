import Dexie from 'dexie';
import type { PendingOperation } from '../../../src/domain/safeWork';

export async function seedSafeWorkV2(name:string,operations:PendingOperation[]){
  await Dexie.delete(name);
  const db=new Dexie(name);
  db.version(1).stores({operations:'&op_id, auth_user_id, [auth_user_id+workspace_id], [auth_user_id+workspace_id+status], [auth_user_id+workspace_id+entity_type+entity_id], created_at'});
  db.version(2).stores({operations:'&op_id, auth_user_id, [auth_user_id+workspace_id], [auth_user_id+workspace_id+status], [auth_user_id+workspace_id+causal_key], created_at'}).upgrade(async tx=>{
    await tx.table('operations').toCollection().modify(op=>{
      if(!op.causal_key)op.causal_key=`${op.entity_type}:${op.entity_id}`;
    });
  });
  await db.open();
  await db.table<PendingOperation,string>('operations').bulkPut(operations);
  db.close();
}
