import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { LessonStudio } from '../components/LessonStudio';
import { PlannedTimetable } from '../components/PlannedTimetable';
import { TeacherBrief } from '../components/TeacherBrief';
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
        <p className="eyebrow">Nilai SMP</p>
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

type WorkspaceMode='today'|'continuity'|'assessments'|'rapid'|'bulk'|'reporting'|'artifacts'|'recovery'|'setup'|'lesson'|'timetable'|'brief';

function SignedIn({ client, email, userId }: { client: SupabaseClient; email: string; userId: string }) {
  const [schema, setSchema] = useState<SchemaCompatibility | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>('today');
  const [adminOpen,setAdminOpen]=useState(false);
  const [continuityTarget,setContinuityTarget]=useState<string|undefined>(undefined);
  const [rapidTarget,setRapidTarget]=useState<string|undefined>(undefined);
  const workspaceRef=useRef<HTMLDivElement>(null);
  const worker = useMemo(()=>new SafeWorkSyncWorker(safeWorkDb,client),[client]);

  const todayArea=mode==='today'||mode==='brief';
  const prepareArea=mode==='lesson'||mode==='artifacts';
  const teachingArea=mode==='continuity'||mode==='timetable';
  const gradingArea=mode==='rapid'||mode==='assessments'||mode==='bulk';
  const adminArea=mode==='setup'||mode==='recovery';

  useEffect(() => {
    let active = true;
    void checkSchemaCompatibility(client, EXPECTED_SCHEMA_VERSION).then(result => {
      if (active) setSchema(result);
    });
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    const workspace=workspaceRef.current;
    if (!workspace) return;
    workspace.scrollTo({top:0,behavior:'auto'});
    const target=workspace.querySelector<HTMLElement>('h1, h2, [role="status"]');
    if (!target) return;
    target.setAttribute('tabindex','-1');
    target.focus({preventScroll:true});
  }, [mode]);

  async function logout() {
    if (await hasUnsyncedForUser(safeWorkDb, userId)) {
      if (!window.confirm('Ada pekerjaan Pending Safe/FAILED/CONFLICT di perangkat ini. Pekerjaan tetap disimpan dalam namespace akun ini dan tidak terlihat oleh akun lain. Tetap keluar?')) return;
    }
    setLogoutError(await signOut(client));
  }
  function openMode(next:WorkspaceMode){setAdminOpen(false);setMode(next);}
  function openContinuity(classId?:string){setAdminOpen(false);setContinuityTarget(classId);setMode('continuity');}
  function openRapid(assessmentId?:string){setAdminOpen(false);setRapidTarget(assessmentId);setMode('rapid');}

  if (!schema) return <main className="app-shell"><StatusPanel title="Memeriksa kompatibilitas data…"><p>Memverifikasi versi schema.</p></StatusPanel></main>;
  if (schema.status === 'incompatible') return <main className="app-shell"><StatusPanel title="Database belum kompatibel" tone="error"><p>{schema.reason}</p><button onClick={logout}>Keluar</button></StatusPanel></main>;

  return (
    <WorkspaceBootstrapGate client={client} userId={userId} worker={worker} onLogout={logout} logoutError={logoutError}>
      {workspaceId => (
        <main className="teacher-shell">
          <div className="app-chrome">
            <header className="teacher-header">
              <div className="teacher-identity"><strong>Nilai SMP</strong><span>{email}</span></div>
              <div className="teacher-actions">
                <SafeWorkSummary userId={userId} workspaceId={workspaceId} onOpen={()=>openMode('today')} />
                <div className="admin-menu">
                  <button type="button" className={`secondary compact-action admin-trigger${adminArea?' admin-trigger--active':''}`} aria-label="Data & Pengaturan" aria-expanded={adminOpen} aria-controls="admin-popover" title="Data & Pengaturan" onClick={()=>setAdminOpen(open=>!open)}>⚙︎</button>
                  {adminOpen ? (
                    <div className="admin-popover" id="admin-popover" role="menu" aria-label="Administrasi">
                      <button type="button" role="menuitem" className={mode==='setup'?'':'secondary'} onClick={()=>openMode('setup')}>Data & Pengaturan</button>
                      <button type="button" role="menuitem" className={mode==='recovery'?'':'secondary'} onClick={()=>openMode('recovery')}>Pemulihan</button>
                    </div>
                  ) : null}
                </div>
                <button type="button" className="secondary compact-action" onClick={logout}>Keluar</button>
              </div>
            </header>

            <nav className="daily-nav" aria-label="Pekerjaan utama">
              <button type="button" className={`nav-item${todayArea?' nav-item--active':''}`} aria-current={todayArea?'page':undefined} onClick={() => openMode('today')}>Hari ini</button>
              <button type="button" className={`nav-item${prepareArea?' nav-item--active':''}`} aria-current={prepareArea?'page':undefined} onClick={() => openMode('lesson')}>Siapkan</button>
              <button type="button" className={`nav-item${teachingArea?' nav-item--active':''}`} aria-current={teachingArea?'page':undefined} onClick={() => openContinuity()}>Mengajar</button>
              <button type="button" className={`nav-item${gradingArea?' nav-item--active':''}`} aria-current={gradingArea?'page':undefined} onClick={() => openRapid()}>Nilai</button>
              <button type="button" className={`nav-item${mode==='reporting'?' nav-item--active':''}`} aria-current={mode==='reporting'?'page':undefined} onClick={() => openMode('reporting')}>Laporan</button>
            </nav>

            {todayArea ? (
              <nav className="context-nav" aria-label="Hari ini">
                <button type="button" className={mode==='today'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('today')}>Ringkasan</button>
                <button type="button" className={mode==='brief'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('brief')}>Brief Guru</button>
              </nav>
            ) : null}
            {prepareArea ? (
              <nav className="context-nav" aria-label="Siapkan">
                <button type="button" className={mode==='lesson'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('lesson')}>Materi</button>
                <button type="button" className={mode==='artifacts'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('artifacts')}>Dokumen</button>
              </nav>
            ) : null}
            {teachingArea ? (
              <nav className="context-nav" aria-label="Mengajar">
                <button type="button" className={mode==='continuity'?'context-tab context-tab--active':'context-tab'} onClick={()=>openContinuity()}>Kelas</button>
                <button type="button" className={mode==='timetable'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('timetable')}>Jadwal</button>
              </nav>
            ) : null}
            {gradingArea ? (
              <nav className="context-nav" aria-label="Nilai">
                <button type="button" className={mode==='rapid'?'context-tab context-tab--active':'context-tab'} onClick={()=>openRapid()}>Koreksi Cepat</button>
                <button type="button" className={mode==='assessments'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('assessments')}>Penilaian</button>
                <button type="button" className={mode==='bulk'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('bulk')}>Entri Massal</button>
              </nav>
            ) : null}
            {adminArea ? (
              <nav className="context-nav context-nav--admin" aria-label="Administrasi">
                <button type="button" className={mode==='setup'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('setup')}>Data & Pengaturan</button>
                <button type="button" className={mode==='recovery'?'context-tab context-tab--active':'context-tab'} onClick={()=>openMode('recovery')}>Pemulihan</button>
              </nav>
            ) : null}
          </div>

          <div className="workspace-scroll" ref={workspaceRef} tabIndex={-1}>
            {logoutError ? <p className="form-error" role="alert">Gagal keluar: {logoutError}</p> : null}
            {mode === 'today' ? <Today client={client} userId={userId} workspaceId={workspaceId} onOpenContinuity={openContinuity} onOpenRapid={openRapid} /> : null}
            {mode === 'continuity' ? <TeachingContinuity client={client} worker={worker} userId={userId} workspaceId={workspaceId} initialClassId={continuityTarget} onOpenLessonStudio={()=>openMode('lesson')} /> : null}
            {mode === 'assessments' ? <AssessmentManager client={client} workspaceId={workspaceId} /> : null}
            {mode === 'rapid' ? <RapidCorrection client={client} worker={worker} userId={userId} workspaceId={workspaceId} initialAssessmentId={rapidTarget} /> : null}
            {mode === 'bulk' ? <BulkAssessment client={client} workspaceId={workspaceId} /> : null}
            {mode === 'reporting' ? <Reporting client={client} workspaceId={workspaceId} /> : null}
            {mode === 'artifacts' ? <Artifacts client={client} workspaceId={workspaceId} /> : null}
            {mode === 'recovery' ? <BackupRestore client={client} /> : null}
            {mode === 'setup' ? <DailyDriverSetup client={client} workspaceId={workspaceId} onReady={()=>openMode('today')} /> : null}
            {mode === 'lesson' ? <LessonStudio client={client} workspaceId={workspaceId} onOpenSetup={()=>openMode('setup')} onOpenArtifacts={()=>openMode('artifacts')} onOpenTeaching={()=>openContinuity()} /> : null}
            {mode === 'timetable' ? <PlannedTimetable client={client} workspaceId={workspaceId} /> : null}
            {mode === 'brief' ? <TeacherBrief client={client} userId={userId} workspaceId={workspaceId} /> : null}
          </div>
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
