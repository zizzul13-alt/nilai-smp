import { describe, expect, it } from 'vitest';
import {
  commitPreparedBulkAssessment,
  interpretBulkValue,
  prepareBulkBatch,
  previewBulkRows,
  rowsForCommit,
  type BulkContext,
} from '../../src/services/academic/bulkAssessment';
import type { Assessment, Enrollment, Student } from '../../src/domain/academic';
import type { SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/202609040006_bulk_assessment.sql', 'utf8');
const spreadsheet = fs.readFileSync('src/services/academic/bulkSpreadsheet.ts', 'utf8');
const ui = fs.readFileSync('src/components/BulkAssessment.tsx', 'utf8');

function golden(): BulkContext {
  const assessment = {
    id: 'a', workspace_id: 'w', class_id: 'c', academic_period_id: 'p', activity_id: null,
    scoring_profile_id: null, title: 'A', description: null, instructions: null,
    status: 'active', created_at: '', updated_at: '',
  } as Assessment;
  const students: Student[] = Array.from({ length: 40 }, (_, i) => ({
    id: `s${i}`, workspace_id: 'w', display_name: i === 3 || i === 27 ? 'Nama Sama' : `Siswa ${i}`,
    nis: `N${1000 + i}`, nisn: null, status: 'active',
  }));
  const enrollments: Enrollment[] = students.map((s, i) => ({
    id: `e${i}`, workspace_id: 'w', student_id: s.id, class_id: 'c', status: 'active',
    started_on: null, ended_on: null,
  }));
  return { assessment, students, enrollments, results: [] };
}

describe('R3.3 bulk assessment laws', () => {
  it('distinguishes blank zero negative Missing and Excused', () => {
    expect(interpretBulkValue('').state).toBe('UNCHECKED');
    expect(interpretBulkValue(0)).toEqual({ state: 'GRADED', score: 0 });
    expect(interpretBulkValue('-5')).toEqual({ state: 'GRADED', score: -5 });
    expect(interpretBulkValue('MISSING')).toEqual({ state: 'MISSING', score: null });
    expect(interpretBulkValue('EXCUSED')).toEqual({ state: 'EXCUSED', score: null });
    expect(interpretBulkValue('5x').error).toBeTruthy();
  });

  it('Golden 40 resolves duplicate names by stable Enrollment identity in arbitrary order', () => {
    const ctx = golden();
    const order = [...ctx.enrollments].reverse();
    const rows = order.map((e, i) => ({
      row: i + 2,
      enrollmentId: e.id,
      name: ctx.students.find(s => s.id === e.student_id)!.display_name,
      value: i === 0 ? '' : i === 1 ? 'MISSING' : i === 2 ? 'EXCUSED' : i === 3 ? '0' : i === 4 ? '-5' : String(i),
    }));
    const preview = previewBulkRows(ctx, rows);
    const commit = rowsForCommit(preview);
    expect(preview).toHaveLength(40);
    expect(preview.every(r => r.status === 'VALID')).toBe(true);
    expect(preview.filter(r => r.student?.display_name === 'Nama Sama').map(r => r.enrollment?.id).sort()).toEqual(['e27', 'e3']);
    expect(preview[0].state).toBe('UNCHECKED');
    expect(preview[3].score).toBe(0);
    expect(preview[4].score).toBe(-5);
    expect(commit).toHaveLength(39);
    expect(commit.every(r => r.attempt_kind === null && r.raw_score === null)).toBe(true);
    expect(commit.some(r => r.enrollment_id === preview[0].enrollment?.id)).toBe(false);
  });

  it('first bulk grade is Result-only, never fabricated as CORRECTION', () => {
    const ctx = golden();
    const preview = previewBulkRows(ctx, [{ row: 2, enrollmentId: 'e1', value: 7 }]);
    const row = rowsForCommit(preview)[0];
    expect(row.state).toBe('GRADED');
    expect(row.score).toBe(7);
    expect(row.attempt_kind).toBeNull();
    expect(row.raw_score).toBeNull();
  });

  it('same prepared preview reuses one op_id across unknown transport retry', async () => {
    const ctx = golden();
    const preview = previewBulkRows(ctx, [{ row: 2, enrollmentId: 'e1', value: 7 }]);
    const prepared = prepareBulkBatch(preview);
    const calls: string[] = [];
    const client = ({
      rpc: async (_name: string, args: Record<string, unknown>) => {
        calls.push(String(args.p_op_id));
        if (calls.length === 1) return { data: null, error: { message: 'network response lost' } };
        return { data: { outcome: 'saved', replayed: true, summary: { results_created: 1 }, conflicts: [] }, error: null };
      },
    }) as unknown as SupabaseClient;

    await expect(commitPreparedBulkAssessment(client, 'a', prepared)).rejects.toThrow('network response lost');
    const result = await commitPreparedBulkAssessment(client, 'a', prepared);

    expect(result.outcome).toBe('saved');
    expect(calls).toEqual([prepared.opId, prepared.opId]);
    expect(prepareBulkBatch(preview).opId).not.toBe(prepared.opId);
    expect(ui).toContain('setPrepared(prepareBulkBatch(');
    expect(ui).toContain('commitPreparedBulkAssessment(client,ctx.assessment.id,prepared)');
  });

  it('rejects duplicate Enrollment and unmatched identity in preview', () => {
    const ctx = golden();
    const p = previewBulkRows(ctx, [
      { row: 2, enrollmentId: 'e1', value: 1 },
      { row: 3, enrollmentId: 'e1', value: 2 },
      { row: 4, enrollmentId: 'nope', value: 3 },
    ]);
    expect(p[1].status).toBe('ERROR');
    expect(p[2].status).toBe('UNMATCHED');
    expect(() => rowsForCommit(p)).toThrow();
  });

  it('server contract is one atomic idempotent revision-checked RPC', () => {
    expect(migration).toContain('apply_assessment_bulk_operation');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("'assessment.bulk'");
    expect(migration).toContain("return query select 'conflict'");
    expect(migration).toContain("'r3.3-bulk-assessment.1'");
  });

  it('xlsx path is bounded, sharedStrings-aware and formula rejecting without generic dependency', () => {
    expect(spreadsheet).toContain('xl/sharedStrings.xml');
    expect(spreadsheet).toContain("t==='s'");
    expect(spreadsheet).toContain('BULK_MAX_FILE_BYTES');
    expect(spreadsheet).toContain('Formula tidak diterima');
    expect(spreadsheet).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(ui).toContain('Preview siap. Belum ada perubahan akademik.');
    expect(ui).toContain('Commit online atomik');
  });
});
