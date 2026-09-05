import { useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bootstrapOwnedWorkspace } from '../services/academic/academicSpine';
import { installReconnectSync, type SafeWorkSyncWorker } from '../services/safeWork/syncWorker';
import { StatusPanel } from './StatusPanel';

type BootstrapState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; workspaceId: string };

type Props = {
  client: SupabaseClient;
  userId: string;
  worker: SafeWorkSyncWorker;
  onLogout: () => void | Promise<void>;
  children: (workspaceId: string) => ReactNode;
  bootstrap?: typeof bootstrapOwnedWorkspace;
  installReconnect?: typeof installReconnectSync;
};

export function WorkspaceBootstrapGate({
  client,
  userId,
  worker,
  onLogout,
  children,
  bootstrap = bootstrapOwnedWorkspace,
  installReconnect = installReconnectSync,
}: Props) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ status: 'loading' });

  useEffect(() => {
    let disposed = false;
    let removeReconnect: (() => void) | undefined;

    setState({ status: 'loading' });
    void bootstrap(client).then(workspace => {
      if (disposed) return;
      const namespace = { authUserId: userId, workspaceId: workspace.id };
      setState({ status: 'ready', workspaceId: workspace.id });
      void worker.syncNamespace(namespace.authUserId, namespace.workspaceId);
      removeReconnect = installReconnect(worker, () => disposed ? null : namespace);
    }).catch(() => {
      if (!disposed) setState({ status: 'error' });
    });

    return () => {
      disposed = true;
      removeReconnect?.();
    };
  }, [attempt, bootstrap, client, installReconnect, userId, worker]);

  if (state.status === 'loading') {
    return <main className="app-shell"><StatusPanel title="Membuka workspace…"><p>Memulihkan konteks guru.</p></StatusPanel></main>;
  }

  if (state.status === 'error') {
    return (
      <main className="app-shell">
        <StatusPanel title="Tidak dapat membuka workspace" tone="error">
          <p>Data belum berhasil dimuat. Coba lagi saat koneksi atau layanan sudah siap.</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)}>Coba lagi</button>{' '}
          <button type="button" className="secondary" onClick={() => void onLogout()}>Keluar</button>
        </StatusPanel>
      </main>
    );
  }

  return <>{children(state.workspaceId)}</>;
}
