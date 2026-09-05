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
    // Only retryable transport/auth failures are deferred for the remainder of this
    // overall run. FAILED/CONFLICT rows are blocked by their durable status, while an
    // explicit recovery that changes FAILED back to PENDING_SAFE may join a coalesced
    // rerun immediately without waiting for reload/reconnect.
    const deferredRetryableThisRun = new Set<string>();

    while (true) {
      state.rerunRequested = false;
      await this.drainPass(authUserId, workspaceId, deferredRetryableThisRun);

      const eligibleWorkRemains = await this.hasEligibleWork(authUserId, workspaceId, deferredRetryableThisRun);
      if (!eligibleWorkRemains && !state.rerunRequested) return;
    }
  }

  private async drainPass(authUserId: string, workspaceId: string, deferredRetryableThisRun: Set<string>): Promise<void> {
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

      // A retryable predecessor remains the causal blocker for this overall run.
      // It can be retried by a later independent sync trigger, but not by a wakeup
      // that was coalesced into the same run.
      if (deferredRetryableThisRun.has(op.op_id)) {
        blocked.add(key);
        continue;
      }

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
        deferredRetryableThisRun.add(op.op_id);
        blocked.add(key);
      } else {
        await markOperation(this.db, op.op_id, { status: 'FAILED', last_error_code: result.code });
        blocked.add(key);
      }
    }
  }

  private async hasEligibleWork(
    authUserId: string,
    workspaceId: string,
    deferredRetryableThisRun: Set<string>,
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
      if (deferredRetryableThisRun.has(op.op_id)) {
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
