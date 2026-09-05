import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { EXPECTED_SCHEMA_VERSION } from '../../src/config/schema';

const app=readFileSync('src/app/App.tsx','utf8');
const gate=readFileSync('src/components/WorkspaceBootstrapGate.tsx','utf8');
const deployment=readFileSync('docs/DEPLOYMENT.md','utf8');
const troubleshooting=readFileSync('docs/TROUBLESHOOTING.md','utf8');
const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();

describe('R3.HARDEN-01 contracts',()=>{
  it('makes workspace bootstrap loading, error and ready explicit with user recovery',()=>{
    expect(gate).toContain("status: 'loading'");
    expect(gate).toContain("status: 'error'");
    expect(gate).toContain("status: 'ready'");
    expect(gate).toContain('Tidak dapat membuka workspace');
    expect(gate).toContain('Coba lagi');
    expect(gate).toContain('setAttempt(value => value + 1)');
    expect(gate).toContain("setState({ status: 'loading' })");
    expect(app).not.toContain('.catch(() => {})');
  });

  it('keeps bootstrap lifecycle account-scoped and reuses the App-owned Safe Work worker',()=>{
    expect(app).toContain('key={auth.session.user.id}');
    expect(app).toMatch(/const\s+worker\s*=\s*useMemo\(\(\)=>new\s+SafeWorkSyncWorker\(safeWorkDb,client\)/);
    expect(app).toMatch(/<WorkspaceBootstrapGate[^>]*worker=\{worker\}/);
    expect(gate).not.toMatch(/new\s+SafeWorkSyncWorker\s*\(/);
    expect(gate).toContain('removeReconnect?.()');
    expect(gate).not.toContain('setInterval(');
    expect(gate).not.toMatch(/operations\.(?:clear|delete)/);
  });

  it('keeps runtime and operational docs on the same schema identity',()=>{
    expect(EXPECTED_SCHEMA_VERSION).toBe('r3.4-continuity-core.1');
    expect(deployment).toContain(EXPECTED_SCHEMA_VERSION);
    expect(troubleshooting).toContain(EXPECTED_SCHEMA_VERSION);
    expect(deployment).not.toContain('r3.3-bulk-assessment.1');
    expect(troubleshooting).not.toContain('r3.3-bulk-assessment.1');
  });

  it('documents every real migration in repository filename order',()=>{
    let previous=-1;
    for(const name of migrations){
      const position=deployment.indexOf(name);
      expect(position,`DEPLOYMENT.md is missing ${name}`).toBeGreaterThan(previous);
      previous=position;
    }
    expect(deployment).toContain('Do not manually edit, pre-set, or forge `app_schema_version`');
  });

  it('documents Pending Safe as a Safe Work state beyond Rapid Correction',()=>{
    expect(troubleshooting).toContain('Meeting Checkpoint / Teaching Continuity');
    expect(troubleshooting).toContain('`Saved` = server confirmed');
    expect(troubleshooting).toContain('`Pending Safe` = durably committed to local IndexedDB, but not yet server confirmed');
    expect(troubleshooting).toContain('`FAILED` / `CONFLICT` = durable local work that requires explicit recovery');
  });
});
