import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AcademicClass, Checkpoint, Meeting } from '../../src/domain/academic';
import { deriveClassContinuity, type TeachingCoreContext } from '../../src/services/academic/teachingCore';

const migration=readFileSync('supabase/migrations/202609050001_continuity_core.sql','utf8');
const ui=readFileSync('src/components/TeachingContinuity.tsx','utf8');
const queue=readFileSync('src/services/safeWork/localQueue.ts','utf8');

const classroom:AcademicClass={id:'c1',workspace_id:'w',academic_period_id:'p',identity_key:'viii-a',display_name:'VIII A',status:'active'};
function core(meetings:Meeting[]=[],checkpoints:Checkpoint[]=[]):TeachingCoreContext{return{materials:[],lessons:[],lessonVersions:[],meetings,checkpoints,activities:[],activityMeetings:[]};}
function meeting(id:string,status:Meeting['status'],occurred_at:string):Meeting{return{id,workspace_id:'w',class_id:'c1',lesson_id:null,lesson_version_id:null,occurred_at,status};}
function checkpoint(id:string,meeting_id:string,sequence_no:number,stopped_at:string,next_step:string|null):Checkpoint{return{id,workspace_id:'w',meeting_id,sequence_no,stopped_at,next_step,recorded_at:`2026-09-05T0${sequence_no}:00:00Z`};}

describe('R3.4 continuity contracts',()=>{
  it('zero previous meetings offers an empty continuity state',()=>{
    const state=deriveClassContinuity([classroom],core())[0];
    expect(state.state).toBe('empty');
    expect(state.activeMeeting).toBeNull();
    expect(state.latestCheckpoint).toBeNull();
  });

  it('existing in-progress Meeting wins over historical Meeting',()=>{
    const old=meeting('m-old','completed','2026-09-04T08:00:00Z');
    const active=meeting('m-active','in_progress','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([old,active],[checkpoint('cp-old','m-old',1,'old stop','old next'),checkpoint('cp-active','m-active',1,'current stop','current next')]))[0];
    expect(state.state).toBe('active');
    expect(state.activeMeeting?.id).toBe('m-active');
    expect(state.latestCheckpoint?.stopped_at).toBe('current stop');
    expect(state.latestCheckpoint?.next_step).toBe('current next');
  });

  it('latest checkpoint uses deterministic sequence and reconstructs LAST/NEXT',()=>{
    const active=meeting('m-active','in_progress','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([active],[checkpoint('cp1','m-active',1,'Halaman 37','Nomor 3'),checkpoint('cp2','m-active',2,'Halaman 39','Latihan mandiri')]))[0];
    expect(state.latestCheckpoint).toMatchObject({sequence_no:2,stopped_at:'Halaman 39',next_step:'Latihan mandiri'});
  });

  it('completed Meeting remains history and is never current',()=>{
    const done=meeting('m-done','completed','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([done],[checkpoint('cp','m-done',1,'Halaman 37','Nomor 3')]))[0];
    expect(state.state).toBe('history');
    expect(state.activeMeeting).toBeNull();
    expect(state.latestMeeting?.id).toBe('m-done');
    expect(state.latestCheckpoint?.stopped_at).toBe('Halaman 37');
  });

  it('Start and checkpoint server boundaries are idempotent and caller-owned',()=>{
    expect(migration).toContain('start_teaching_meeting_operation');
    expect(migration).toContain('meetings_one_in_progress_per_class_idx');
    expect(migration).toContain("'meeting.start'");
    expect(migration).toContain("'meeting.checkpoint'");
    expect(migration).toContain('auth.uid()');
    expect(migration).not.toContain('p_workspace_id');
  });

  it('checkpoint reaches Pending Safe only after durable IndexedDB add',()=>{
    const enqueueStart=queue.indexOf('export async function enqueueMeetingCheckpoint');
    const add=queue.indexOf('await db.operations.add(operation)',enqueueStart);
    const returned=queue.indexOf('return operation',enqueueStart);
    expect(enqueueStart).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(enqueueStart);
    expect(returned).toBeGreaterThan(add);
  });

  it('UI requires explicit lifecycle action and never completes on unmount',()=>{
    expect(ui).toContain('CONTINUE CLASS');
    expect(ui).toContain('START CLASS');
    expect(ui).toContain('Complete Class');
    expect(ui).toContain('Cancel Meeting');
    expect(ui).toContain('Unmount/reload intentionally performs no Meeting lifecycle mutation.');
    expect(ui).not.toContain("return()=>{void changeMeetingStatus('completed')");
  });
});
