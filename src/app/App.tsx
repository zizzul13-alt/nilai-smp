import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StatusPanel } from '../components/StatusPanel';
import { Today } from '../components/Today';
import { TeachingContinuity } from '../components/TeachingContinuity';
import { RapidCorrection } from '../components/RapidCorrection';
import { BulkAssessment } from '../components/BulkAssessment';
import { AssessmentManager } from '../components/AssessmentManager';
import { Reporting } from '../components/Reporting';
import { Artifacts } from '../components/Artifacts';
import { BackupRestore } from '../components/BackupRestore';
import { DailyDriverSetup } from '../components/DailyDriverSetup';
import { SafeWorkSummary } from '../components/SafeWorkSummary';
import { WorkspaceBootstrapGate } from '../components/WorkspaceBootstrapGate';
import { readBrowserConfig } from '../config/env';
import { EXPECTED_SCHEMA_VERSION } from '../config/schema';
import { getSupabaseClient } from '../services/supabase/client';
import {
  initialAuthSnapshot,
  loadSession,
  signInWithPassword,
  signOut,
  subscribeToAuth,
  type AuthSnapshot,
} from '../services/auth/auth';
import { checkSchemaCompatibility, type SchemaCompatibility } from '../services/schema/schemaCompatibility';
import { hasUnsyncedForUser, safeWorkDb } from '../services/safeWork/localQueue';
import { SafeWorkSyncWorker } from '../services/safeWork/syncWorker';

function SignedOut({ client, authError }: { client: SupabaseClient; authError: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(authError);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(await signInWithPassword(client, email.trim(), password));
    setBusy(false);
  }

  return (
    <main className="app-shell">
      <section className="auth-card">
        <p className="eyebrow">Nilai SMP · R3</p>
        <h1>Masuk</h1>
        <p className="muted">Masuk lalu lanjutkan pekerjaan terakhir tanpa mencari-cari modul.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label>Kata sandi<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          {error ? <p className="form-error" role="alert">Gagal masuk: {error}</p> : null}
          <button disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
        </form>
      </section>
    </main>
  );
}

type WorkspaceMode='today'|'continuity'|'assessments'|'rapid'|'bulk'|'reporting'|'artifacts'|'recovery'|'setup';

function SignedIn({ client, email, userId }: { client: SupabaseClient; email: string; userId: string }) {
  const [schema, setSchema] = useState<SchemaCompatibility | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>('today');
  const [continuityTarget,setContinuityTarget]=useState<string|undefined>(undefined);
  const [rapidTarget,setRapidTarget]=useState<string|undefined>(undefined);
  const worker = useMemo(()=>new SafeWorkSyncWorker(safeWorkDb,client),[client]);

  useEffect(() => {
    let active = true;
    void checkSchemaCompatibility(client, EXPECTED_SCHEMA_VERSION).then(result => {
      if (active) setSchema(result);
    });
    return () => { active = false; };
  }, [client]);

  async function logout() {
    if (await hasUnsyncedForUser(safeWorkDb, userId)) {
      if (!window.confirm('Ada pekerjaan Pending Safe/FAILED/CONFLICT di perangkat ini. Pekerjaan tetap disimpan dalam namespace akun ini dan tidak terlihat oleh akun lain. Tetap keluar?')) return;
    }
    setLogoutError(await signOut(client));
  }
  function openContinuity(classId?:string){setContinuityTarget(classId);setMode('continuity');}
  function openRapid(assessmentId?:string){setRapidTarget(assessmentId);setMode('rapid');}

  if (!schema) return <main className="app-shell"><StatusPanel title="Memeriksa kompatibilitas data…"><p>Memverifikasi versi schema.</p></StatusPanel></main>;
  if (schema.status === 'incompatible') return <main className="app-shell"><StatusPanel title="Database belum kompatibel" tone="error"><p>{schema.reason}</p><button onClick={logout}>Keluar</button></StatusPanel></main>;

  return (
    <WorkspaceBootstrapGate client={client} userId={userId} worker={worker} onLogout={logout} logoutError={logoutError}>
      {workspaceId => (
        <main className="teacher-shell">
          <header className="teacher-header">
            <div className="teacher-identity"><strong>Nilai SMP</strong><span>{email}</span></div>
            <SafeWorkSummary userId={userId} workspaceId={workspaceId} onOpen={()=>setMode('today')} />
            <button type="button" className="secondary compact-action" onClick={logout}>Keluar</button>
          </header>
          <nav className="daily-nav" aria-label="Pekerjaan utama">
            <button type="button" className={mode === 'today' ? '' : 'secondary'} onClick={() => setMode('today')}>Today</button>
            <button type="button" className={mode === 'continuity' ? '' : 'secondary'} onClick={() => openContinuity()}>Teaching</button>
            <button type="button" className={mode === 'rapid' ? '' : 'secondary'} onClick={() => openRapid()}>Rapid Correction</button>
            <button type="button" className={mode === 'assessments' ? '' : 'secondary'} onClick={() => setMode('assessments')}>Assessment</button>
            <button type="button" className={mode === 'reporting' ? '' : 'secondary'} onClick={() => setMode('reporting')}>Reporting</button>
          </nav>
          <details className="more-tools" open={['bulk','artifacts','recovery','setup'].includes(mode)}>
            <summary>Data, dokumen & alat lain</summary>
            <div className="tool-nav">
              <button type="button" className={mode === 'setup' ? '' : 'secondary'} onClick={() => setMode('setup')}>Data & Setup</button>
              <button type="button" className={mode === 'bulk' ? '' : 'secondary'} onClick={() => setMode('bulk')}>Bulk Entry / Import</button>
              <button type="button" className={mode === 'artifacts' ? '' : 'secondary'} onClick={() => setMode('artifacts')}>Artifacts</button>
              <button type="button" className={mode === 'recovery' ? '' : 'secondary'} onClick={() => setMode('recovery')}>Recovery</button>
            </div>
          </details>
          {logoutError ? <p className="form-error" role="alert">Gagal keluar: {logoutError}</p> : null}
          {mode === 'today' ? <Today client={client} userId={userId} workspaceId={workspaceId} onOpenContinuity={openContinuity} onOpenRapid={openRapid} /> : null}
          {mode === 'continuity' ? <TeachingContinuity client={client} worker={worker} userId={userId} workspaceId={workspaceId} initialClassId={continuityTarget} /> : null}
          {mode === 'assessments' ? <AssessmentManager client={client} workspaceId={workspaceId} /> : null}
          {mode === 'rapid' ? <RapidCorrection client={client} worker={worker} userId={userId} workspaceId={workspaceId} initialAssessmentId={rapidTarget} /> : null}
          {mode === 'bulk' ? <BulkAssessment client={client} workspaceId={workspaceId} /> : null}
          {mode === 'reporting' ? <Reporting client={client} workspaceId={workspaceId} /> : null}
          {mode === 'artifacts' ? <Artifacts client={client} workspaceId={workspaceId} /> : null}
          {mode === 'recovery' ? <BackupRestore client={client} /> : null}
          {mode === 'setup' ? <DailyDriverSetup client={client} workspaceId={workspaceId} onReady={()=>setMode('today')} /> : null}
        </main>
      )}
    </WorkspaceBootstrapGate>
  );
}

export function App() {
  const configResult = useMemo(() => readBrowserConfig(), []);
  const client = useMemo(() => configResult.ok ? getSupabaseClient(configResult.config) : null, [configResult]);
  const [auth, setAuth] = useState<AuthSnapshot>(initialAuthSnapshot);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadSession(client).then(snapshot => {
      if (active) setAuth(snapshot);
    });
    const subscription = subscribeToAuth(client, snapshot => {
      if (active) setAuth(snapshot);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  if (!configResult.ok) return <main className="app-shell"><StatusPanel title="Konfigurasi belum siap" tone="error"><p>Browser configuration tidak lengkap atau tidak aman.</p><p>Jangan gunakan service-role key di browser.</p></StatusPanel></main>;
  if (!client || auth.status === 'loading') return <main className="app-shell"><StatusPanel title="Memuat sesi…"><p>Memulihkan sesi Supabase Auth.</p></StatusPanel></main>;
  if (auth.status === 'signed-out') return <SignedOut client={client} authError={auth.error} />;
  return <SignedIn key={auth.session.user.id} client={client} userId={auth.session.user.id} email={auth.session.user.email ?? auth.session.user.id} />;
}
