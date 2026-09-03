import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { loadSession, signOut, snapshotFromSession } from '../../src/services/auth/auth';

const session = { user: { id: 'teacher-1' } } as Session;

describe('auth foundation', () => {
  it('represents authenticated and unauthenticated state distinctly', () => {
    expect(snapshotFromSession(null).status).toBe('signed-out');
    expect(snapshotFromSession(session).status).toBe('signed-in');
  });

  it('loads a persisted session through the Supabase auth contract', async () => {
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }) } } as unknown as SupabaseClient;
    expect((await loadSession(client)).status).toBe('signed-in');
  });

  it('delegates logout to Supabase and returns a clear error contract', async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signOut: signOutMock } } as unknown as SupabaseClient;
    expect(await signOut(client)).toBeNull();
    expect(signOutMock).toHaveBeenCalledOnce();
  });
});
