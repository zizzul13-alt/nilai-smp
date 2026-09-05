import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assessment, Enrollment, Result, ResultState, Student } from '../../domain/academic';

export const BULK_MAX_ROWS = 500;
export const BULK_MAX_FILE_BYTES = 2_000_000;

export type BulkContext = {
  assessment: Assessment;
  enrollments: Enrollment[];
  students: Student[];
  results: Result[];
};

export type RawBulkRow = {
  row: number;
  enrollmentId?: string;
  nis?: string;
  nisn?: string;
  name?: string;
  value: unknown;
};

export type BulkPreviewRow = {
  row: number;
  enrollment: Enrollment | null;
  student: Student | null;
  raw: string;
  state: ResultState;
  score: number | null;
  expectedRevision: number;
  status: 'VALID' | 'AMBIGUOUS' | 'UNMATCHED' | 'ERROR';
  errors: string[];
  action: 'create' | 'change' | 'no-op';
};

export type PreparedBulkBatch = {
  opId: string;
  preview: BulkPreviewRow[];
};

export async function loadBulkContext(
  client: SupabaseClient,
  workspaceId: string,
  assessmentId: string,
): Promise<BulkContext> {
  const { data: a, error: ae } = await client
    .from('assessments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', assessmentId)
    .single();
  if (ae) throw ae;

  const assessment = a as Assessment;
  const [e, s, r] = await Promise.all([
    client.from('enrollments').select('*').eq('workspace_id', workspaceId).eq('class_id', assessment.class_id),
    client.from('students').select('*').eq('workspace_id', workspaceId),
    client.from('assessment_results').select('*').eq('workspace_id', workspaceId).eq('assessment_id', assessmentId),
  ]);
  for (const q of [e, s, r]) if (q.error) throw q.error;

  const enrollments = (e.data ?? []) as Enrollment[];
  const ids = new Set(enrollments.map(x => x.student_id));
  return {
    assessment,
    enrollments,
    students: ((s.data ?? []) as Student[]).filter(x => ids.has(x.id)),
    results: (r.data ?? []) as Result[],
  };
}

export function bulkDraftFromContext(ctx: BulkContext): Record<string, string> {
  return Object.fromEntries(
    ctx.enrollments.map(enrollment => {
      const result = ctx.results.find(row => row.enrollment_id === enrollment.id);
      const value = result?.state === 'GRADED'
        ? String(result.score)
        : result?.state === 'MISSING'
          ? 'MISSING'
          : result?.state === 'EXCUSED'
            ? 'EXCUSED'
            : '';
      return [enrollment.id, value];
    }),
  );
}

export function interpretBulkValue(value: unknown): { state: ResultState; score: number | null; error?: string } {
  if (value === null || value === undefined || value === '') return { state: 'UNCHECKED', score: null };
  if (typeof value === 'number' && Number.isFinite(value)) return { state: 'GRADED', score: value };
  if (typeof value !== 'string') return { state: 'UNCHECKED', score: null, error: 'Nilai tidak didukung.' };

  const v = value.trim();
  if (!v) return { state: 'UNCHECKED', score: null };
  if (/^MISSING$/i.test(v) || /^TIDAK ADA$/i.test(v)) return { state: 'MISSING', score: null };
  if (/^EXCUSED$/i.test(v) || /^IZIN$/i.test(v)) return { state: 'EXCUSED', score: null };
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return { state: 'GRADED', score: n };
  }
  return { state: 'UNCHECKED', score: null, error: `Nilai "${v.slice(0, 80)}" tidak valid.` };
}

function candidates(ctx: BulkContext, row: RawBulkRow) {
  if (!row.enrollmentId) return [];
  return ctx.enrollments.filter(enrollment => enrollment.id === row.enrollmentId);
}

export function previewBulkRows(ctx: BulkContext, rows: RawBulkRow[]): BulkPreviewRow[] {
  if (rows.length > BULK_MAX_ROWS) throw new Error(`Maksimal ${BULK_MAX_ROWS} baris.`);
  const seen = new Set<string>();

  return rows.map(row => {
    const match = candidates(ctx, row);
    const parsed = interpretBulkValue(row.value);
    const errors: string[] = [];
    let status: BulkPreviewRow['status'] = 'VALID';
    let enrollment: Enrollment | null = null;

    if (!row.enrollmentId) {
      status = 'ERROR';
      errors.push('Enrollment_ID wajib. NIS/NISN/Nama tidak boleh menggantikan identitas Enrollment.');
    } else if (match.length === 0) {
      status = 'UNMATCHED';
      errors.push('Enrollment_ID tidak ditemukan di kelas Assessment ini.');
    } else if (match.length > 1) {
      status = 'AMBIGUOUS';
      errors.push('Enrollment_ID cocok ke lebih dari satu Enrollment.');
    } else {
      enrollment = match[0];
      if (seen.has(enrollment.id)) {
        status = 'ERROR';
        errors.push('Enrollment muncul lebih dari sekali dalam file.');
      }
      seen.add(enrollment.id);
    }

    if (parsed.error) {
      status = 'ERROR';
      errors.push(parsed.error);
    }

    const student = enrollment ? ctx.students.find(s => s.id === enrollment!.student_id) ?? null : null;
    const current = enrollment ? ctx.results.find(r => r.enrollment_id === enrollment!.id) ?? null : null;
    let action: BulkPreviewRow['action'] = 'create';
    if (parsed.state === 'UNCHECKED') action = 'no-op';
    else if (current) action = current.state === parsed.state && current.score === parsed.score ? 'no-op' : 'change';

    return {
      row: row.row,
      enrollment,
      student,
      raw: String(row.value ?? ''),
      state: parsed.state,
      score: parsed.score,
      expectedRevision: current?.revision ?? 0,
      status,
      errors,
      action,
    };
  });
}

export function rowsForCommit(preview: BulkPreviewRow[]) {
  if (preview.some(r => r.status !== 'VALID')) throw new Error('Perbaiki semua error sebelum Commit.');
  return preview
    .filter(r => r.action !== 'no-op')
    .map(r => ({
      enrollment_id: r.enrollment!.id,
      state: r.state,
      score: r.score,
      expected_revision: r.expectedRevision,
      attempt_kind: null,
      raw_score: null,
    }));
}

export function prepareBulkBatch(preview: BulkPreviewRow[]): PreparedBulkBatch {
  return { opId: crypto.randomUUID(), preview };
}

export async function commitBulkAssessment(
  client: SupabaseClient,
  assessmentId: string,
  opId: string,
  preview: BulkPreviewRow[],
) {
  const { data, error } = await client.rpc('apply_assessment_bulk_operation', {
    p_op_id: opId,
    p_assessment_id: assessmentId,
    p_rows: rowsForCommit(preview),
  });
  if (error) throw new Error(`Bulk commit gagal: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Bulk commit tidak mengembalikan hasil.');
  return row as {
    outcome: 'saved' | 'conflict';
    replayed: boolean;
    summary: Record<string, number> | null;
    conflicts: unknown[];
  };
}

export function commitPreparedBulkAssessment(
  client: SupabaseClient,
  assessmentId: string,
  prepared: PreparedBulkBatch,
) {
  return commitBulkAssessment(client, assessmentId, prepared.opId, prepared.preview);
}

export function templateRows(ctx: BulkContext) {
  return ctx.enrollments.map(enrollment => {
    const student = ctx.students.find(x => x.id === enrollment.student_id)!;
    return {
      Assessment_ID: ctx.assessment.id,
      Enrollment_ID: enrollment.id,
      NIS: student?.nis ?? '',
      NISN: student?.nisn ?? '',
      Nama: student?.display_name ?? '',
      Nilai: '',
    };
  });
}

export function safeCsvCell(v: unknown) {
  let s = String(v ?? '').replace(/"/g, '""');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s}"`;
}

export function makeCsvTemplate(ctx: BulkContext) {
  const rows = templateRows(ctx);
  const headers = ['Assessment_ID', 'Enrollment_ID', 'NIS', 'NISN', 'Nama', 'Nilai'];
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => safeCsvCell((r as Record<string, unknown>)[h])).join(',')),
  ].join('\r\n');
}
