import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingOperation } from '../../domain/safeWork';
import { markOperation, markSavedAndMinimize, pendingForNamespace, type SafeWorkDb } from './localQueue';
import { applyStudentRename } from './serverMutation';

export class SafeWorkSyncWorker {
  private running = false;
  constructor(private db: SafeWorkDb, private client: SupabaseClient) {}

  async syncNamespace(authUserId: string, workspaceId: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const operations = (await pendingForNamespace(this.db, authUserId, workspaceId))
        .filter(op => op.status !== 'CONFLICT')
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const blockedEntities = new Set<string>();
      for (const op of operations) {
        if (op.auth_user_id !== authUserId || op.workspace_id !== workspaceId) continue;
        const entityKey = `${op.entity_type}:${op.entity_id}`;
        if (blockedEntities.has(entityKey)) continue;
        const now = new Date().toISOString();
        await markOperation(this.db, op.op_id, { attempt_count: op.attempt_count + 1, last_attempt_at: now });
        const result = await this.apply(op);
        if (result.kind === 'saved') await markSavedAndMinimize(this.db, op.op_id);
        else if (result.kind === 'conflict') { await markOperation(this.db, op.op_id, { status: 'CONFLICT', last_error_code: 'REVISION_CONFLICT' }); blockedEntities.add(entityKey); }
        else if (result.kind === 'retryable') { await markOperation(this.db, op.op_id, { status: 'PENDING_SAFE', last_error_code: result.code }); blockedEntities.add(entityKey); }
        else { await markOperation(this.db, op.op_id, { status: 'FAILED', last_error_code: result.code }); blockedEntities.add(entityKey); }
      }
    } finally { this.running = false; }
  }

  protected apply(op: PendingOperation) { return applyStudentRename(this.client, op); }
}

export function installReconnectSync(worker: SafeWorkSyncWorker, namespace: () => { authUserId: string; workspaceId: string } | null) {
  const retry = () => { const current = namespace(); if (current) void worker.syncNamespace(current.authUserId, current.workspaceId); };
  window.addEventListener('online', retry);
  return () => window.removeEventListener('online', retry);
}
