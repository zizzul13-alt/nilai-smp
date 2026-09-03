import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/202609040002_safe_work_engine.sql', 'utf8');
const queue = readFileSync('src/services/safeWork/localQueue.ts', 'utf8');
const worker = readFileSync('src/services/safeWork/syncWorker.ts', 'utf8');

describe('R3.2 safe-work contracts', () => {
  it('advances schema only after the safe-work server objects', () => {
    expect(migration).toContain("'r3.2-safe-work.1'");
    expect(migration.indexOf('create table public.applied_operations')).toBeLessThan(migration.indexOf("'r3.2-safe-work.1'"));
  });
  it('derives workspace from auth and never accepts workspace in the RPC', () => {
    expect(migration).toContain('caller_id uuid := auth.uid()');
    expect(migration).not.toContain('p_workspace_id');
  });
  it('uses revision conflict and transactional ledger insertion', () => {
    expect(migration).toContain('current_revision <> p_expected_revision');
    expect(migration).toContain("select 'conflict'::text");
    expect(migration).toContain('insert into public.applied_operations');
  });
  it('exposes Pending Safe only after awaited Dexie add', () => {
    expect(queue).toContain('await db.operations.add(operation)');
    expect(queue.indexOf('await db.operations.add(operation)')).toBeLessThan(queue.lastIndexOf('return operation'));
  });
  it('deletes local payload after confirmed save and preserves namespace checks', () => {
    expect(queue).toContain('db.operations.delete(opId)');
    expect(worker).toContain('op.auth_user_id !== authUserId || op.workspace_id !== workspaceId');
  });
});
