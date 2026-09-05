import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingOperation } from '../../domain/safeWork';
import { markOperation, markSavedAndMinimize, pendingForNamespace, type SafeWorkDb } from './localQueue';
import { applySafeWorkOperation } from './serverMutation';

type NamespaceRunState = {
  rerunRequested: boolean;
  promise: Promise<void>;
};

export class SafeWorkSyncWorker {
  private runs = new Map<string, NamespaceRunState>();

  constructor(private db: SafeWorkDb, private client: SupabaseClient) {}

  syncNamespace(authUserId: string, workspaceId: string): Promise<void> {
    const namespaceKey = JSON.stringify([authUserId, workspaceId]);
    const existing = this.runs.get(namespaceKey);
    if (existing) {
      existing.rerunRequested = true;
      return existing.promise;
    }

    const state = { rerunRequested: false, promise: Promise.resolve() } as NamespaceRunState;
    const promise = this.runNamespace(authUserId, workspaceId, state).finally(() => {
      if (this.runs.get(namespaceKey) === state) this.runs.delete(namespaceKey);
    });
    state.promise = promise;
    this.runs.set(namespaceKey, state);
    return promise;
  }

  private async runNamespace(authUserId: string, workspaceId: string, state: NamespaceRunState): Promise<void> {
    // An operation is attempted at most once per overall sync request. A retryable
    // transport/auth result therefore waits for a future external trigger instead
    // of spinning because another wakeup was coalesced during this run.
    const attemptedThisRun = new Set<string>();

    while (true) {
      state.rerunRequested = false;
      await this.drainPass(authUserId, workspaceId, attemptedThisRun);

      const eligibleWorkRemains = await this.hasEligibleUnattemptedWork(authUserId, workspaceId, attemptedThisRun);
      if (!eligibleWorkRemains && !state.rerunRequested) return;
    }
  }

  private async drainPass(authUserId: string, workspaceId: string, attemptedThisRun: Set<string>): Promise<void> {
    const operations = (await pendingForNamespace(this.db, authUserId, workspaceId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const blocked = new Set<string>();

    for (const op of operations) {
      if (op.auth_user_id !== authUserId || op.workspace_id !== workspaceId) continue;
      const key = op.causal_key || `${op.entity_type}:${op.entity_id}`;

      if (op.status === 'FAILED' || op.status === 'CONFLICT') {
        blocked.add(key);
        continue;
      }
      if (op.status !== 'PENDING_SAFE' || blocked.has(key)) continue;

      // A retryable operation already attempted during this overall run remains
      // the causal predecessor and must not be retried or leapfrogged immediately.
      if (attemptedThisRun.has(op.op_id)) {
        blocked.add(key);
        continue;
      }

      attemptedThisRun.add(op.op_id);
      await markOperation(this.db, op.op_id, {
        attempt_count: op.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      });

      const result = await this.apply(op);
      if (result.kind === 'saved') {
        await markSavedAndMinimize(this.db, op.op_id);
      } else if (result.kind === 'conflict') {
        await markOperation(this.db, op.op_id, {
          status: 'CONFLICT',
          last_error_code: 'REVISION_CONFLICT',
          conflict_snapshot: op.operation_kind === 'assessment.judgement'
            ? {
                canonical_state: result.canonical?.state ?? null,
                canonical_score: result.canonical?.score ?? null,
                canonical_revision: result.revision,
              }
            : null,
        });
        blocked.add(key);
      } else if (result.kind === 'retryable') {
        await markOperation(this.db, op.op_id, { status: 'PENDING_SAFE', last_error_code: result.code });
        blocked.add(key);
      } else {
        await markOperation(this.db, op.op_id, { status: 'FAILED', last_error_code: result.code });
        blocked.add(key);
      }
    }
  }

  private async hasEligibleUnattemptedWork(
    authUserId: string,
    workspaceId: string,
    attemptedThisRun: Set<string>,
  ): Promise<boolean> {
    const operations = (await pendingForNamespace(this.db, authUserId, workspaceId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const blocked = new Set<string>();

    for (const op of operations) {
      if (op.auth_user_id !== authUserId || op.workspace_id !== workspaceId) continue;
      const key = op.causal_key || `${op.entity_type}:${op.entity_id}`;

      if (op.status === 'FAILED' || op.status === 'CONFLICT') {
        blocked.add(key);
        continue;
      }
      if (op.status !== 'PENDING_SAFE' || blocked.has(key)) continue;
      if (attemptedThisRun.has(op.op_id)) {
        blocked.add(key);
        continue;
      }
      return true;
    }
    return false;
  }

  protected apply(op: PendingOperation) { return applySafeWorkOperation(this.client, op); }
}

export function installReconnectSync(
  worker: SafeWorkSyncWorker,
  namespace: () => { authUserId: string; workspaceId: string } | null,
) {
  const retry = () => {
    const current = namespace();
    if (current) void worker.syncNamespace(current.authUserId, current.workspaceId);
  };
  window.addEventListener('online', retry);
  return () => window.removeEventListener('online', retry);
}
