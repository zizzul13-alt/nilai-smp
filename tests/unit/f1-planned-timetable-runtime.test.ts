import { describe, expect, it } from 'vitest';
import { derivePlannedSuggestion, type PlannedSlotContext } from '../../src/services/academic/plannedTimetable';

const slot = (overrides: Partial<PlannedSlotContext> = {}): PlannedSlotContext => ({
  schedule_id: 's1',
  class_id: 'c1',
  class_name: '8D',
  weekday: 1,
  local_start_time: '09:30',
  local_end_time: '10:10',
  effective_from: '2026-07-01',
  effective_until: null,
  status: 'active',
  ...overrides,
});

const monday = { date: '2026-09-14', weekday: 1, time: '09:45' } as const;

describe('F1 planned timetable runtime derivation', () => {
  it('returns none when no slot applies', () => {
    expect(derivePlannedSuggestion([], monday)).toEqual({ kind: 'none' });
  });

  it('returns likely-now inside an effective active slot', () => {
    const result = derivePlannedSuggestion([slot()], monday);
    expect(result.kind).toBe('likely-now');
    if (result.kind === 'likely-now') {
      expect(result.slot.class_name).toBe('8D');
      expect(result.ambiguous).toEqual([]);
    }
  });

  it('treats end time as exclusive and returns next planned', () => {
    const result = derivePlannedSuggestion(
      [slot(), slot({ schedule_id: 's2', class_id: 'c2', class_name: '8E', local_start_time: '10:30', local_end_time: '11:10' })],
      { ...monday, time: '10:10' },
    );
    expect(result.kind).toBe('next-planned');
    if (result.kind === 'next-planned') expect(result.slot.class_name).toBe('8E');
  });

  it('ignores archived and expired slots', () => {
    const result = derivePlannedSuggestion(
      [
        slot({ status: 'archived' }),
        slot({ schedule_id: 'expired', effective_until: '2026-09-13' }),
      ],
      monday,
    );
    expect(result).toEqual({ kind: 'none' });
  });

  it('surfaces overlapping ambiguity instead of inventing truth', () => {
    const result = derivePlannedSuggestion(
      [
        slot(),
        slot({ schedule_id: 's2', class_id: 'c2', class_name: '8E', local_start_time: '09:40', local_end_time: '10:20' }),
      ],
      monday,
    );
    expect(result.kind).toBe('likely-now');
    if (result.kind === 'likely-now') {
      expect(result.slot.class_name).toBe('8D');
      expect(result.ambiguous.map((candidate) => candidate.class_name)).toEqual(['8E']);
    }
  });

  it('surfaces equal next-start ambiguity with stable ordering', () => {
    const result = derivePlannedSuggestion(
      [
        slot({ schedule_id: 'z', class_id: 'c2', class_name: '8E', local_start_time: '10:30', local_end_time: '11:10' }),
        slot({ schedule_id: 'a', class_id: 'c1', class_name: '8D', local_start_time: '10:30', local_end_time: '11:00' }),
      ],
      { ...monday, time: '08:00' },
    );
    expect(result.kind).toBe('next-planned');
    if (result.kind === 'next-planned') {
      expect(result.slot.class_name).toBe('8D');
      expect(result.ambiguous.map((candidate) => candidate.class_name)).toEqual(['8E']);
    }
  });

  it('does not depend on runtime timezone because local boundary is explicit', () => {
    const result = derivePlannedSuggestion([slot()], {
      date: '2026-09-14',
      weekday: 1,
      time: '09:45:00',
    });
    expect(result.kind).toBe('likely-now');
  });

  it('rejects invalid ISO weekday input', () => {
    expect(() => derivePlannedSuggestion([slot()], { ...monday, weekday: 0 })).toThrow('weekday must be ISO 1..7');
  });
});
