import type { SupabaseClient } from '@supabase/supabase-js';

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
  revision?: number;
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

export type PlannedScheduleInput = {
  classId: string;
  weekday: number;
  localStartTime: string;
  localEndTime: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
};

type PlannedScheduleRow = {
  id: string;
  workspace_id: string;
  class_id: string;
  weekday: number;
  local_start_time: string;
  local_end_time: string;
  effective_from: string;
  effective_until: string | null;
  status: 'active' | 'archived';
  revision: number;
};

type ClassNameRow = { id: string; display_name: string };

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

const validDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function validatePlannedScheduleInput(input: PlannedScheduleInput): PlannedScheduleInput {
  const classId = input.classId.trim();
  if (!classId) throw new Error('Class wajib dipilih.');
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) throw new Error('Hari harus ISO 1..7.');
  if (seconds(input.localStartTime) >= seconds(input.localEndTime)) throw new Error('Jam selesai harus setelah jam mulai.');
  if (!validDate(input.effectiveFrom)) throw new Error('Tanggal mulai jadwal tidak valid.');
  const until = input.effectiveUntil?.trim() || null;
  if (until && !validDate(until)) throw new Error('Tanggal akhir jadwal tidak valid.');
  if (until && until < input.effectiveFrom) throw new Error('Tanggal akhir tidak boleh sebelum tanggal mulai.');
  return {
    classId,
    weekday: input.weekday,
    localStartTime: input.localStartTime,
    localEndTime: input.localEndTime,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: until,
  };
}

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

function asContext(row: PlannedScheduleRow, names: Map<string, string>): PlannedSlotContext {
  const className = names.get(row.class_id);
  if (!className) throw new Error(`Class jadwal tidak tersedia: ${row.class_id}`);
  return {
    schedule_id: row.id,
    class_id: row.class_id,
    class_name: className,
    weekday: row.weekday,
    local_start_time: row.local_start_time,
    local_end_time: row.local_end_time,
    effective_from: row.effective_from,
    effective_until: row.effective_until,
    status: row.status,
    revision: row.revision,
  };
}

/** RLS remains the ownership authority; workspace_id is also supplied to keep reads bounded. */
export async function loadPlannedScheduleContexts(client: SupabaseClient, workspaceId: string): Promise<PlannedSlotContext[]> {
  const [scheduleQ, classQ] = await Promise.all([
    client.from('planned_schedules').select('id,workspace_id,class_id,weekday,local_start_time,local_end_time,effective_from,effective_until,status,revision').eq('workspace_id', workspaceId).order('weekday', { ascending: true }).order('local_start_time', { ascending: true }),
    client.from('classes').select('id,display_name').eq('workspace_id', workspaceId),
  ]);
  if (scheduleQ.error) throw new Error(`Jadwal belum dapat dimuat: ${scheduleQ.error.message}`);
  if (classQ.error) throw new Error(`Nama kelas untuk jadwal belum dapat dimuat: ${classQ.error.message}`);
  const names = new Map(((classQ.data ?? []) as ClassNameRow[]).map((row) => [row.id, row.display_name]));
  return ((scheduleQ.data ?? []) as PlannedScheduleRow[]).map((row) => asContext(row, names));
}

function persistencePayload(workspaceId: string, input: PlannedScheduleInput) {
  const valid = validatePlannedScheduleInput(input);
  return {
    workspace_id: workspaceId,
    class_id: valid.classId,
    weekday: valid.weekday,
    local_start_time: valid.localStartTime,
    local_end_time: valid.localEndTime,
    effective_from: valid.effectiveFrom,
    effective_until: valid.effectiveUntil ?? null,
  };
}

export async function createPlannedSchedule(client: SupabaseClient, workspaceId: string, input: PlannedScheduleInput): Promise<PlannedScheduleRow> {
  const { data, error } = await client.from('planned_schedules').insert({ ...persistencePayload(workspaceId, input), status: 'active' }).select('*').single();
  if (error) throw new Error(`Jadwal belum dapat disimpan: ${error.message}`);
  return data as PlannedScheduleRow;
}

export async function updatePlannedSchedule(client: SupabaseClient, workspaceId: string, scheduleId: string, expectedRevision: number, input: PlannedScheduleInput): Promise<PlannedScheduleRow> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Revision jadwal tidak valid.');
  const payload = persistencePayload(workspaceId, input);
  const { data, error } = await client.from('planned_schedules')
    .update({ ...payload, revision: expectedRevision + 1, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId).eq('id', scheduleId).eq('revision', expectedRevision)
    .select('*').maybeSingle();
  if (error) throw new Error(`Jadwal belum dapat diperbarui: ${error.message}`);
  if (!data) throw new Error('Jadwal berubah di perangkat/sesi lain. Muat ulang sebelum menyimpan.');
  return data as PlannedScheduleRow;
}

export async function archivePlannedSchedule(client: SupabaseClient, workspaceId: string, scheduleId: string, expectedRevision: number): Promise<PlannedScheduleRow> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Revision jadwal tidak valid.');
  const { data, error } = await client.from('planned_schedules')
    .update({ status: 'archived', revision: expectedRevision + 1, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId).eq('id', scheduleId).eq('revision', expectedRevision)
    .select('*').maybeSingle();
  if (error) throw new Error(`Jadwal belum dapat diarsipkan: ${error.message}`);
  if (!data) throw new Error('Jadwal berubah di perangkat/sesi lain. Muat ulang sebelum mengarsipkan.');
  return data as PlannedScheduleRow;
}
