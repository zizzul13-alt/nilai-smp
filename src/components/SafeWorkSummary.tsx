import{useEffect,useState}from'react';
import{pendingForNamespace,safeWorkDb}from'../services/safeWork/localQueue';
import{subscribeSafeWorkChanges}from'../services/safeWork/coordination';

type Props={userId:string;workspaceId:string;onOpen:()=>void};

export function SafeWorkSummary({userId,workspaceId,onOpen}:Props){
  const[counts,setCounts]=useState({pending:0,attention:0});
  useEffect(()=>{let active=true;const refresh=()=>void pendingForNamespace(safeWorkDb,userId,workspaceId).then(rows=>{if(!active)return;setCounts({pending:rows.filter(x=>x.status==='PENDING_SAFE').length,attention:rows.filter(x=>x.status==='FAILED'||x.status==='CONFLICT').length});});refresh();const unsub=subscribeSafeWorkChanges(signal=>{if(signal.auth_user_id===userId&&signal.workspace_id===workspaceId)refresh();});return()=>{active=false;unsub();};},[userId,workspaceId]);
  if(!counts.pending&&!counts.attention)return<span className="safe-summary safe-summary--saved" role="status">Tidak ada Pending Safe / FAILED / CONFLICT</span>;
  return<button type="button" className={`safe-summary ${counts.attention?'safe-summary--attention':'safe-summary--pending'}`} onClick={onOpen}>{counts.attention?`${counts.attention} perlu tindakan`:''}{counts.attention&&counts.pending?' · ':''}{counts.pending?`${counts.pending} Pending Safe`:''}</button>;
}
