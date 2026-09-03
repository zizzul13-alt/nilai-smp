import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StatusPanel } from '../components/StatusPanel';
import { readBrowserConfig } from '../config/env';
import { EXPECTED_SCHEMA_VERSION } from '../config/schema';
import { getSupabaseClient } from '../services/supabase/client';
import { initialAuthSnapshot, loadSession, signInWithPassword, signOut, subscribeToAuth, type AuthSnapshot } from '../services/auth/auth';
import { checkSchemaCompatibility, type SchemaCompatibility } from '../services/schema/schemaCompatibility';

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
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Nilai SMP · R3 foundation</p>
        <h1 id="login-title">Masuk</h1>
        <p className="muted">Gunakan akun Supabase Auth yang sudah disiapkan untuk workspace pribadi.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Kata sandi<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error ? <p className="form-error" role="alert">Gagal masuk: {error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
        </form>
      </section>
    </main>
  );
}

function SignedIn({ client, email }: { client: SupabaseClient; email: string }) {
  const [schema, setSchema] = useState<SchemaCompatibility | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void checkSchemaCompatibility(client, EXPECTED_SCHEMA_VERSION).then((result) => {
      if (active) setSchema(result);
    });
    return () => { active = false; };
  }, [client]);

  async function logout() {
    setLogoutError(await signOut(client));
  }

  if (!schema) {
    return <main className="app-shell"><StatusPanel title="Memeriksa kompatibilitas data…"><p>Foundation sedang memverifikasi versi schema.</p></StatusPanel></main>;
  }

  if (schema.status === 'incompatible') {
    return (
      <main className="app-shell">
        <StatusPanel title="Database belum kompatibel" tone="error">
          <p>{schema.reason}</p>
          <p>Expected: <code>{schema.expectedVersion}</code> · Current: <code>{schema.currentVersion ?? 'tidak terbaca'}</code></p>
          <p>Jangan lanjut menulis data sampai migration yang sesuai diterapkan.</p>
          <button type="button" onClick={logout}>Keluar</button>
        </StatusPanel>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="workspace-placeholder">
        <div>
          <p className="eyebrow">Foundation ready</p>
          <h1>Nilai SMP</h1>
          <p className="muted">Masuk sebagai {email}. Domain akademik R3 berikutnya belum diimplementasikan.</p>
        </div>
        <button type="button" className="secondary" onClick={logout}>Keluar</button>
        {logoutError ? <p className="form-error" role="alert">Gagal keluar: {logoutError}</p> : null}
      </section>
    </main>
  );
}

export function App() {
  const configResult = useMemo(() => readBrowserConfig(), []);
  const client = useMemo(() => configResult.ok ? getSupabaseClient(configResult.config) : null, [configResult]);
  const [auth, setAuth] = useState<AuthSnapshot>(initialAuthSnapshot);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadSession(client).then((snapshot) => { if (active) setAuth(snapshot); });
    const subscription = subscribeToAuth(client, (snapshot) => { if (active) setAuth(snapshot); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);

  if (!configResult.ok) {
    return (
      <main className="app-shell">
        <StatusPanel title="Konfigurasi belum siap" tone="error">
          <p>Browser configuration tidak lengkap atau tidak aman.</p>
          <ul>{configResult.errors.map((error) => <li key={error}>{error}</li>)}</ul>
          <p>Lihat <code>.env.example</code>. Jangan gunakan service-role key di browser.</p>
        </StatusPanel>
      </main>
    );
  }

  if (!client || auth.status === 'loading') {
    return <main className="app-shell"><StatusPanel title="Memuat sesi…"><p>Memulihkan sesi Supabase Auth.</p></StatusPanel></main>;
  }

  if (auth.status === 'signed-out') return <SignedOut client={client} authError={auth.error} />;
  return <SignedIn client={client} email={auth.session.user.email ?? auth.session.user.id} />;
}
