import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingOperation, SyncResult } from '../../domain/safeWork';

export async function applyStudentRename(client: SupabaseClient, op: PendingOperation): Promise<SyncResult> {
  const { data, error } = await client.rpc('apply_student_rename_operation', {
    p_op_id: op.op_id,
    p_student_id: op.entity_id,
    p_display_name: op.payload.display_name,
    p_expected_revision: op.expected_revision
  });
  if (error) {
    if (error.code === 'PGRST301' || error.code === '42501') return { kind: 'retryable', code: 'AUTH_REQUIRED' };
    if (!navigator.onLine || error.code === 'PGRST000') return { kind: 'retryable', code: 'NETWORK' };
    return { kind: 'failed', code: error.code || 'SERVER_ERROR' };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { kind: 'failed', code: 'EMPTY_SERVER_RESULT' };
  if (row.outcome === 'conflict') return { kind: 'conflict', revision: Number(row.revision) };
  return { kind: 'saved', revision: Number(row.revision), replayed: Boolean(row.replayed) };
}
