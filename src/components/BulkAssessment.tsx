import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assessment } from '../domain/academic';
import {
  bulkDraftFromContext,
  commitPreparedBulkAssessment,
  loadBulkContext,
  prepareBulkBatch,
  previewBulkRows,
  type BulkContext,
  type PreparedBulkBatch,
  type RawBulkRow,
} from '../services/academic/bulkAssessment';
import { makeXlsxTemplate, parseXlsx } from '../services/academic/bulkSpreadsheet';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BulkAssessment({ client, workspaceId }: { client: SupabaseClient; workspaceId: string }) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentId, setAssessmentId] = useState('');
  const [ctx, setCtx] = useState<BulkContext | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<PreparedBulkBatch | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const preview = prepared?.preview ?? [];

  useEffect(() => {
    let active = true;
    void client.from('assessments').select('*').eq('workspace_id', workspaceId).then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(error.message);
      else setAssessments((data ?? []) as Assessment[]);
    });
    return () => { active = false; };
  }, [client, workspaceId]);

  useEffect(() => {
    let active = true;
    setPrepared(null);
    setSummary(null);
    setMessage('');
    setCtx(null);
    setDraft({});

    if (!assessmentId) return () => { active = false; };

    void loadBulkContext(client, workspaceId, assessmentId)
      .then(next => {
        if (!active) return;
        setCtx(next);
        setDraft(bulkDraftFromContext(next));
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : String(error));
      });

    return () => { active = false; };
  }, [assessmentId, client, workspaceId]);

  const roster = useMemo(
    () => ctx?.enrollments.map(enrollment => ({
      enrollment,
      student: ctx.students.find(student => student.id === enrollment.student_id)!,
    })) ?? [],
    [ctx],
  );

  function buildPreview() {
    if (!ctx) return;
    const rows: RawBulkRow[] = roster.map(({ enrollment, student }, index) => ({
      row: index + 2,
      enrollmentId: enrollment.id,
      nis: student.nis ?? '',
      nisn: student.nisn ?? '',
      name: student.display_name,
      value: draft[enrollment.id] ?? '',
    }));
    setPrepared(prepareBulkBatch(previewBulkRows(ctx, rows)));
    setSummary(null);
  }

  function changeDraft(enrollmentId: string, value: string) {
    setDraft(current => ({ ...current, [enrollmentId]: value }));
    setPrepared(null);
    setSummary(null);
  }

  async function importFile(file: File) {
    if (!ctx) return;
    setBusy(true);
    setMessage('');
    setPrepared(null);
    setSummary(null);
    try {
      const rows = await parseXlsx(file, ctx.assessment.id);
      setPrepared(prepareBulkBatch(previewBulkRows(ctx, rows)));
      setMessage('Preview siap. Belum ada perubahan akademik.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!ctx || !prepared) return;
    setBusy(true);
    setMessage('');
    const committingAssessmentId = ctx.assessment.id;
    try {
      const result = await commitPreparedBulkAssessment(client, committingAssessmentId, prepared);
      const fresh = await loadBulkContext(client, workspaceId, committingAssessmentId);
      setCtx(fresh);
      setDraft(bulkDraftFromContext(fresh));

      if (result.outcome === 'conflict') {
        setPrepared(null);
        setMessage('CONFLICT: data server berubah setelah Preview. Data terbaru sudah dimuat; tinjau ulang sebelum membuat batch baru.');
        return;
      }

      setSummary(result.summary);
      setPrepared(null);
      setMessage('Saved — server mengonfirmasi commit atomik.');
    } catch (error) {
      // Keep the prepared batch and op_id on transport/unknown failure so retry is genuinely idempotent.
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bulk-assessment">
      <p className="eyebrow">Desktop power workflow</p>
      <h2>Bulk Entry / Excel Import</h2>
      <p>Rapid Correction tetap untuk koreksi kertas di ponsel. Import membutuhkan koneksi; Preview lokal tidak mengubah nilai.</p>

      <label>
        Assessment
        <select value={assessmentId} disabled={busy} onChange={event => setAssessmentId(event.target.value)}>
          <option value="">Pilih Assessment</option>
          {assessments.map(assessment => (
            <option key={assessment.id} value={assessment.id}>{assessment.title}</option>
          ))}
        </select>
      </label>

      {assessmentId && !ctx && !message ? <p role="status">Memuat Assessment…</p> : null}

      {ctx ? (
        <>
          <div className="bulk-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => download(makeXlsxTemplate(ctx), `nilai-smp-${ctx.assessment.id}.xlsx`)}
            >
              Unduh template XLSX
            </button>
            <label className="file-button">
              Pilih XLSX
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </label>
          </div>

          <div className="bulk-grid" role="table">
            <div className="bulk-row bulk-head" role="row">
              <span>Nama</span><span>NIS/NISN</span><span>Nilai / status</span>
            </div>
            {roster.map(({ enrollment, student }) => (
              <div className="bulk-row" role="row" key={enrollment.id}>
                <span>{student.display_name}</span>
                <span>{student.nis ?? student.nisn ?? '—'}</span>
                <input
                  aria-label={`Nilai ${student.display_name}`}
                  disabled={busy}
                  value={draft[enrollment.id] ?? ''}
                  onChange={event => changeDraft(enrollment.id, event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      const inputs = [...document.querySelectorAll<HTMLInputElement>('.bulk-grid input')];
                      const index = inputs.indexOf(event.currentTarget);
                      inputs[index + 1]?.focus();
                    }
                  }}
                  placeholder="blank / 0 / -5 / MISSING / EXCUSED"
                />
              </div>
            ))}
          </div>

          <button type="button" disabled={busy} onClick={buildPreview}>Validate & Preview</button>
        </>
      ) : null}

      {preview.length ? (
        <div className="bulk-preview">
          <h3>Preview</h3>
          <p>{preview.filter(row => row.status === 'VALID').length} valid · {preview.filter(row => row.status !== 'VALID').length} error</p>
          {preview.map(row => (
            <div key={row.row} className="preview-row">
              <strong>Row {row.row}</strong> {row.student?.display_name ?? 'Tidak cocok'} · raw “{row.raw}” → {row.state}
              {row.score !== null ? ` ${row.score}` : ''} · {row.action} · {row.status}
              {row.errors.length ? ` — ${row.errors.join(' ')}` : ''}
            </div>
          ))}
          <button
            type="button"
            disabled={busy || preview.some(row => row.status !== 'VALID')}
            onClick={() => void commit()}
          >
            Commit online atomik
          </button>
        </div>
      ) : null}

      {message ? <p role="status">{message}</p> : null}
      {summary ? <div className="commit-summary"><h3>Summary</h3><pre>{JSON.stringify(summary, null, 2)}</pre></div> : null}
    </section>
  );
}
