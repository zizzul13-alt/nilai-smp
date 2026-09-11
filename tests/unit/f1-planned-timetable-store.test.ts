import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validatePlannedScheduleInput } from '../../src/services/academic/plannedTimetable';

const source = readFileSync(new URL('../../src/services/academic/plannedTimetable.ts', import.meta.url), 'utf8');

describe('F1 planned timetable persistence boundary', () => {
  it('normalizes a bounded valid slot without inventing Meeting semantics', () => {
    expect(validatePlannedScheduleInput({
      classId: ' C1 ', weekday: 4, localStartTime: '09:30', localEndTime: '10:10', effectiveFrom: '2026-07-01', effectiveUntil: '',
    })).toEqual({
      classId: 'C1', weekday: 4, localStartTime: '09:30', localEndTime: '10:10', effectiveFrom: '2026-07-01', effectiveUntil: null,
    });
  });

  it('rejects invalid weekday/time/effective ranges before persistence', () => {
    expect(() => validatePlannedScheduleInput({ classId: 'C1', weekday: 0, localStartTime: '09:30', localEndTime: '10:10', effectiveFrom: '2026-07-01' })).toThrow(/ISO 1\.\.7/);
    expect(() => validatePlannedScheduleInput({ classId: 'C1', weekday: 1, localStartTime: '10:10', localEndTime: '09:30', effectiveFrom: '2026-07-01' })).toThrow(/setelah jam mulai/);
    expect(() => validatePlannedScheduleInput({ classId: 'C1', weekday: 1, localStartTime: '09:30', localEndTime: '10:10', effectiveFrom: '2026-07-10', effectiveUntil: '2026-07-01' })).toThrow(/tidak boleh sebelum/);
  });

  it('uses workspace-bounded RLS-backed CRUD with optimistic revision checks', () => {
    expect(source).toContain("client.from('planned_schedules')");
    expect(source).toContain(".eq('workspace_id', workspaceId)");
    expect(source).toContain(".eq('revision', expectedRevision)");
    expect(source).toContain("revision: expectedRevision + 1");
    expect(source).toContain("status: 'archived'");
  });

  it('contains no Meeting mutation path', () => {
    expect(source).not.toMatch(/from\(['\"]meetings['\"]\)/);
    expect(source).not.toMatch(/rpc\(['\"][^'\"]*meeting/i);
  });
});
