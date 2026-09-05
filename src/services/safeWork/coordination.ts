import type { PendingOperation } from '../../domain/safeWork';

const CHANNEL_NAME='nilai-smp-safe-work-v1';
const STORAGE_KEY='nilai-smp-safe-work-signal-v1';

export type SafeWorkChangeSignal={
  auth_user_id:string;
  workspace_id:string;
  operation_kind:PendingOperation['operation_kind'];
  entity_id:string;
  op_id:string;
  nonce:string;
};

export function publishSafeWorkChange(op:PendingOperation){
  const signal:SafeWorkChangeSignal={
    auth_user_id:op.auth_user_id,
    workspace_id:op.workspace_id,
    operation_kind:op.operation_kind,
    entity_id:op.entity_id,
    op_id:op.op_id,
    nonce:crypto.randomUUID(),
  };
  if(typeof BroadcastChannel!=='undefined'){
    const channel=new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(signal);
    channel.close();
  }
  if(typeof window!=='undefined'&&window.localStorage){
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(signal));}catch{/* IndexedDB remains the durable truth even if storage signaling is unavailable. */}
  }
}

export function subscribeSafeWorkChanges(listener:(signal:SafeWorkChangeSignal)=>void){
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(CHANNEL_NAME):null;
  if(channel)channel.onmessage=event=>listener(event.data as SafeWorkChangeSignal);
  const onStorage=(event:StorageEvent)=>{
    if(event.key!==STORAGE_KEY||!event.newValue)return;
    try{listener(JSON.parse(event.newValue) as SafeWorkChangeSignal);}catch{/* Ignore malformed advisory signals. */}
  };
  if(typeof window!=='undefined')window.addEventListener('storage',onStorage);
  return()=>{
    channel?.close();
    if(typeof window!=='undefined')window.removeEventListener('storage',onStorage);
  };
}
