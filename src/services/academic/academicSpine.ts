import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcademicYear, Workspace } from '../../domain/academic';

export type AcademicContextDiagnostic = {
  workspace: Workspace;
  academicYears: AcademicYear[];
};

export async function bootstrapOwnedWorkspace(client: SupabaseClient): Promise<Workspace> {
  // Ownership is derived by the database RPC from auth.uid(); no workspace/user id is accepted here.
  const { data, error } = await client.rpc('bootstrap_personal_workspace');
  if (error) throw new Error(`Workspace bootstrap failed: ${error.message}`);
  if (!data) throw new Error('Workspace bootstrap returned no workspace.');
  return data as Workspace;
}

export async function loadOwnedAcademicContext(client: SupabaseClient): Promise<AcademicContextDiagnostic> {
  const workspace = await bootstrapOwnedWorkspace(client);
  // workspace_id is useful as a query key, but RLS remains the authorization boundary.
  const { data, error } = await client
    .from('academic_years')
    .select('id, workspace_id, identity_key, display_name, sort_order, status, starts_on, ends_on')
    .eq('workspace_id', workspace.id)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Academic context load failed: ${error.message}`);
  return { workspace, academicYears: (data ?? []) as AcademicYear[] };
}
