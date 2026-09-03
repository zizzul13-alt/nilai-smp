import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

export type AuthSnapshot =
  | { status: 'loading'; session: null; error: null }
  | { status: 'signed-out'; session: null; error: string | null }
  | { status: 'signed-in'; session: Session; error: null };

export const initialAuthSnapshot: AuthSnapshot = { status: 'loading', session: null, error: null };

export function snapshotFromSession(session: Session | null): AuthSnapshot {
  return session
    ? { status: 'signed-in', session, error: null }
    : { status: 'signed-out', session: null, error: null };
}

export async function loadSession(client: SupabaseClient): Promise<AuthSnapshot> {
  const { data, error } = await client.auth.getSession();
  if (error) return { status: 'signed-out', session: null, error: error.message };
  return snapshotFromSession(data.session);
}

export async function signInWithPassword(client: SupabaseClient, email: string, password: string): Promise<string | null> {
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error?.message ?? null;
}

export async function signOut(client: SupabaseClient): Promise<string | null> {
  const { error } = await client.auth.signOut();
  return error?.message ?? null;
}

export function subscribeToAuth(client: SupabaseClient, onSession: (snapshot: AuthSnapshot, event: AuthChangeEvent) => void) {
  return client.auth.onAuthStateChange((event, session) => onSession(snapshotFromSession(session), event)).data.subscription;
}
