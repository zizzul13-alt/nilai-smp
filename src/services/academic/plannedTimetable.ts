export type PlannedSlotContext = {
  schedule_id: string;
  class_id: string;
  class_name: string;
  weekday: number;
  local_start_time: string;
  local_end_time: string;
  effective_from: string;
  effective_until?: string | null;
  status?: 'active' | 'archived';
};

export type PlannedSuggestion =
  | { kind: 'none' }
  | { kind: 'likely-now'; slot: PlannedSlotContext; ambiguous: PlannedSlotContext[] }
  | { kind: 'next-planned'; slot: PlannedSlotContext; ambiguous: PlannedSlotContext[] };

export type LocalNow = {
  date: string; // YYYY-MM-DD, supplied explicitly by the caller.
  weekday: number; // ISO 1=Monday ... 7=Sunday.
  time: string; // HH:MM or HH:MM:SS local wall clock.
};

const seconds = (value: string): number => {
  const parts = value.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) {
    throw new Error(`invalid local time: ${value}`);
  }
  const [hour, minute, second = 0] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new Error(`invalid local time: ${value}`);
  }
  return hour * 3600 + minute * 60 + second;
};

const effectiveOn = (slot: PlannedSlotContext, date: string): boolean =>
  slot.status !== 'archived' &&
  slot.effective_from <= date &&
  (slot.effective_until == null || date <= slot.effective_until);

const stableOrder = (a: PlannedSlotContext, b: PlannedSlotContext): number =>
  seconds(a.local_start_time) - seconds(b.local_start_time) ||
  seconds(a.local_end_time) - seconds(b.local_end_time) ||
  a.class_name.localeCompare(b.class_name) ||
  a.class_id.localeCompare(b.class_id) ||
  a.schedule_id.localeCompare(b.schedule_id);

/**
 * Pure F1 convenience derivation. It never creates or mutates Meetings.
 * The caller must pass school-local wall-clock date/time explicitly so tests and
 * runtime behavior never depend on the machine timezone.
 */
export function derivePlannedSuggestion(
  slots: readonly PlannedSlotContext[],
  now: LocalNow,
): PlannedSuggestion {
  if (now.weekday < 1 || now.weekday > 7) throw new Error('weekday must be ISO 1..7');
  const nowSeconds = seconds(now.time);

  const applicable = slots
    .filter((slot) => slot.weekday === now.weekday && effectiveOn(slot, now.date))
    .slice()
    .sort(stableOrder);

  const inside = applicable.filter(
    (slot) => seconds(slot.local_start_time) <= nowSeconds && nowSeconds < seconds(slot.local_end_time),
  );
  if (inside.length > 0) {
    return { kind: 'likely-now', slot: inside[0], ambiguous: inside.slice(1) };
  }

  const later = applicable.filter((slot) => seconds(slot.local_start_time) > nowSeconds);
  if (later.length > 0) {
    const firstStart = seconds(later[0].local_start_time);
    const tied = later.filter((slot) => seconds(slot.local_start_time) === firstStart);
    return { kind: 'next-planned', slot: tied[0], ambiguous: tied.slice(1) };
  }

  return { kind: 'none' };
}
