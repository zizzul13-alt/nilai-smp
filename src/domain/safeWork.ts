export type SafeWorkStatus = 'PENDING_SAFE' | 'FAILED' | 'CONFLICT';
export type UiWorkState = 'TRANSIENT' | SafeWorkStatus | 'SAVED';

export type StudentRenamePayload = { display_name: string };

export type PendingOperation = {
  op_id: string;
  auth_user_id: string;
  workspace_id: string;
  entity_type: 'student';
  entity_id: string;
  operation_kind: 'student.rename';
  payload: StudentRenamePayload;
  created_at: string;
  attempt_count: number;
  last_attempt_at: string | null;
  status: SafeWorkStatus;
  expected_revision: number;
  last_error_code: string | null;
};

export type SyncResult =
  | { kind: 'saved'; revision: number; replayed: boolean }
  | { kind: 'conflict'; revision: number }
  | { kind: 'retryable'; code: string }
  | { kind: 'failed'; code: string };
