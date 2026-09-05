import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync('supabase/migrations/202609040002_safe_work_engine.sql','utf8');
const queue = readFileSync('src/services/safeWork/localQueue.ts','utf8');
const worker = readFileSync('src/services/safeWork/syncWorker.ts','utf8');
const app = readFileSync('src/app/App.tsx','utf8');
const rapid = readFileSync('src/components/RapidCorrection.tsx','utf8');

function sourceFiles(dir:string):string[]{
  return readdirSync(dir).flatMap(name=>{
    const path=join(dir,name);
    return statSync(path).isDirectory()?sourceFiles(path):/\.tsx?$/.test(name)?[path]:[];
  });
}

describe('R3.2 safe-work contracts',()=>{
  it('advances schema after server objects',()=>{
    expect(migration).toContain("'r3.2-safe-work.1'");
    expect(migration.indexOf('create table public.applied_operations')).toBeLessThan(migration.indexOf("'r3.2-safe-work.1'"));
  });

  it('derives workspace from auth and accepts no workspace RPC argument',()=>{
    expect(migration).toContain('auth.uid()');
    expect(migration).not.toContain('p_workspace_id');
  });

  it('has explicit revision conflict and transactional ledger',()=>{
    expect(migration).toMatch(/current_revision\s*<>\s*p_expected_revision/);
    expect(migration).toContain("'conflict'::text");
    expect(migration).toContain('insert into public.applied_operations');
  });

  it('returns Pending Safe only after awaited Dexie add',()=>{
    expect(queue).toContain('await db.operations.add(operation)');
    expect(queue.indexOf('await db.operations.add(operation)')).toBeLessThan(queue.lastIndexOf('return operation'));
  });

  it('cleans saved payload and guards namespace',()=>{
    expect(queue).toContain('db.operations.delete(opId)');
    expect(worker).toContain('op.auth_user_id !== authUserId || op.workspace_id !== workspaceId');
  });

  it('uses one App-owned production worker and passes the same instance to Teaching Continuity and Rapid Correction',()=>{
    const productionSources=sourceFiles('src').map(path=>readFileSync(path,'utf8')).join('\n');
    expect(productionSources.match(/new\s+SafeWorkSyncWorker\s*\(/g)??[]).toHaveLength(1);
    expect(app).toMatch(/const\s+worker\s*=\s*useMemo\(\(\)=>new\s+SafeWorkSyncWorker\(safeWorkDb,client\)/);
    expect(app).toMatch(/<TeachingContinuity[^>]*worker=\{worker\}/);
    expect(app).toMatch(/<RapidCorrection[^>]*worker=\{worker\}/);
    expect(rapid).toMatch(/worker:SafeWorkSyncWorker/);
    expect(rapid).not.toMatch(/new\s+SafeWorkSyncWorker\s*\(/);
  });

  it('defers only retryable results during an overall drain run',()=>{
    expect(worker).toContain('deferredRetryableThisRun');
    expect(worker).not.toContain('attemptedThisRun');
    expect(worker).toMatch(/result\.kind\s*===\s*'retryable'[\s\S]*deferredRetryableThisRun\.add\(op\.op_id\)/);
  });
});
