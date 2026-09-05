import type { PendingOperation, SafeWorkStatus } from '../../domain/safeWork';

export type CheckpointSafetyState = 'SAVED' | SafeWorkStatus;
export type CheckpointSafetyNotice = {
  state: CheckpointSafetyState;
  kind: 'info' | 'error';
  text: string;
};

export const MEETING_LIFECYCLE_BLOCKED_MESSAGE =
  'Checkpoint belum selesai disinkronkan. Complete/Cancel diblok sampai checkpoint lokal terselesaikan.';

export function checkpointSafetyNotice(operation: PendingOperation | undefined): CheckpointSafetyNotice {
  if (!operation) {
    return { state: 'SAVED', kind: 'info', text: 'Saved — server mengonfirmasi checkpoint.' };
  }

  const code = operation.last_error_code ? ` (${operation.last_error_code})` : '';
  switch (operation.status) {
    case 'PENDING_SAFE':
      return {
        state: 'PENDING_SAFE',
        kind: 'info',
        text: `Pending Safe — checkpoint durable di perangkat dan menunggu retry${code}.`,
      };
    case 'FAILED':
      return {
        state: 'FAILED',
        kind: 'error',
        text: `Failed — checkpoint durable di perangkat tetapi ditolak server / perlu tindakan${code}.`,
      };
    case 'CONFLICT':
      return {
        state: 'CONFLICT',
        kind: 'error',
        text: `Conflict — checkpoint durable di perangkat tetapi perlu penyelesaian manual${code}.`,
      };
  }
}

export function withCheckpointRefreshFailure(
  notice: CheckpointSafetyNotice,
  error?: unknown,
): CheckpointSafetyNotice {
  const detail = error instanceof Error ? error.message : error ? String(error) : 'unknown read error';
  return {
    ...notice,
    text: `${notice.text} Latest view could not refresh; retry view refresh. (${detail})`,
  };
}
