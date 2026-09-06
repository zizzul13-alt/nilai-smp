import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{countActualLessonMeetings,effectiveMeetings,projectPacingPlan,recommendPacingMode}from'../../src/services/academic/pacing';
import type{Meeting}from'../../src/domain/academic';

const migration=readFileSync('supabase/migrations/202609060002_pacing_final_torture.sql','utf8');
const teaching=readFileSync('src/components/TeachingContinuity.tsx','utf8');
const panel=readFileSync('src/components/PacingPanel.tsx','utf8');

const base={normal_meetings:4,available_meetings:3,correction_reserve:1,core_targets:['Konsep inti'],practice_targets:['Latihan terpandu','Transfer mandiri'],stretch_targets:['Breadth tambahan'],minimum_exit_criteria:['Dapat menjelaskan konsep'],teacher_mode:null as null|'RELAXED'|'NORMAL'|'COMPRESSED'};

describe('R3.4-03 pacing contracts',()=>{
  it('uses explicit capacity and correction reserve for Effective Meetings',()=>{
    expect(effectiveMeetings(base)).toBe(2);
    expect(recommendPacingMode(base)).toBe('COMPRESSED');
    expect(recommendPacingMode({...base,available_meetings:5,correction_reserve:1})).toBe('NORMAL');
    expect(recommendPacingMode({...base,available_meetings:7,correction_reserve:1})).toBe('RELAXED');
  });

  it('teacher override wins recommendation without changing the underlying capacity evidence',()=>{
    const projection=projectPacingPlan({...base,teacher_mode:'RELAXED'});
    expect(projection.recommendation).toBe('COMPRESSED');
    expect(projection.mode).toBe('RELAXED');
    expect(projection.teacherOverride).toBe(true);
    expect(projection.effectiveMeetings).toBe(2);
  });

  it('COMPRESSED reduces breadth before comprehension and never removes exit criteria',()=>{
    const projection=projectPacingPlan(base);
    expect(projection.mode).toBe('COMPRESSED');
    expect(projection.coreTargets).toEqual(['Konsep inti']);
    expect(projection.practiceTargets).toEqual(['Latihan terpandu','Transfer mandiri']);
    expect(projection.practicePolicy).toBe('SELECTIVE');
    expect(projection.stretchTargets).toEqual(['Breadth tambahan']);
    expect(projection.stretchPolicy).toBe('DEFER_FIRST');
    expect(projection.minimumExitCriteria).toEqual(['Dapat menjelaskan konsep']);
  });

  it('counts actual Meetings only; planned/cancelled/archive and schedule-like rows never become evidence',()=>{
    const make=(id:string,status:Meeting['status'],classId='C1',lessonId:string|null='L1'):Meeting=>({id,workspace_id:'W',class_id:classId,lesson_id:lessonId,lesson_version_id:null,occurred_at:'2026-09-06T00:00:00Z',status});
    const meetings=[make('M1','planned'),make('M2','in_progress'),make('M3','completed'),make('M4','cancelled'),make('M5','archived'),make('M6','completed','C2'),make('M7','completed','C1','L2')];
    expect(countActualLessonMeetings(meetings,'C1','L1')).toBe(2);
  });

  it('keeps pacing class+lesson scoped and server-owned',()=>{
    expect(migration).toContain('create table public.lesson_pacing_plans');
    expect(migration).toContain('constraint lesson_pacing_class_lesson_unique unique(workspace_id,class_id,lesson_id)');
    expect(migration).toContain('revoke insert,update,delete on public.lesson_pacing_plans from authenticated');
    expect(migration).toContain('create or replace function public.upsert_lesson_pacing_plan_operation');
    expect(migration).toContain('p_expected_revision is null');
    expect(migration).toContain("'r3.4-pacing-final.1'");
  });

  it('preserves existing LessonVersion provenance when editing a pacing plan',()=>{
    expect(panel).toContain('const persistedLessonVersionId=plan?plan.lesson_version_id:lessonVersionId');
    expect(panel).toContain('lessonVersionId:persistedLessonVersionId');
  });

  it('integrates pacing into Teaching without creating a timetable or homework subsystem',()=>{
    expect(teaching).toContain('<PacingPanel');
    expect(teaching).toContain('countActualLessonMeetings');
    expect(teaching.toLowerCase()).not.toContain('homework');
    expect(teaching.toLowerCase()).not.toContain('timetable');
  });
});
