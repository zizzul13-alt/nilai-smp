import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcademicClass, Checkpoint, Meeting } from '../../src/domain/academic';
import type { PendingOperation } from '../../src/domain/safeWork';
import { deriveClassContinuity, type TeachingCoreContext } from '../../src/services/academic/teachingCore';
import { applySafeWorkOperation } from '../../src/services/safeWork/serverMutation';

const migration=readFileSync('supabase/migrations/202609050001_continuity_core.sql','utf8');
const boundary=readFileSync('supabase/migrations/202609050003_continuity_write_boundary.sql','utf8');
const ui=readFileSync('src/components/TeachingContinuity.tsx','utf8');
const queue=readFileSync('src/services/safeWork/localQueue.ts','utf8');
const safety=readFileSync('src/services/academic/continuitySafety.ts','utf8');

const classroom:AcademicClass={id:'c1',workspace_id:'w',academic_period_id:'p',identity_key:'viii-a',display_name:'VIII A',status:'active'};
function core(meetings:Meeting[]=[],checkpoints:Checkpoint[]=[]):TeachingCoreContext{return{materials:[],lessons:[],lessonVersions:[],meetings,checkpoints,activities:[],activityMeetings:[]};}
function meeting(id:string,status:Meeting['status'],occurred_at:string):Meeting{return{id,workspace_id:'w',class_id:'c1',lesson_id:null,lesson_version_id:null,occurred_at,status};}
function checkpoint(id:string,meeting_id:string,sequence_no:number,stopped_at:string,next_step:string|null,recorded_at=`2026-09-05T0${sequence_no}:00:00Z`):Checkpoint{return{id,workspace_id:'w',meeting_id,sequence_no,stopped_at,next_step,recorded_at};}

describe('R3.4 continuity contracts',()=>{
  it('zero previous meetings offers an empty continuity state',()=>{
    const state=deriveClassContinuity([classroom],core())[0];
    expect(state.state).toBe('empty');
    expect(state.activeMeeting).toBeNull();
    expect(state.latestActualMeeting).toBeNull();
    expect(state.latestMeaningfulCheckpoint).toBeNull();
  });

  it('completed M1 exposes its meaningful LAST/NEXT with no active Meeting',()=>{
    const m1=meeting('m1','completed','2026-09-04T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([m1],[checkpoint('cp1','m1',1,'Halaman 37','Nomor 3')]))[0];
    expect(state.activeMeeting).toBeNull();
    expect(state.latestActualMeeting?.id).toBe('m1');
    expect(state.latestMeaningfulCheckpoint).toMatchObject({stopped_at:'Halaman 37',next_step:'Nomor 3'});
  });

  it('new empty active M2 does not erase meaningful continuity from completed M1',()=>{
    const m1=meeting('m1','completed','2026-09-04T08:00:00Z');
    const m2=meeting('m2','in_progress','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([m1,m2],[checkpoint('cp1','m1',1,'Halaman 37','Nomor 3')]))[0];
    expect(state.state).toBe('active');
    expect(state.activeMeeting?.id).toBe('m2');
    expect(state.latestActualMeeting?.id).toBe('m2');
    expect(state.latestMeaningfulCheckpoint?.meeting_id).toBe('m1');
    expect(state.latestMeaningfulCheckpoint?.stopped_at).toBe('Halaman 37');
  });

  it('active M2 checkpoint supersedes older continuity anchor',()=>{
    const m1=meeting('m1','completed','2026-09-04T08:00:00Z');
    const m2=meeting('m2','in_progress','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([m1,m2],[checkpoint('cp1','m1',1,'Halaman 37','Nomor 3'),checkpoint('cp2','m2',1,'Halaman 39','Latihan mandiri')]))[0];
    expect(state.activeMeeting?.id).toBe('m2');
    expect(state.latestMeaningfulCheckpoint).toMatchObject({meeting_id:'m2',stopped_at:'Halaman 39',next_step:'Latihan mandiri'});
  });

  it('newer cancelled empty M2 does not hide completed M1 checkpoint',()=>{
    const m1=meeting('m1','completed','2026-09-04T08:00:00Z');
    const m2=meeting('m2','cancelled','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([m1,m2],[checkpoint('cp1','m1',1,'M1 stop','M1 next')]))[0];
    expect(state.latestActualMeeting?.id).toBe('m2');
    expect(state.latestMeaningfulCheckpoint).toMatchObject({meeting_id:'m1',stopped_at:'M1 stop'});
  });

  it('newer cancelled M2 with a meaningful checkpoint becomes deterministic continuity anchor',()=>{
    const m1=meeting('m1','completed','2026-09-04T08:00:00Z');
    const m2=meeting('m2','cancelled','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([m1,m2],[checkpoint('cp1','m1',1,'M1 stop','M1 next'),checkpoint('cp2','m2',1,'M2 stop','M2 next')]))[0];
    expect(state.latestMeaningfulCheckpoint).toMatchObject({meeting_id:'m2',stopped_at:'M2 stop',next_step:'M2 next'});
  });

  it('highest deterministic sequence wins within the same Meeting',()=>{
    const active=meeting('m-active','in_progress','2026-09-05T08:00:00Z');
    const state=deriveClassContinuity([classroom],core([active],[checkpoint('cp1','m-active',1,'Halaman 37','Nomor 3'),checkpoint('cp2','m-active',2,'Halaman 39','Latihan mandiri')]))[0];
    expect(state.latestMeaningfulCheckpoint).toMatchObject({sequence_no:2,stopped_at:'Halaman 39',next_step:'Latihan mandiri'});
  });

  it('Start and checkpoint server boundaries remain idempotent and caller-owned',()=>{
    expect(migration).toContain('start_teaching_meeting_operation');
    expect(migration).toContain('meetings_one_in_progress_per_class_idx');
    expect(migration).toContain("'meeting.start'");
    expect(migration).toContain("'meeting.checkpoint'");
    expect(migration).toContain('auth.uid()');
    expect(migration).not.toContain('p_workspace_id');
  });

  it('write-boundary repair revokes only Meeting/Checkpoint direct mutations',()=>{
    expect(boundary).toContain('revoke insert, update, delete on table public.meetings from authenticated');
    expect(boundary).toContain('revoke insert, update, delete on table public.checkpoints from authenticated');
    expect(boundary).toContain('grant select on table public.meetings to authenticated');
    expect(boundary).not.toContain('public.materials');
    expect(boundary).not.toContain('public.lessons');
    expect(boundary).not.toContain('public.activities');
  });

  it('checkpoint reaches Pending Safe only after durable IndexedDB add and lifecycle rereads durability under lock',()=>{
    const enqueueStart=queue.indexOf('export async function enqueueMeetingCheckpoint');
    const add=queue.indexOf('await db.operations.add(operation)',enqueueStart);
    const returned=queue.indexOf('return operation',enqueueStart);
    expect(add).toBeGreaterThan(enqueueStart);
    expect(returned).toBeGreaterThan(add);
    expect(safety).toContain('pendingMeetingCheckpoints(db,authUserId,workspaceId,meetingId)');
    expect(safety.indexOf('pendingMeetingCheckpoints')).toBeLessThan(safety.indexOf('result:await lifecycleRpc()'));
    expect(ui).toContain('withMeetingLifecyclePreflight');
  });

  it('UI keeps checkpoint write safety separate from canonical refresh availability',()=>{
    expect(ui).toContain('Phase 1: durable enqueue');
    expect(ui).toContain('Phase 2: sync');
    expect(ui).toContain('Phase 3: canonical read-model refresh');
    expect(ui).toContain('Saved — server mengonfirmasi checkpoint. Latest view belum dapat refresh');
    expect(ui).toContain('Failed — checkpoint belum tersimpan aman di perangkat');
    expect(ui).toContain("remaining.status==='FAILED'");
  });

  it('explicit lifecycle remains explicit and cross-tab coordination is advisory, not the safety decision',()=>{
    expect(ui).toContain('Complete Class');
    expect(ui).toContain('Cancel Meeting');
    expect(ui).toContain('subscribeSafeWorkChanges');
    expect(ui).not.toContain("return()=>{void changeMeetingStatus('completed')");
  });

  it('unknown Safe Work operation kind fails closed instead of falling through to student.rename',async()=>{
    const invalid={operation_kind:'unknown.operation'} as unknown as PendingOperation;
    const result=await applySafeWorkOperation({} as SupabaseClient,invalid);
    expect(result).toEqual({kind:'failed',code:'UNKNOWN_OPERATION_KIND'});
  });
});
