import { FormEvent, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcademicClass } from '../domain/academic';
import {
  createAssessment,
  loadAssessmentCreationContext,
  type AssessmentCreationContext,
} from '../services/academic/assessmentCore';

export function AssessmentManager({ client, workspaceId }: { client: SupabaseClient; workspaceId: string }) {
  const [context, setContext] = useState<AssessmentCreationContext | null>(null);
  const [classId, setClassId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const next = await loadAssessmentCreationContext(client, workspaceId);
    setContext(next);
    if (!classId && next.classes[0]) setClassId(next.classes[0].id);
  }

  useEffect(() => {
    let active = true;
    void loadAssessmentCreationContext(client, workspaceId)
      .then(next => {
        if (!active) return;
        setContext(next);
        if (next.classes[0]) setClassId(next.classes[0].id);
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, [client, workspaceId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!context) return;
    const academicClass = context.classes.find(row => row.id === classId) as AcademicClass | undefined;
    if (!academicClass) {
      setMessage('Pilih kelas aktif terlebih dahulu.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const created = await createAssessment(client, workspaceId, {
        academicClass,
        title,
        description,
        scoringProfileId: profileId || null,
      });
      setTitle('');
      setDescription('');
      setMessage(`Assessment “${created.title}” siap dipakai.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!context) {
    return <section className="assessment-manager"><p role="status">Memuat Assessment…</p>{message ? <p role="alert">{message}</p> : null}</section>;
  }

  return (
    <section className="assessment-manager">
      <p className="eyebrow">Assessment workspace</p>
      <h2>Buat Assessment</h2>
      <p>Buat identitas penilaian sekali, lalu gunakan di Rapid Correction atau Bulk Entry.</p>

      {context.classes.length === 0 ? (
        <p role="status">Belum ada kelas aktif. Assessment baru belum bisa dibuat.</p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>
            Kelas
            <select value={classId} disabled={busy} onChange={event => setClassId(event.target.value)} required>
              {context.classes.map(row => <option key={row.id} value={row.id}>{row.display_name}</option>)}
            </select>
          </label>

          <label>
            Judul Assessment
            <input value={title} disabled={busy} maxLength={160} onChange={event => setTitle(event.target.value)} required placeholder="Contoh: Kuis Bab 2" />
          </label>

          <label>
            Deskripsi opsional
            <input value={description} disabled={busy} maxLength={240} onChange={event => setDescription(event.target.value)} placeholder="Catatan singkat" />
          </label>

          <label>
            Scoring Profile
            <select value={profileId} disabled={busy} onChange={event => setProfileId(event.target.value)}>
              <option value="">Tanpa profile khusus</option>
              {context.scoringProfiles.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>

          <button disabled={busy || !title.trim()}>{busy ? 'Menyimpan…' : 'Buat Assessment'}</button>
        </form>
      )}

      {message ? <p role="status">{message}</p> : null}

      <div className="assessment-list">
        <h3>Assessment aktif</h3>
        {context.assessments.length === 0 ? <p>Belum ada.</p> : context.assessments.map(row => (
          <div key={row.id} className="preview-row">
            <strong>{row.title}</strong> · {context.classes.find(cls => cls.id === row.class_id)?.display_name ?? 'Kelas tidak aktif'} · {row.status}
          </div>
        ))}
      </div>
    </section>
  );
}
